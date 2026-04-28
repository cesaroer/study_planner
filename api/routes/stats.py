from fastapi import APIRouter, Depends
from api.auth import get_current_user
from api.database import get_supabase

router = APIRouter()


@router.get("/completions")
async def get_completions(from_: str = "", to: str = "", user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    query = (
        sb.table("week_activities")
        .select("dia, completado, bloqueada, weeks!inner(user_id, week_start)")
        .eq("weeks.user_id", uid)
    )
    if from_:
        query = query.gte("weeks.week_start", from_)
    if to:
        query = query.lte("weeks.week_start", to)
    resp = query.execute()
    from datetime import datetime, timedelta

    DAYS_MAP = {
        "Lunes": 0, "Martes": 1, "Miércoles": 2, "Jueves": 3,
        "Viernes": 4, "Sábado": 5, "Domingo": 6,
    }
    completions: dict[str, dict] = {}
    for act in resp.data:
        if act.get("bloqueada"):
            continue
        week_data = act["weeks"]
        week_start = datetime.strptime(week_data["week_start"], "%Y-%m-%d")
        day_offset = DAYS_MAP.get(act["dia"], 0)
        activity_date = (week_start + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        if activity_date not in completions:
            completions[activity_date] = {"completed": 0, "total": 0}
        completions[activity_date]["total"] += 1
        if act.get("completado"):
            completions[activity_date]["completed"] += 1
    return completions


@router.get("/streak")
async def get_streak(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    from datetime import datetime, timedelta

    DAYS_MAP = {
        "Lunes": 0, "Martes": 1, "Miércoles": 2, "Jueves": 3,
        "Viernes": 4, "Sábado": 5, "Domingo": 6,
    }
    resp = (
        sb.table("week_activities")
        .select("dia, completado, bloqueada, weeks!inner(user_id, week_start)")
        .eq("weeks.user_id", uid)
        .eq("bloqueada", False)
        .execute()
    )
    daily: dict[str, dict] = {}
    for act in resp.data:
        week_data = act["weeks"]
        week_start = datetime.strptime(week_data["week_start"], "%Y-%m-%d")
        day_offset = DAYS_MAP.get(act["dia"], 0)
        activity_date = (week_start + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        if activity_date not in daily:
            daily[activity_date] = {"completed": 0, "total": 0}
        daily[activity_date]["total"] += 1
        if act.get("completado"):
            daily[activity_date]["completed"] += 1

    productive_days = sorted(
        d for d, v in daily.items() if v["completed"] > 0 and v["total"] > 0
    )
    if not productive_days:
        return {"current": 0, "max": 0, "last_date": ""}

    max_streak = 1
    current = 1
    for i in range(1, len(productive_days)):
        prev = datetime.strptime(productive_days[i - 1], "%Y-%m-%d")
        curr = datetime.strptime(productive_days[i], "%Y-%m-%d")
        if (curr - prev).days == 1:
            current += 1
        else:
            current = 1
        max_streak = max(max_streak, current)
    max_streak = max(max_streak, current)

    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    live_streak = 0
    check_date = today
    while check_date in daily and daily[check_date]["completed"] > 0:
        live_streak += 1
        check_date = (datetime.strptime(check_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    if live_streak == 0 and yesterday in daily and daily[yesterday]["completed"] > 0:
        check_date = yesterday
        while check_date in daily and daily[check_date]["completed"] > 0:
            live_streak += 1
            check_date = (datetime.strptime(check_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")

    return {
        "current": live_streak,
        "max": max_streak,
        "last_date": productive_days[-1] if productive_days else "",
    }


@router.get("/frequency")
async def get_frequency(week_start: str = "", user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    query = (
        sb.table("week_activities")
        .select("actividad, tipo, completado, weeks!inner(user_id, week_start)")
        .eq("weeks.user_id", uid)
        .eq("completado", True)
    )
    if week_start:
        query = query.eq("weeks.week_start", week_start)
    resp = query.execute()

    overall: dict[str, int] = {}
    by_type: dict[str, dict[str, int]] = {}
    for act in resp.data:
        name = act["actividad"]
        tipo = act["tipo"]
        overall[name] = overall.get(name, 0) + 1
        if tipo not in by_type:
            by_type[tipo] = {}
        by_type[tipo][name] = by_type[tipo].get(name, 0) + 1

    top_overall = max(overall.items(), key=lambda x: x[1]) if overall else None
    top_by_type = {}
    for tipo, acts in by_type.items():
        top = max(acts.items(), key=lambda x: x[1])
        top_by_type[tipo] = {"actividad": top[0], "count": top[1]}

    return {
        "overall": {"actividad": top_overall[0], "count": top_overall[1]} if top_overall else None,
        "by_type": top_by_type,
    }


@router.get("/overview")
async def get_overview(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    uid = user["user_id"]
    acts = (
        sb.table("week_activities")
        .select("completado, bloqueada, dia, weeks!inner(user_id)")
        .eq("weeks.user_id", uid)
        .execute()
    )
    weeks_resp = sb.table("weeks").select("id").eq("user_id", uid).execute()
    total = len([a for a in acts.data if not a.get("bloqueada")])
    completed = len([a for a in acts.data if a.get("completado") and not a.get("bloqueada")])
    total_weeks = len(weeks_resp.data)
    day_counts: dict[str, int] = {}
    for a in acts.data:
        if a.get("completado") and not a.get("bloqueada"):
            day_counts[a["dia"]] = day_counts.get(a["dia"], 0) + 1
    most_productive = max(day_counts.items(), key=lambda x: x[1])[0] if day_counts else "N/A"
    avg = round(total / max(total_weeks, 1), 2)
    return {
        "total_activities": total,
        "total_completed": completed,
        "completion_rate": round(completed / max(total, 1), 4),
        "total_weeks": total_weeks,
        "most_productive_day": most_productive,
        "avg_per_week": avg,
    }
