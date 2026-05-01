# Study Planner WS Relay

Standalone WebSocket relay for real-time sync notifications. Platform-independent
(no Vercel/Supabase coupling).

## How it works

```
Browser A  ──push──>  FastAPI (Vercel)  ──POST /notify──>  WS Relay
                                                                │
Browser B  <──────────── WebSocket /ws/{user_id} ───────────────┘
```

- Browsers connect to `wss://your-relay/ws/{user_id}` and listen.
- Backend POSTs to `/notify` after writing to `sync_log`.
- Relay broadcasts the message to every socket subscribed to that `user_id`.

## Run locally

```bash
cd ws_server
pip install -r requirements.txt
python main.py
# → ws://localhost:8001/ws/{user_id}
```

## Deploy

### Fly.io
```bash
fly launch --no-deploy
fly secrets set WS_NOTIFY_SECRET=$(openssl rand -hex 32)
fly deploy
```

### Railway / Render / any Docker host
Just point the platform at this directory — the `Dockerfile` is self-contained.

## Environment variables

| Var | Purpose |
|---|---|
| `PORT` | TCP port (default `8001`) |
| `WS_NOTIFY_SECRET` | Shared secret. Backend must send `X-Notify-Secret` header matching this. Empty = no auth (dev only) |
| `WS_ALLOWED_ORIGINS` | CORS origins, comma-separated. Default `*` |

## Wire it up

**Frontend** — set `REACT_APP_WS_URL=wss://your-relay`

**Backend** (`api/`) — set:
- `WS_NOTIFY_URL=https://your-relay/notify`
- `WS_NOTIFY_SECRET=<same secret as the relay>`

## Endpoints

- `GET  /health` → `{ status, users, connections }`
- `WS   /ws/{user_id}` → listens for broadcasts
- `POST /notify` (header: `X-Notify-Secret`) → body `{ user_id, table, record_id, operation, revision }`
