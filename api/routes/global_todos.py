from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.models.global_todo import GlobalTodoCreate, GlobalTodoUpdate, GlobalTodoBatch
from api.utils import sb_single

router = APIRouter()

VALID_STATUSES = {"backlog", "todo", "in_progress", "done"}
VALID_PRIORITIES = {"low", "medium", "high"}


@router.get("/global-todos")
async def list_global_todos(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = sb.table("global_todos").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
    return resp.data or []


@router.post("/global-todos")
async def create_global_todo(body: GlobalTodoCreate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    row = {
        "id": body.id,
        "user_id": uid,
        "text": body.text,
        "completed": body.completed,
        "status": body.status,
        "description": body.description,
        "priority": body.priority,
        "tags": body.tags,
        "due_date": body.due_date,
    }
    resp = sb.table("global_todos").insert(row).execute()
    if not resp or not resp.data:
        raise HTTPException(status_code=400, detail="Could not create todo")
    return resp.data[0]


@router.put("/global-todos/{todo_id}")
async def update_global_todo(todo_id: str, body: GlobalTodoUpdate, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb_single(sb.table("global_todos").select("id, user_id").eq("id", todo_id))
    if not existing or existing["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Todo not found")
    updates = body.model_dump(exclude_none=True)
    if updates.get("status") and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if updates.get("priority") and updates["priority"] not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    if "due_date" in updates and updates["due_date"] is None:
        updates["due_date"] = ""
    updates["updated_at"] = "now()"
    if updates.get("status") == "done":
        updates["completed"] = True
    elif updates.get("status") and updates["status"] != "done":
        updates["completed"] = False
    resp = sb.table("global_todos").update(updates).eq("id", todo_id).execute()
    if not resp or not resp.data:
        raise HTTPException(status_code=400, detail="Could not update todo")
    return resp.data[0]


@router.delete("/global-todos/{todo_id}")
async def delete_global_todo(todo_id: str, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    existing = sb_single(sb.table("global_todos").select("id, user_id").eq("id", todo_id))
    if not existing or existing["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Todo not found")
    sb.table("global_todos").delete().eq("id", todo_id).execute()
    return {"deleted": True, "id": todo_id}


@router.put("/global-todos/batch/replace")
async def batch_replace_global_todos(body: GlobalTodoBatch, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    sb.table("global_todos").delete().eq("user_id", uid).execute()
    rows = []
    for todo in body.todos:
        if todo.status not in VALID_STATUSES:
            todo.status = "todo"
        if todo.priority not in VALID_PRIORITIES:
            todo.priority = "medium"
        rows.append({
            "id": todo.id,
            "user_id": uid,
            "text": todo.text,
            "completed": todo.completed,
            "status": todo.status,
            "description": todo.description,
            "priority": todo.priority,
            "tags": todo.tags,
            "due_date": todo.due_date,
        })
    if rows:
        resp = sb.table("global_todos").insert(rows).execute()
        return resp.data or []
    return []
