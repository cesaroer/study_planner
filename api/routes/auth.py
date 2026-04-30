import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.auth import get_current_user
from api.database import get_supabase
from api.utils import sb_single

logger = logging.getLogger("auth")
router = APIRouter()


class RegisterBody(BaseModel):
    username: str


@router.get("/check/{username}")
async def check_user(username: str):
    logger.info(f"Check user request: {username}")
    sb = get_supabase()
    profile = sb_single(sb.table("profiles").select("username").eq("username", username))
    exists = profile is not None
    logger.info(f"User {username} exists: {exists}")
    return {"exists": exists}


@router.post("/register")
async def register_user(body: RegisterBody):
    username = body.username.strip()
    logger.info(f"Register request: {username}")
    if not username:
        logger.warning("Register: username empty")
        raise HTTPException(status_code=400, detail="username requerido")
    sb = get_supabase()
    existing = sb_single(sb.table("profiles").select("id").eq("username", username))
    if existing:
        logger.warning(f"Register: user already exists: {username}")
        raise HTTPException(status_code=409, detail="Ese usuario ya existe")
    user_id = str(uuid.uuid4())
    logger.info(f"Creating new user: {username} (id: {user_id})")
    resp = sb.table("profiles").insert({
        "id": user_id,
        "username": username,
        "display_name": username,
    }).execute()
    logger.info(f"User preferences insert for: {user_id}")
    sb.table("user_preferences").insert({"user_id": user_id}).execute()
    logger.info(f"User registered successfully: {username}")
    return resp.data[0]


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    profile = sb.table("profiles").select("*").eq("id", uid).maybe_single().execute()
    prefs = sb.table("user_preferences").select("*").eq("user_id", uid).maybe_single().execute()
    return {
        "user_id": uid,
        "username": user["username"],
        "profile": profile.data,
        "preferences": prefs.data,
    }
