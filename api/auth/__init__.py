from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
import time

from api.config import SUPABASE_JWKS_URL, SUPABASE_JWT_ISSUER

SUPABASE_JWT_AUDIENCE = "authenticated"
_jwks_cache: dict = {"keys": [], "expires_at": 0}

security = HTTPBearer()


async def get_jwks() -> list[dict]:
    if _jwks_cache["keys"] and time.time() < _jwks_cache["expires_at"]:
        return _jwks_cache["keys"]
    async with httpx.AsyncClient(timeout=5) as client:
        response = await client.get(SUPABASE_JWKS_URL)
        response.raise_for_status()
        payload = response.json()
    _jwks_cache["keys"] = payload.get("keys", [])
    _jwks_cache["expires_at"] = time.time() + 3600
    return _jwks_cache["keys"]


def pick_jwk(token: str, jwks: list[dict]) -> dict:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    for key in jwks:
        if key.get("kid") == kid:
            return key
    raise HTTPException(status_code=401, detail="Unknown signing key")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials
    try:
        jwks = await get_jwks()
        key = pick_jwk(token, jwks)
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=SUPABASE_JWT_AUDIENCE,
            issuer=SUPABASE_JWT_ISSUER,
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": user_id, "email": payload.get("email")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
