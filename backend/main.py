import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from jose import jwt, JWTError

from blocks.base import PipelineContext
from pipelines import (
    create_ingest_pipeline, create_query_pipeline,
    create_summary_pipeline,
)
from scheduler import run_scheduler

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
    return {"status": "ok", "service": "pipeline"}


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
