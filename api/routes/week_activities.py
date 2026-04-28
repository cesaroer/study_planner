from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.activity import WeekActivityCreate, WeekActivityUpdate, ACTIVITY_TYPES, DAYS

router = APIRouter()


def _verify_week_owner(sb, week_id: str, user_id: str):
    week = sb.table("weeks").select("id").eq("id", week_id).eq("user_id", user_id).maybe_single().execute()
    if not week.data:
        raise HTTPException(status_code=404, detail="Week not found")


def _verify_act_in_week(sb, act_id: str, week_id: str):
    act = sb.table("week_activities").select("id").eq("id", act_id).eq("week_id", week_id).maybe_single().execute()
    if not act.data:
        raise HTTPException(status_code=404, detail="Activity not found in this week")
    return act.data


def _act_to_response(row: dict) -> dict:
    return {
        "id": row["id"],
        "week_id": row["week_id"],
        "plan_activity_id": row.get("plan_activity_id"),
        "dia": row["dia"],
        "actividad": row["actividad"],
        "tipo": row["tipo"],
        "icono": row["icono"],
        "completado": row.get("completado", False),
        "bloqueada": row.get("bloqueada", False),
        "tags": row.get("tags", []),
        "target_minutes": row.get("target_minutes", 0),
        "spent_minutes": row.get("spent_minutes", 0),
        "pomodoro_sessions": row.get("pomodoro_sessions", 0),
        "orden": row.get("orden", 0),
        "updated_at": row.get("updated_at", ""),
    }


@router.get("/{week_id}/activities")
async def get_week_activities(week_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    resp = sb.table("week_activities").select("*").eq("week_id", week_id).order("orden").execute()
    return [_act_to_response(r) for r in resp.data]


@router.post("/{week_id}/activities")
async def add_week_activity(week_id: str, body: WeekActivityCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    _verify_week_owner(sb, week_id, uid)
    if body.dia not in DAYS:
        raise HTTPException(status_code=400, detail=f"Invalid dia: {body.dia}")
    if body.tipo not in ACTIVITY_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid tipo: {body.tipo}")
    insert_data = {
        "week_id": week_id,
        "dia": body.dia,
        "actividad": body.actividad,
        "tipo": body.tipo,
        "icono": body.icono,
        "orden": body.orden,
        "tags": body.tags,
    }
    resp = sb.table("week_activities").insert(insert_data).execute()
    if not resp.data:
        raise HTTPException(status_code=400, detail="Could not create activity")
    result = _act_to_response(resp.data[0])
    if body.sync_plan:
        pref = sb.table("user_preferences").select("active_plan_id").eq("user_id", uid).maybe_single().execute()
        active_plan_id = pref.data.get("active_plan_id") if pref.data else None
        if active_plan_id:
            sb.table("plan_activities").insert({
                "plan_id": active_plan_id,
                "dia": body.dia,
                "actividad": body.actividad,
                "tipo": body.tipo,
                "icono": body.icono,
                "orden": body.orden,
                "tags": body.tags,
            }).execute()
    return result


@router.put("/{week_id}/activities/{act_id}")
async def update_week_activity(week_id: str, act_id: str, body: WeekActivityUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    _verify_act_in_week(sb, act_id, week_id)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = "now()"
    resp = sb.table("week_activities").update(updates).eq("id", act_id).execute()
    return _act_to_response(resp.data[0])


@router.delete("/{week_id}/activities/{act_id}")
async def delete_week_activity(week_id: str, act_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    _verify_act_in_week(sb, act_id, week_id)
    sb.table("week_activities").delete().eq("id", act_id).execute()
    return {"deleted": True, "id": act_id}


@router.post("/{week_id}/activities/{act_id}/move")
async def move_week_activity(week_id: str, act_id: str, body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    _verify_act_in_week(sb, act_id, week_id)
    target_day = body.get("target_day")
    if target_day not in DAYS:
        raise HTTPException(status_code=400, detail=f"Invalid target_day: {target_day}")
    resp = sb.table("week_activities").update({"dia": target_day, "updated_at": "now()"}).eq("id", act_id).execute()
    return _act_to_response(resp.data[0])


@router.post("/{week_id}/check-all")
async def check_all(week_id: str, body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    dia = body.get("dia")
    acts = sb.table("week_activities").select("id").eq("week_id", week_id).eq("dia", dia).execute()
    updated = 0
    for act in acts.data:
        sb.table("week_activities").update({"completado": True, "updated_at": "now()"}).eq("id", act["id"]).execute()
        updated += 1
    return {"updated": updated}


@router.post("/{week_id}/uncheck-all")
async def uncheck_all(week_id: str, body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_week_owner(sb, week_id, user["user_id"])
    dia = body.get("dia")
    acts = sb.table("week_activities").select("id").eq("week_id", week_id).eq("dia", dia).execute()
    updated = 0
    for act in acts.data:
        sb.table("week_activities").update({"completado": False, "updated_at": "now()"}).eq("id", act["id"]).execute()
        updated += 1
    return {"updated": updated}
