import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import jwt, JWTError

from blocks.base import PipelineContext
from pipelines import (
    create_ingest_pipeline, create_query_pipeline,
    create_summary_pipeline,
)
from scheduler import run_scheduler
import channels as ch

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-prod")


@asynccontextmanager
async def lifespan(app):
    # Start scheduler as background task
    task = asyncio.create_task(run_scheduler())
    yield
    task.cancel()


app = FastAPI(title="IoT Stack — Pipeline Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:8080")],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# --- Auth: verify JWT from Next.js cookie, extract org_id ---

async def require_auth(request: Request):
    """Verify JWT token from cookie. Returns payload with org_id."""
    token = request.cookies.get("iot-session")
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
        conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgresql://iot:iot123@db:5432/iotstack"))
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
                    cookie = websocket.cookies.get("iot-session")
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
        cookie = request.cookies.get("iot-session")
        if cookie:
            try:
                payload = jwt.decode(cookie, SECRET_KEY, algorithms=["HS256"])
                org_id = payload.get("org_id")
            except JWTError:
                pass

    if not org_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    count = await ch.publish(org_id, body.channel, body.data)
    return {"ok": True, "channel": body.channel, "subscribers": count}


@app.get("/api/channels/stats")
async def channel_stats():
    """Get real-time channel stats."""
    return ch.get_stats()
