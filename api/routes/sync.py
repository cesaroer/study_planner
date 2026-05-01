import uuid
import re
import os
import time
import logging
import urllib.request
import urllib.error
import json
import threading
from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.utils import sb_single

logger = logging.getLogger(__name__)

WS_NOTIFY_URL = os.environ.get("WS_NOTIFY_URL", "")
WS_NOTIFY_SECRET = os.environ.get("WS_NOTIFY_SECRET", "")


def _notify_ws_relay(user_id: str, table: str, record_id: str, operation: str, revision: int) -> None:
    """Fire-and-forget POST to the WS relay so connected clients get a real-time event.
    Runs on a background thread so the request never blocks the user-facing response.
    Uses urllib (stdlib) so we don't add an HTTP-client dependency."""
    if not WS_NOTIFY_URL:
        return

    payload = json.dumps({
        "user_id": user_id,
        "table": table,
        "record_id": record_id,
        "operation": operation,
        "revision": revision,
        "ts": int(time.time()),
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if WS_NOTIFY_SECRET:
        headers["X-Notify-Secret"] = WS_NOTIFY_SECRET

    def _post():
        try:
            req = urllib.request.Request(WS_NOTIFY_URL, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=2) as _:
                pass
        except Exception as exc:
            logger.warning("ws notify failed: %s", exc)

    threading.Thread(target=_post, daemon=True).start()

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

        # Push a real-time event to other connected clients for this user
        _notify_ws_relay(uid, table_name, change.get("record_id", ""),
                         change.get("operation", "UPDATE"), current_revision)

        results.append({"op_id": op_id, "status": "applied", "revision": current_revision})

    return {"results": results, "last_revision": current_revision}
