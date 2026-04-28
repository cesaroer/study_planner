from fastapi import APIRouter, Depends
from api.auth import get_current_user
from api.database import get_supabase

router = APIRouter()


@router.get("")
async def get_tags(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    plan_resp = sb.rpc("get_unique_plan_tags", {"p_user_id": uid}).execute()
    week_resp = sb.rpc("get_unique_week_tags", {"p_user_id": uid}).execute()
    plan_tags = plan_resp.data if plan_resp.data else []
    week_tags = week_resp.data if week_resp.data else []
    all_tags = sorted(set(plan_tags + week_tags))
    return all_tags
