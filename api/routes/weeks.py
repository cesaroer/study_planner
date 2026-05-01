from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.activity import DAYS
from api.utils import sb_single

router = APIRouter()


def _verify_week_owner(sb, week_id: str, user_id: str) -> dict:
    week = sb_single(sb.table("weeks").select("*").eq("id", week_id).eq("user_id", user_id))
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    return week


@router.get("")
async def get_week(week_start: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    week = sb_single(sb.table("weeks").select("*").eq("user_id", uid).eq("week_start", week_start))
    if not week:
        return {"week": None, "activities": [], "notes": {}}
    week_id = week["id"]
    acts = sb.table("week_activities").select("*").eq("week_id", week_id).order("orden").execute()
    notes = sb.table("week_notes").select("*").eq("week_id", week_id).execute()
    notes_map = {n["dia"]: n["content"] for n in (notes.data or [])}
    return {
        "week": week,
        "activities": acts.data or [],
        "notes": notes_map,
    }


@router.get("/range")
async def get_weeks_range(from_: str = "", to: str = "", user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    query = sb.table("weeks").select("*").eq("user_id", uid)
    if from_:
        query = query.gte("week_start", from_)
    if to:
        query = query.lte("week_start", to)
    resp = query.order("week_start").execute()
    return resp.data or []


@router.post("")
async def create_week(body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    week_start = body.get("week_start")
    plan_id = body.get("plan_id")
    if not week_start:
        raise HTTPException(status_code=400, detail="week_start is required")
    existing = sb_single(sb.table("weeks").select("id").eq("user_id", uid).eq("week_start", week_start))
    if existing:
        return existing
    resp = sb.table("weeks").insert({
        "user_id": uid,
        "plan_id": plan_id,
        "week_start": week_start,
    }).execute()
    return resp.data[0]


@router.post("/deploy")
async def deploy_week(body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    week_start = body.get("week_start")
    if not week_start:
        raise HTTPException(status_code=400, detail="week_start is required")

    pref = sb_single(sb.table("user_preferences").select("active_plan_id").eq("user_id", uid))
    active_plan_id = pref.get("active_plan_id") if pref else None
    if not active_plan_id:
        raise HTTPException(status_code=400, detail="No active plan set")

    existing = sb_single(sb.table("weeks").select("id").eq("user_id", uid).eq("week_start", week_start))
    if existing:
        sb.table("week_activities").delete().eq("week_id", existing["id"]).execute()
        week_id = existing["id"]
        sb.table("weeks").update({"plan_id": active_plan_id}).eq("id", week_id).execute()
    else:
        resp = sb.table("weeks").insert({
            "user_id": uid,
            "plan_id": active_plan_id,
            "week_start": week_start,
        }).execute()
        week_id = resp.data[0]["id"]

    plan_acts = sb.table("plan_activities").select("*").eq("plan_id", active_plan_id).order("orden").execute()
    deployed = 0
    for act in (plan_acts.data or []):
        sb.table("week_activities").insert({
            "week_id": week_id,
            "plan_activity_id": act["id"],
            "dia": act["dia"],
            "actividad": act["actividad"],
            "tipo": act["tipo"],
            "icono": act["icono"],
            "orden": act.get("orden", 0),
            "tags": act.get("tags", []),
            "target_minutes": act.get("target_minutes", 0),
        }).execute()
        deployed += 1

    return {"week_id": week_id, "deployed": deployed, "plan_id": active_plan_id}
