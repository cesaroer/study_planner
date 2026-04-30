import logging
from fastapi import Header, HTTPException
from api.database import get_supabase
from api.utils import sb_single

logger = logging.getLogger("auth")


async def get_current_user(x_username: str = Header(None)) -> dict:
    if not x_username:
        logger.warning("Missing X-Username header")
        raise HTTPException(status_code=401, detail="X-Username header required")
    logger.info(f"Auth request for user: {x_username}")
    sb = get_supabase()
    profile = sb_single(sb.table("profiles").select("id, username").eq("username", x_username))
    if not profile:
        logger.warning(f"User not found: {x_username}")
        raise HTTPException(status_code=401, detail="User not found")
    logger.info(f"User authenticated: {x_username} (id: {profile['id']})")
    return {"user_id": profile["id"], "username": x_username}
