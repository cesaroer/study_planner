from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.todo import TodoCreate, TodoUpdate

router = APIRouter()


def _verify_act_owner(sb, week_activity_id: str, user_id: str):
    act = (
        sb.table("week_activities")
        .select("id, weeks!inner(user_id)")
        .eq("id", week_activity_id)
        .execute()
    )
    if not act.data or act.data[0]["weeks"]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Week activity not found")


@router.get("/week-activities/{week_activity_id}/todos")
async def get_todos(week_activity_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_act_owner(sb, week_activity_id, user["user_id"])
    resp = (
        sb.table("activity_todos")
        .select("*")
        .eq("week_activity_id", week_activity_id)
        .order("created_at")
        .execute()
    )
    return resp.data


@router.post("/week-activities/{week_activity_id}/todos")
async def add_todo(week_activity_id: str, body: TodoCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    _verify_act_owner(sb, week_activity_id, uid)
    resp = sb.table("activity_todos").insert({
        "user_id": uid,
        "week_activity_id": week_activity_id,
        "text": body.text,
    }).execute()
    if not resp.data:
        raise HTTPException(status_code=400, detail="Could not create todo")
    return resp.data[0]


@router.put("/todos/{todo_id}")
async def update_todo(todo_id: str, body: TodoUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("activity_todos").select("id, user_id").eq("id", todo_id).maybe_single().execute()
    if not existing.data or existing.data["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Todo not found")
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = "now()"
    resp = sb.table("activity_todos").update(updates).eq("id", todo_id).execute()
    return resp.data[0]


@router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("activity_todos").select("id, user_id").eq("id", todo_id).maybe_single().execute()
    if not existing.data or existing.data["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Todo not found")
    sb.table("activity_todos").delete().eq("id", todo_id).execute()
    return {"deleted": True, "id": todo_id}


@router.post("/week-activities/{week_activity_id}/todos/clear")
async def clear_completed_todos(week_activity_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    _verify_act_owner(sb, week_activity_id, user["user_id"])
    sb.table("activity_todos").delete().eq("week_activity_id", week_activity_id).eq("completed", True).execute()
    return {"cleared": True}


@router.get("/todos/inbox")
async def get_inbox(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = (
        sb.table("todo_inbox")
        .select("*")
        .eq("user_id", uid)
        .eq("reviewed", False)
        .order("created_at", desc=True)
        .execute()
    )
    return resp.data


@router.patch("/todos/inbox/{inbox_id}")
async def review_inbox_item(inbox_id: str, body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb.table("todo_inbox").select("id, user_id").eq("id", inbox_id).maybe_single().execute()
    if not existing.data or existing.data["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    updates = {}
    if body.get("reviewed") is not None:
        updates["reviewed"] = body["reviewed"]
    if updates:
        sb.table("todo_inbox").update(updates).eq("id", inbox_id).execute()
    return {"updated": True, "id": inbox_id}
