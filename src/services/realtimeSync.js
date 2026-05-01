// Real-time sync layer.
// - Plain WebSocket to a standalone relay (platform-independent, see ws_server/).
// - BroadcastChannel: instant cross-tab notification within the same browser
//   (no network needed). Fired right after a successful local push.
//
// Falls back gracefully when the WS URL is missing — the existing periodic
// poll continues to act as a safety net.

const CHANNEL_NAME = 'study-planner-sync';
const WS_URL = (process.env.REACT_APP_WS_URL || '').replace(/\/+$/, '');
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;

let ws = null;
let wsUserId = null;
let wsCallback = null;
let reconnectTimer = null;
let reconnectDelay = RECONNECT_INITIAL_MS;
let manualClose = false;

let bc = null;
let bcListener = null;

const getBroadcastChannel = () => {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return null;
  if (!bc) bc = new window.BroadcastChannel(CHANNEL_NAME);
  return bc;
};

function connectWebSocket() {
  if (!WS_URL || !wsUserId || !wsCallback) return;
  manualClose = false;
  try {
    const url = `${WS_URL}/ws/${encodeURIComponent(wsUserId)}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectDelay = RECONNECT_INITIAL_MS;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        wsCallback({ source: 'ws', ...data });
      } catch {
        wsCallback({ source: 'ws' });
      }
    };

    ws.onerror = () => {
      try { ws && ws.close(); } catch {}
    };

    ws.onclose = () => {
      ws = null;
      if (manualClose) return;
      // Exponential backoff with cap
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebSocket, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };
  } catch {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }
}

export function startRealtimeSync(userId, onRemoteChange) {
  stopRealtimeSync();
  if (!userId || typeof onRemoteChange !== 'function') return;

  // Same-browser cross-tab sync (instant, no network)
  const channel = getBroadcastChannel();
  if (channel) {
    bcListener = (event) => {
      const data = event?.data;
      if (!data || data.userId !== userId) return;
      if (data.type === 'sync-pushed') {
        onRemoteChange({ source: 'broadcast', table: data.table, recordId: data.recordId });
      }
    };
    channel.addEventListener('message', bcListener);
  }

  // Cross-device realtime via WebSocket relay
  if (WS_URL) {
    wsUserId = userId;
    wsCallback = onRemoteChange;
    reconnectDelay = RECONNECT_INITIAL_MS;
    connectWebSocket();
  }
}

export function stopRealtimeSync() {
  manualClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
  wsUserId = null;
  wsCallback = null;

  if (bc && bcListener) {
    try { bc.removeEventListener('message', bcListener); } catch {}
    bcListener = null;
  }
}

// Notify other tabs in the same browser that we just pushed a change
export function broadcastLocalPush(userId, table, recordId) {
  const channel = getBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'sync-pushed', userId, table, recordId, ts: Date.now() });
  } catch {}
}
