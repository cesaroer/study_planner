from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.resource import ResourceCreate, ResourceUpdate

router = APIRouter()


@router.get("")
async def list_resources(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = sb.table("resources").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
    return resp.data


@router.post("")
async def create_resource(body: ResourceCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = sb.table("resources").insert({
        "user_id": uid,
        "title": body.title,
        "url": body.url,
        "description": body.description,
        "type": body.type,
        "tags": body.tags,
    }).execute()
    if not resp.data:
        raise HTTPException(status_code=400, detail="Could not create resource")
    return resp.data[0]


@router.put("/{resource_id}")
async def update_resource(resource_id: str, body: ResourceUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("resources").select("id").eq("id", resource_id).eq("user_id", uid).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    resp = sb.table("resources").update(updates).eq("id", resource_id).execute()
    return resp.data[0]


@router.delete("/{resource_id}")
async def delete_resource(resource_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("resources").select("id").eq("id", resource_id).eq("user_id", uid).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    sb.table("resources").delete().eq("id", resource_id).execute()
    return {"deleted": True, "id": resource_id}


@router.post("/activities/{act_id}/resources")
async def link_resource(act_id: str, body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resource_id = body.get("resource_id")
    if not resource_id:
        raise HTTPException(status_code=400, detail="resource_id is required")
    res_existing = sb.table("resources").select("id").eq("id", resource_id).eq("user_id", uid).maybe_single().execute()
    if not res_existing.data:
        raise HTTPException(status_code=404, detail="Resource not found")
    plan_act = sb.table("plan_activities").select("id, plans!inner(user_id)").eq("id", act_id).maybe_single().execute()
    week_act = sb.table("week_activities").select("id, weeks!inner(user_id)").eq("id", act_id).maybe_single().execute()
    insert_data: dict = {"resource_id": resource_id}
    if plan_act and plan_act.data and plan_act.data["plans"]["user_id"] == uid:
        insert_data["plan_activity_id"] = act_id
    elif week_act and week_act.data and week_act.data["weeks"]["user_id"] == uid:
        insert_data["week_activity_id"] = act_id
    else:
        raise HTTPException(status_code=404, detail="Activity not found")
    resp = sb.table("activity_resources").insert(insert_data).execute()
    return resp.data[0]
