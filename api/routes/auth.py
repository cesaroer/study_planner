import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.auth import get_current_user
from api.database import get_supabase

router = APIRouter()


class RegisterBody(BaseModel):
    username: str


@router.get("/check/{username}")
async def check_user(username: str):
    sb = get_supabase()
    profile = sb.table("profiles").select("username").eq("username", username).maybe_single().execute()
    return {"exists": profile.data is not None}


@router.post("/register")
async def register_user(body: RegisterBody):
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username requerido")
    sb = get_supabase()
    existing = sb.table("profiles").select("id").eq("username", username).maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Ese usuario ya existe")
    user_id = str(uuid.uuid4())
    resp = sb.table("profiles").insert({
        "id": user_id,
        "username": username,
        "display_name": username,
    }).execute()
    sb.table("user_preferences").insert({"user_id": user_id}).execute()
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
