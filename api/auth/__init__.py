import logging
from fastapi import Header, HTTPException
from api.database import get_supabase

logger = logging.getLogger("auth")


async def get_current_user(x_username: str = Header(None)) -> dict:
    if not x_username:
        logger.warning("Missing X-Username header")
        raise HTTPException(status_code=401, detail="X-Username header required")
    logger.info(f"Auth request for user: {x_username}")
    sb = get_supabase()
    profile = sb.table("profiles").select("id, username").eq("username", x_username).maybe_single().execute()
    if not profile.data:
        logger.warning(f"User not found: {x_username}")
        raise HTTPException(status_code=401, detail="User not found")
    logger.info(f"User authenticated: {x_username} (id: {profile.data['id']})")
    return {"user_id": profile.data["id"], "username": x_username}
