from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase

router = APIRouter()


@router.post("/profile")
async def create_or_get_profile(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    email = user.get("email", "")
    username = email.split("@")[0] if email else uid[:8]
    existing = sb.table("profiles").select("*").eq("id", uid).maybe_single().execute()
    if existing.data:
        return existing.data
    resp = sb.table("profiles").insert({
        "id": uid,
        "username": username,
        "display_name": username,
        "last_login": "now()",
    }).execute()
    sb.table("user_preferences").insert({"user_id": uid}).execute()
    return resp.data[0]


@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = sb.table("profiles").select("*").eq("id", uid).maybe_single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return resp.data


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    profile = sb.table("profiles").select("*").eq("id", uid).maybe_single().execute()
    prefs = sb.table("user_preferences").select("*").eq("user_id", uid).maybe_single().execute()
    return {
        "user_id": uid,
        "email": user.get("email"),
        "profile": profile.data,
        "preferences": prefs.data,
    }
