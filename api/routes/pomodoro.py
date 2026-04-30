from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.pomodoro import PomodoroSessionCreate

router = APIRouter()


@router.get("/pomodoro/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = (
        sb.table("pomodoro_sessions")
        .select("*")
        .eq("user_id", uid)
        .order("completed_at", desc=True)
        .limit(100)
        .execute()
    )
    return resp.data


@router.post("/pomodoro/sessions")
async def create_session(body: PomodoroSessionCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    row = {
        "id": body.id,
        "user_id": uid,
        "week_activity_id": body.week_activity_id,
        "activity_name": body.activity_name,
        "activity_type": body.activity_type,
        "duration_minutes": body.duration_minutes,
        "phase": body.phase,
    }
    resp = sb.table("pomodoro_sessions").insert(row).execute()
    if not resp.data:
        raise HTTPException(status_code=400, detail="Could not create session")
    return resp.data[0]


@router.get("/pomodoro/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = (
        sb.table("pomodoro_sessions")
        .select("activity_type, duration_minutes, phase, completed_at")
        .eq("user_id", uid)
        .eq("phase", "work")
        .execute()
    )
    total_minutes = sum(r.get("duration_minutes", 0) for r in resp.data)
    total_sessions = len(resp.data)
    by_type = {}
    for r in resp.data:
        t = r.get("activity_type", "Otro")
        if t not in by_type:
            by_type[t] = {"sessions": 0, "minutes": 0}
        by_type[t]["sessions"] += 1
        by_type[t]["minutes"] += r.get("duration_minutes", 0)
    return {
        "total_sessions": total_sessions,
        "total_minutes": total_minutes,
        "by_type": by_type,
    }


@router.delete("/pomodoro/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = (
        sb.table("pomodoro_sessions")
        .select("id, user_id")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )
    if not existing.data or existing.data["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Session not found")
    sb.table("pomodoro_sessions").delete().eq("id", session_id).execute()
    return {"deleted": True, "id": session_id}
