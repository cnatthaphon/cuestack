from fastapi import FastAPI

app = FastAPI(title="IoT Stack — Pipeline Service", version="0.1.0")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "pipeline"}
