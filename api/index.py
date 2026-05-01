import logging
import traceback
import json
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.config import ENVIRONMENT

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("app")

app = FastAPI(
    title="Study Planner API",
    version="0.1.0",
    docs_url="/api/docs" if ENVIRONMENT == "development" else None,
    redoc_url="/api/redoc" if ENVIRONMENT == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb_lines = traceback.format_exc().splitlines()
    # Keep full traceback for logs, last 20 lines for response
    tb_short = "\n".join(tb_lines[-20:]) if len(tb_lines) > 20 else "\n".join(tb_lines)

    # Try to read request body (best effort, limited to 4 KB)
    body_preview = None
    try:
        raw = await request.body()
        if raw:
            text = raw.decode("utf-8", errors="replace")[:4096]
            try:
                body_preview = json.loads(text)
            except Exception:
                body_preview = text
    except Exception:
        pass

    # Extract Supabase / postgrest error details if present
    supabase_detail = None
    cause = getattr(exc, "__cause__", None) or getattr(exc, "__context__", None)
    for candidate in (exc, cause):
        if candidate is None:
            continue
        if hasattr(candidate, "json"):
            try:
                supabase_detail = candidate.json()
            except Exception:
                pass
        if supabase_detail is None and hasattr(candidate, "args") and candidate.args:
            arg = candidate.args[0]
            if isinstance(arg, dict):
                supabase_detail = arg

    error_payload = {
        "error": f"{type(exc).__name__}: {str(exc)}",
        "endpoint": f"{request.method} {request.url.path}",
        "traceback": tb_short,
    }
    if supabase_detail:
        error_payload["supabase"] = supabase_detail
    if body_preview is not None:
        error_payload["request_body"] = body_preview

    logger.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        "\n".join(tb_lines),
    )
    return JSONResponse(status_code=500, content={"detail": error_payload})


from api.routes import plans, plan_activities, weeks, week_activities
from api.routes import notes, todos, tags, resources, stats, preferences, auth, sync
from api.routes import global_todos
from api.routes import pomodoro

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(plans.router, prefix="/api/plans", tags=["plans"])
app.include_router(plan_activities.router, prefix="/api/plans", tags=["plan-activities"])
app.include_router(weeks.router, prefix="/api/weeks", tags=["weeks"])
app.include_router(week_activities.router, prefix="/api/weeks", tags=["week-activities"])
app.include_router(notes.router, prefix="/api/weeks", tags=["notes"])
app.include_router(todos.router, prefix="/api", tags=["todos"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(resources.router, prefix="/api/resources", tags=["resources"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(preferences.router, prefix="/api/preferences", tags=["preferences"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(global_todos.router, prefix="/api", tags=["global-todos"])
app.include_router(pomodoro.router, prefix="/api", tags=["pomodoro"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
