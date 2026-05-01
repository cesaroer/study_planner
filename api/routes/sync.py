import uuid
import re
import logging
from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.utils import sb_single

logger = logging.getLogger(__name__)

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

router = APIRouter()


def _apply_week_activity(sb, uid: str, data: dict) -> None:
    """Apply a week_activity update to the actual table, matching by plan_activity_id + semana."""
    try:
        semana = data.get("semana")
        plan_activity_id = data.get("plan_activity_id")
        if not semana or not plan_activity_id:
            return

        # Resolve the cloud week for this user + date
        week_row = sb_single(
            sb.table("weeks").select("id").eq("user_id", uid).eq("week_start", semana)
        )
        if not week_row:
            return

        week_id = week_row["id"]
        # Find the activity in that week matching plan_activity_id
        act_row = sb_single(
            sb.table("week_activities")
            .select("id")
            .eq("week_id", week_id)
            .eq("plan_activity_id", plan_activity_id)
        )
        if not act_row:
            return

        # Update only the mutable fields that matter for sync
        updates = {"updated_at": "now()"}
        for field in ("completado", "kanban_status", "spent_minutes", "pomodoro_sessions"):
            if field in data:
                updates[field] = data[field]
        # kanbanStatus → kanban_status (JS camelCase → snake_case)
        if "kanbanStatus" in data and "kanban_status" not in updates:
            updates["kanban_status"] = data["kanbanStatus"]

        if len(updates) > 1:  # more than just updated_at
            sb.table("week_activities").update(updates).eq("id", act_row["id"]).execute()
    except Exception as exc:
        logger.warning("_apply_week_activity failed: %s", exc)


@router.get("/changes")
async def get_changes(since_revision: int = 0, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    resp = (
        sb.table("sync_log")
        .select("*")
        .eq("user_id", uid)
        .gt("revision", since_revision)
        .order("revision")
        .execute()
    )
    last_revision = since_revision
    changes = []
    for row in resp.data:
        last_revision = max(last_revision, row["revision"])
        changes.append({
            "revision": row["revision"],
            "op_id": row["op_id"],
            "table": row["table_name"],
            "operation": row["operation"],
            "record": row.get("data"),
        })
    return {"changes": changes, "last_revision": last_revision}


@router.post("/push")
async def push_changes(body: dict, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    changes = body.get("changes", [])
    results = []

    max_rev_resp = (
        sb.table("sync_log")
        .select("revision")
        .eq("user_id", uid)
        .order("revision", desc=True)
        .limit(1)
        .execute()
    )
    current_revision = max_rev_resp.data[0]["revision"] if max_rev_resp.data else 0

    for change in changes:
        op_id = change.get("op_id")
        if not op_id:
            results.append({"op_id": None, "status": "error", "detail": "Missing op_id"})
            continue

        # Normalise: if op_id is not a valid UUID (e.g. old "user-actId-ts" format),
        # generate a fresh one so the insert doesn't fail on the uuid column.
        insert_op_id = op_id if _UUID_RE.match(str(op_id)) else str(uuid.uuid4())

        existing = sb_single(sb.table("sync_log").select("op_id").eq("op_id", insert_op_id))
        if existing:
            results.append({"op_id": op_id, "status": "duplicate"})
            continue

        current_revision += 1
        table_name = change.get("table", "")
        data = change.get("data")
        sb.table("sync_log").insert({
            "user_id": uid,
            "op_id": insert_op_id,
            "table_name": table_name,
            "record_id": change.get("record_id", str(uuid.uuid4())),
            "operation": change.get("operation", "UPDATE"),
            "base_revision": change.get("base_revision", 0),
            "revision": current_revision,
            "data": data,
        }).execute()

        # Also apply week_activities changes to the actual table so all browsers
        # reading via REST API see consistent state
        if table_name == "week_activities" and data and change.get("operation") == "UPDATE":
            _apply_week_activity(sb, uid, data)

        results.append({"op_id": op_id, "status": "applied", "revision": current_revision})

    return {"results": results, "last_revision": current_revision}
