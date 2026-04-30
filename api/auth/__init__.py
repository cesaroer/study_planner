from fastapi import Header, HTTPException
from api.database import get_supabase


async def get_current_user(x_username: str = Header(None)) -> dict:
    if not x_username:
        raise HTTPException(status_code=401, detail="X-Username header required")
    sb = get_supabase()
    profile = sb.table("profiles").select("id, username").eq("username", x_username).maybe_single().execute()
    if not profile.data:
        raise HTTPException(status_code=401, detail="User not found")
    return {"user_id": profile.data["id"], "username": x_username}
