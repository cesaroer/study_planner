from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.preferences import PreferencesUpdate

router = APIRouter()


@router.get("")
async def get_preferences(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = sb.table("user_preferences").select("*").eq("user_id", uid).maybe_single().execute()
    if not resp.data:
        sb.table("user_preferences").insert({"user_id": uid}).execute()
        resp = sb.table("user_preferences").select("*").eq("user_id", uid).maybe_single().execute()
    return resp.data


@router.put("")
async def update_preferences(body: PreferencesUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("user_preferences").select("user_id").eq("user_id", uid).maybe_single().execute()
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = "now()"
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if existing.data:
        resp = sb.table("user_preferences").update(updates).eq("user_id", uid).execute()
    else:
        updates["user_id"] = uid
        resp = sb.table("user_preferences").insert(updates).execute()
    return resp.data[0]
