import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from jose import jwt, JWTError

from blocks.base import PipelineContext
from pipelines import (
    create_ingest_pipeline, create_query_pipeline,
    create_summary_pipeline,
)
from scheduler import run_scheduler
from mqtt_bridge import run_mqtt_bridge
from service_manager import run_service_manager
import channels as ch
import clickhouse_client
import export as export_module

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    import warnings
    warnings.warn("SECRET_KEY not set — using dev default. DO NOT use in production.", stacklevel=1)
    SECRET_KEY = "dev-only-not-for-production"
MQTT_BROKER = os.getenv("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

# MQTT client for publishing commands from HTTP/WebSocket to MQTT broker
_mqtt_publisher = None

def get_mqtt_publisher():
    """Lazy-init MQTT publisher for forwarding commands to devices."""
    global _mqtt_publisher
    if _mqtt_publisher is None:
        try:
            import paho.mqtt.client as mqtt_client
            _mqtt_publisher = mqtt_client.Client(
                mqtt_client.CallbackAPIVersion.VERSION2,
                client_id="cuestack-cmd-publisher"
            )
            _mqtt_publisher.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            _mqtt_publisher.loop_start()
        except Exception:
            pass
    return _mqtt_publisher


@asynccontextmanager
async def lifespan(app):
    # Start background tasks
    scheduler_task = asyncio.create_task(run_scheduler())
    mqtt_task = asyncio.create_task(run_mqtt_bridge())
    service_task = asyncio.create_task(run_service_manager())
    yield
    scheduler_task.cancel()
    mqtt_task.cancel()
    service_task.cancel()


app = FastAPI(title="CueStack — Pipeline Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:8080")],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "X-Channel-Token", "Cookie"],
)


# --- Auth: verify JWT from Next.js cookie, extract org_id ---

