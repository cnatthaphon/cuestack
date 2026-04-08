"""JWT token helpers for backend services (scheduler, etc.)."""
import os
import time
from jose import jwt

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-prod")


def create_notebook_token(user_id, org_id, expires_hours=24):
    """Create a JWT token for notebook SDK access."""
    payload = {
        "sub": str(user_id),
        "org_id": org_id,
        "type": "notebook",
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_hours * 3600,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
