from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.activity import (
    PlanActivityCreate,
    PlanActivityUpdate,
    PlanActivityResponse,
    DAYS,
    ACTIVITY_TYPES,
)
from api.models.plan import PlanResponse

router = APIRouter()


def _validate_dia(dia: str):
    if dia not in DAYS:
        raise HTTPException(status_code=400, detail=f"Invalid dia: {dia}")


def _validate_tipo(tipo: str):
    if tipo not in ACTIVITY_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid tipo: {tipo}")


def _act_row_to_response(row: dict) -> dict:
    return {
        "id": row["id"],
        "plan_id": row["plan_id"],
        "dia": row["dia"],
        "actividad": row["actividad"],
        "tipo": row["tipo"],
        "icono": row["icono"],
        "orden": row.get("orden", 0),
        "tags": row.get("tags", []),
        "target_minutes": row.get("target_minutes", 0),
        "created_at": row["created_at"],
    }


def _verify_plan_owner(sb, plan_id: str, user_id: str):
    plan = sb.table("plans").select("id").eq("id", plan_id).eq("user_id", user_id).maybe_single().execute()
    if not plan.data:
        raise HTTPException(status_code=404, detail="Plan not found")


@router.get("/{plan_id}/activities")
async def get_plan_activities(plan_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    _verify_plan_owner(sb, plan_id, uid)
    resp = (
        sb.table("plan_activities")
        .select("*")
        .eq("plan_id", plan_id)
        .order("orden")
        .execute()
    )
    grouped: dict[str, list] = {d: [] for d in DAYS}
    for act in resp.data:
        grouped.setdefault(act["dia"], []).append(_act_row_to_response(act))
    return grouped


@router.post("/{plan_id}/activities")
async def add_plan_activity(plan_id: str, body: PlanActivityCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    _verify_plan_owner(sb, plan_id, uid)
    _validate_dia(body.dia)
    _validate_tipo(body.tipo)
    insert_data = {
        "plan_id": plan_id,
        "dia": body.dia,
        "actividad": body.actividad,
        "tipo": body.tipo,
        "icono": body.icono,
        "orden": body.orden,
        "tags": body.tags,
    }
    resp = sb.table("plan_activities").insert(insert_data).execute()
    if not resp.data:
        raise HTTPException(status_code=400, detail="Could not create activity")
    return _act_row_to_response(resp.data[0])


@router.put("/{plan_id}/activities/{act_id}")
async def update_plan_activity(plan_id: str, act_id: str, body: PlanActivityUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    _verify_plan_owner(sb, plan_id, uid)
    existing = (
        sb.table("plan_activities")
        .select("id")
        .eq("id", act_id)
        .eq("plan_id", plan_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Activity not found")
    updates = body.model_dump(exclude_none=True)
    if "tipo" in updates:
        _validate_tipo(updates["tipo"])
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    resp = sb.table("plan_activities").update(updates).eq("id", act_id).execute()
    return _act_row_to_response(resp.data[0])


@router.delete("/{plan_id}/activities/{act_id}")
async def delete_plan_activity(plan_id: str, act_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    _verify_plan_owner(sb, plan_id, uid)
    existing = (
        sb.table("plan_activities")
        .select("id")
        .eq("id", act_id)
        .eq("plan_id", plan_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Activity not found")
    sb.table("plan_activities").delete().eq("id", act_id).execute()
    return {"deleted": True, "id": act_id}


@router.post("/{plan_id}/activities/batch")
async def batch_plan_activities(plan_id: str, body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    _verify_plan_owner(sb, plan_id, uid)
    operations = body.get("operations", [])
    results = []
    for op in operations:
        action = op.get("action")
        try:
            if action == "add":
                act = op.get("activity", {})
                _validate_dia(act.get("dia", ""))
                _validate_tipo(act.get("tipo", ""))
                resp = sb.table("plan_activities").insert({
                    "plan_id": plan_id,
                    "dia": act["dia"],
                    "actividad": act.get("actividad", ""),
                    "tipo": act["tipo"],
                    "icono": act.get("icono", "📝"),
                    "orden": act.get("orden", 0),
                    "tags": act.get("tags", []),
                }).execute()
                results.append({"action": "add", "status": "ok", "id": resp.data[0]["id"] if resp.data else None})
            elif action == "update":
                act_id = op.get("activityId")
                updates = op.get("updates", {})
                if "tipo" in updates:
                    _validate_tipo(updates["tipo"])
                sb.table("plan_activities").update(updates).eq("id", act_id).eq("plan_id", plan_id).execute()
                results.append({"action": "update", "status": "ok", "id": act_id})
            elif action == "delete":
                act_id = op.get("activityId")
                sb.table("plan_activities").delete().eq("id", act_id).eq("plan_id", plan_id).execute()
                results.append({"action": "delete", "status": "ok", "id": act_id})
            elif action == "reorder":
                for ordering in op.get("orderings", []):
                    sb.table("plan_activities").update({"orden": ordering["orden"]}).eq("id", ordering["id"]).execute()
                results.append({"action": "reorder", "status": "ok"})
            else:
                results.append({"action": action, "status": "error", "detail": f"Unknown action: {action}"})
        except Exception as e:
            results.append({"action": action, "status": "error", "detail": str(e)})
    return {"results": results}
