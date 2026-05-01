"""Standalone WebSocket relay for real-time sync notifications.

Clients connect to /ws/{user_id}. The application backend posts to /notify
whenever a sync_log entry is created. The relay broadcasts the notification
to every WebSocket connected for that user_id.

Platform-independent: runs anywhere that supports long-lived TCP (Fly.io,
Railway, Render, a VPS, or locally). No vendor SDKs.
"""
import asyncio
import json
import logging
import os
import time
from collections import defaultdict

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("ws-relay")

NOTIFY_SECRET = os.environ.get("WS_NOTIFY_SECRET", "")
ALLOWED_ORIGINS = os.environ.get("WS_ALLOWED_ORIGINS", "*").split(",")

app = FastAPI(title="Study Planner WS Relay", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# user_id -> set of connected WebSockets
clients: dict[str, set[WebSocket]] = defaultdict(set)
clients_lock = asyncio.Lock()


@app.websocket("/ws/{user_id}")
async def ws_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    async with clients_lock:
        clients[user_id].add(websocket)
    logger.info("connected user=%s total=%d", user_id, len(clients[user_id]))
    try:
        while True:
            # Block on receive so we detect disconnects. Inbound messages are ignored
            # (the client only listens), but we accept ping frames automatically.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("ws error user=%s: %s", user_id, exc)
    finally:
        async with clients_lock:
            clients[user_id].discard(websocket)
            if not clients[user_id]:
                clients.pop(user_id, None)
        logger.info("disconnected user=%s", user_id)


@app.post("/notify")
async def notify(payload: dict, x_notify_secret: str = Header(default="")):
    if NOTIFY_SECRET and x_notify_secret != NOTIFY_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    message = json.dumps({
        "table": payload.get("table"),
        "record_id": payload.get("record_id"),
        "operation": payload.get("operation"),
        "revision": payload.get("revision"),
        "ts": payload.get("ts") or int(time.time()),
    })

    async with clients_lock:
        targets = list(clients.get(user_id, set()))

    sent = 0
    for ws in targets:
        try:
            await ws.send_text(message)
            sent += 1
        except Exception:
            async with clients_lock:
                clients.get(user_id, set()).discard(ws)
    return {"sent": sent, "subscribers": len(targets)}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "users": len(clients),
        "connections": sum(len(v) for v in clients.values()),
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
