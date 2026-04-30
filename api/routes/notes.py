from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.note import NoteUpdate
from api.utils import sb_single

router = APIRouter()


def _verify_week_owner(sb, week_id: str, user_id: str):
    week = sb_single(sb.table("weeks").select("id").eq("id", week_id).eq("user_id", user_id))
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")


@router.get("/{week_id}/notes")
async def get_notes(week_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    resp = sb.table("week_notes").select("*").eq("week_id", week_id).execute()
    return {n["dia"]: n["content"] for n in (resp.data or [])}


@router.put("/{week_id}/notes/{dia}")
async def save_note(week_id: str, dia: str, body: NoteUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    existing = sb_single(sb.table("week_notes").select("id").eq("week_id", week_id).eq("dia", dia))
    if existing:
        resp = sb.table("week_notes").update({"content": body.content, "updated_at": "now()"}).eq("id", existing["id"]).execute()
    else:
        resp = sb.table("week_notes").insert({"week_id": week_id, "dia": dia, "content": body.content}).execute()
    return resp.data[0]