async def require_auth(request: Request):
    """Verify JWT token from cookie. Returns payload with org_id."""
    token = request.cookies.get("cuestack-session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_org_id(user: dict) -> str | None:
    """Extract org_id from JWT payload. Super admins have no org_id."""
    return user.get("org_id")


# --- Health ---

@app.get("/api/health")
def health():
    checks = {"service": "ok", "database": "unknown", "scheduler": "running"}
    try:
        import psycopg2
        conn = psycopg2.connect(os.getenv("DATABASE_URL", ""))
        cur = conn.cursor()
        cur.execute("SELECT 1")
        conn.close()
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    healthy = all(v in ("ok", "running") for v in checks.values())
    return {"status": "healthy" if healthy else "degraded", "checks": checks}


# --- Pipeline Info (no auth) ---

@app.get("/api/pipeline/info")
async def pipeline_info():
    return {
        "pipelines": [
            {"name": "ingest", "blocks": "Validate → Transform → Store"},
            {"name": "query", "blocks": "Query → Aggregate → Format(json)"},
            {"name": "summary", "blocks": "Query → Aggregate → Format(summary)"},
            {"name": "export", "blocks": "Query → Aggregate → Format(csv)"},
        ],
    }


# --- Ingest ---

class IngestRequest(BaseModel):
    data: list[dict]


@app.post("/api/pipeline/ingest")
async def pipeline_ingest(body: IngestRequest, user=Depends(require_auth)):
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Org context required for pipeline operations")

    pipeline = create_ingest_pipeline()
    ctx = PipelineContext(org_id=org_id, raw_data=body.data)
    ctx = await pipeline.run(ctx)
    return {
        "ok": ctx.ok,
        "validated": len(ctx.records),
        "events": ctx.events,
        "errors": ctx.errors,
    }


# --- Query ---

@app.get("/api/pipeline/query")
async def pipeline_query(
    device_id: str | None = None,
    metric: str | None = None,
    user=Depends(require_auth),
):
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Org context required for pipeline operations")

    pipeline = create_query_pipeline()
    ctx = PipelineContext(org_id=org_id, raw_data={"device_id": device_id, "metric": metric})
    ctx = await pipeline.run(ctx)
    return ctx.response


# --- Summary ---

@app.get("/api/pipeline/summary")
async def pipeline_summary(user=Depends(require_auth)):
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Org context required for pipeline operations")

    pipeline = create_summary_pipeline()
    ctx = PipelineContext(org_id=org_id, raw_data={})
    ctx = await pipeline.run(ctx)
    return ctx.response


# --- WebSocket channels ---

@app.websocket("/ws/channels")
async def ws_channels(websocket: WebSocket):
    """WebSocket endpoint for real-time channel subscription.

    Client sends: {"action": "subscribe", "channel": "sensors/temp", "token": "cht_..."}
    Server sends: {"channel": "sensors/temp", "data": {...}, "timestamp": "..."}
    """
    await websocket.accept()
    org_id = None

    try:
        while True:
            msg = await websocket.receive_json()
            action = msg.get("action")

            # Authenticate on first message (token or JWT cookie)
            if not org_id:
                token = msg.get("token")
                if token:
                    auth = ch.authenticate_token(token)
                    if auth:
                        org_id = auth["org_id"]
                    else:
                        await websocket.send_json({"error": "Invalid token"})
                        continue
                else:
                    # Try JWT from cookie
                    cookie = websocket.cookies.get("cuestack-session")
                    if cookie:
                        try:
                            payload = jwt.decode(cookie, SECRET_KEY, algorithms=["HS256"])
                            org_id = payload.get("org_id")
                        except JWTError:
                            pass
                    if not org_id:
                        await websocket.send_json({"error": "Authentication required"})
                        continue

            if action == "subscribe":
                channel = msg.get("channel")
                if channel:
                    valid = ch.get_org_channels(org_id)
                    if channel in valid:
                        await ch.subscribe(websocket, org_id, channel)
                        await websocket.send_json({"subscribed": channel})
                        # Send recent messages
                        for m in ch.get_recent(org_id, channel, 10):
                            await websocket.send_json(m)
                    else:
                        await websocket.send_json({"error": f"Channel '{channel}' not found"})

            elif action == "unsubscribe":
                channel = msg.get("channel")
                if channel:
                    await ch.unsubscribe(websocket, org_id, channel)
                    await websocket.send_json({"unsubscribed": channel})

            elif action == "publish":
                channel = msg.get("channel")
                data = msg.get("data", {})
                if channel and org_id:
                    count = await ch.publish(org_id, channel, data)
                    # Forward to MQTT broker for device-subscribed channels
                    try:
                        org_short = org_id.replace("-", "")[:8]
                        mqtt_topic = f"org/{org_short}/{channel}"
                        publisher = get_mqtt_publisher()
                        if publisher:
                            import json as _json
                            publisher.publish(mqtt_topic, _json.dumps(data))
                    except Exception:
                        pass
                    await websocket.send_json({"published": channel, "subscribers": count})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        pass
    finally:
        await ch.disconnect(websocket)


# --- Channel publish (HTTP) ---

class PublishRequest(BaseModel):
    channel: str
    data: dict


@app.post("/api/channels/publish")
async def channel_publish(body: PublishRequest, request: Request):
    """Publish data to a channel via HTTP (for devices/scripts)."""
    # Auth via token header or JWT cookie
    token = request.headers.get("X-Channel-Token") or request.headers.get("Authorization", "").replace("Bearer ", "")
    org_id = None

    if token and token.startswith("cht_"):
        auth = ch.authenticate_token(token)
        if auth:
            org_id = auth["org_id"]
    else:
        # Try JWT
        cookie = request.cookies.get("cuestack-session")
        if cookie:
            try:
                payload = jwt.decode(cookie, SECRET_KEY, algorithms=["HS256"])
                org_id = payload.get("org_id")
            except JWTError:
                pass

    if not org_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    count = await ch.publish(org_id, body.channel, body.data)

    # Also forward to MQTT broker so MQTT-subscribed devices receive commands
    try:
        org_short = org_id.replace("-", "")[:8]
        mqtt_topic = f"org/{org_short}/{body.channel}"
        publisher = get_mqtt_publisher()
        if publisher:
            import json as _json
            publisher.publish(mqtt_topic, _json.dumps(body.data))
    except Exception:
        pass  # Best-effort MQTT forwarding

    return {"ok": True, "channel": body.channel, "subscribers": count}


@app.get("/api/channels/stats")
async def channel_stats():
    """Get real-time channel stats."""
    return ch.get_stats()


# --- Data Events (ClickHouse) ---

class InsertEventRequest(BaseModel):
    channel: str
    source: str = "api"
    payload: dict


@app.post("/api/v1/data/events")
async def create_event(body: InsertEventRequest, user=Depends(require_auth)):
    """Insert a data event into ClickHouse."""
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Org context required")
    await clickhouse_client.insert_event(
        org_id=org_id, channel=body.channel,
        source=body.source, payload=body.payload,
    )
    return {"status": "ok"}


@app.get("/api/v1/data/events")
async def get_events(
    channel: str = None, source: str = None,
    start: str = None, end: str = None, limit: int = 100,
    user=Depends(require_auth),
):
    """Query data events from ClickHouse."""
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Org context required")
    events = await clickhouse_client.query_events(
        org_id=org_id, channel=channel, source=source,
        start=start, end=end, limit=limit,
    )
    return {"events": events}


@app.get("/api/v1/data/export")
async def export_data(
    channel: str = None, start: str = None, end: str = None,
    user=Depends(require_auth),
):
    """Export data events as SQLite file download."""
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Org context required")
    path = await export_module.export_sqlite(
        org_id=org_id, channel=channel, start=start, end=end,
    )
    return FileResponse(path, filename="cuestack_export.db",
                        media_type="application/x-sqlite3")


@app.get("/api/v1/data/audit")
async def get_audit(
    entity_type: str = None, entity_id: str = None, limit: int = 50,
    user=Depends(require_auth),
):
    """Query audit log from ClickHouse."""
    org_id = get_org_id(user)
    if not org_id:
        raise HTTPException(status_code=403, detail="Org context required")
    events = await clickhouse_client.query_audit(
        org_id=org_id, entity_type=entity_type,
        entity_id=entity_id, limit=limit,
    )
    return {"events": events}
