import logging
from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.plan import PlanCreate, PlanUpdate

logger = logging.getLogger("plans")
router = APIRouter()


def _plan_row_to_dict(row: dict, active_plan_id: str | None = None) -> dict:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "name": row["name"],
        "is_default": row.get("is_default", False),
        "is_active": row["id"] == active_plan_id if active_plan_id else False,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _get_active_plan_id(sb, user_id: str) -> str | None:
    pref = sb.table("user_preferences").select("active_plan_id").eq("user_id", user_id).maybe_single().execute()
    if pref.data:
        return pref.data.get("active_plan_id")
    return None


@router.get("")
async def list_plans(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    active_plan_id = _get_active_plan_id(sb, uid)
    resp = sb.table("plans").select("*").eq("user_id", uid).order("created_at").execute()
    return [_plan_row_to_dict(r, active_plan_id) for r in resp.data]


@router.post("")
async def create_plan(body: PlanCreate, user: dict = Depends(get_current_user)):
    logger.info(f"Create plan request - user: {user.get('username')}, plan name: {body.name}")
    sb = get_supabase()
    uid = user["user_id"]
    try:
        logger.info(f"Inserting plan into DB - user_id: {uid}, name: {body.name}")
        resp = sb.table("plans").insert({"user_id": uid, "name": body.name}).execute()
        if not resp.data:
            logger.error(f"Insert returned no data for user {uid}")
            raise HTTPException(status_code=400, detail="Could not create plan")
        row = resp.data[0]
        logger.info(f"Plan created successfully - plan_id: {row['id']}")
        active_plan_id = _get_active_plan_id(sb, uid)
        return _plan_row_to_dict(row, active_plan_id)
    except Exception as e:
        logger.error(f"Error creating plan for user {uid}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating plan: {str(e)}")


@router.put("/{plan_id}")
async def update_plan(plan_id: str, body: PlanUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("plans").select("*").eq("id", plan_id).eq("user_id", uid).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Plan not found")
    resp = sb.table("plans").update({"name": body.name, "updated_at": "now()"}).eq("id", plan_id).execute()
    active_plan_id = _get_active_plan_id(sb, uid)
    return _plan_row_to_dict(resp.data[0], active_plan_id)


@router.delete("/{plan_id}")
async def delete_plan(plan_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("plans").select("is_default").eq("id", plan_id).eq("user_id", uid).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Plan not found")
    if existing.data.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default plan")
    sb.table("plans").delete().eq("id", plan_id).execute()
    return {"deleted": True, "id": plan_id}


@router.patch("/{plan_id}/activate")
async def activate_plan(plan_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("plans").select("id").eq("id", plan_id).eq("user_id", uid).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Plan not found")
    pref = sb.table("user_preferences").select("user_id").eq("user_id", uid).maybe_single().execute()
    if pref.data:
        sb.table("user_preferences").update({"active_plan_id": plan_id}).eq("user_id", uid).execute()
    else:
        sb.table("user_preferences").insert({"user_id": uid, "active_plan_id": plan_id}).execute()
    active_plan_id = _get_active_plan_id(sb, uid)
    resp = sb.table("plans").select("*").eq("id", plan_id).execute()
    return _plan_row_to_dict(resp.data[0], active_plan_id)


@router.post("/{plan_id}/copy/{source_id}")
async def copy_plan(plan_id: str, source_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    target = sb.table("plans").select("id").eq("id", plan_id).eq("user_id", uid).maybe_single().execute()
    if not target.data:
        raise HTTPException(status_code=404, detail="Target plan not found")
    source = sb.table("plans").select("id").eq("id", source_id).eq("user_id", uid).maybe_single().execute()
    if not source.data:
        raise HTTPException(status_code=404, detail="Source plan not found")
    source_acts = (
        sb.table("plan_activities")
        .select("*")
        .eq("plan_id", source_id)
        .order("dia", desc=False)
        .order("orden", desc=False)
        .execute()
    )
    copied = 0
    for act in source_acts.data:
        sb.table("plan_activities").insert({
            "plan_id": plan_id,
            "dia": act["dia"],
            "actividad": act["actividad"],
            "tipo": act["tipo"],
            "icono": act["icono"],
            "orden": act["orden"],
            "tags": act.get("tags", []),
            "target_minutes": act.get("target_minutes", 0),
        }).execute()
        copied += 1
    return {"copied": copied, "plan_id": plan_id, "source_id": source_id}
