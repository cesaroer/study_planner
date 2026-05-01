import uuid
import re
from fastapi import APIRouter, Depends, HTTPException
from api.auth import get_current_user
from api.database import get_supabase
from api.utils import sb_single

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

router = APIRouter()


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
        sb.table("sync_log").insert({
            "user_id": uid,
            "op_id": insert_op_id,
            "table_name": change.get("table", ""),
            "record_id": change.get("record_id", str(uuid.uuid4())),
            "operation": change.get("operation", "UPDATE"),
            "base_revision": change.get("base_revision", 0),
            "revision": current_revision,
            "data": change.get("data"),
        }).execute()
        results.append({"op_id": op_id, "status": "applied", "revision": current_revision})

    return {"results": results, "last_revision": current_revision}
