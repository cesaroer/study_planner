// Real-time sync layer.
// - Supabase Realtime: subscribes to sync_log INSERTs filtered by user_id, so any
//   change pushed from another browser/device triggers an immediate pullChanges.
// - BroadcastChannel: instant cross-tab notification within the same browser
//   (no network needed). Fired right after a successful local push.
//
// Both fall back gracefully when not available — the existing periodic poll
// continues to act as a safety net.

import { getRealtimeClient, isRealtimeConfigured } from './supabaseClient';

const CHANNEL_NAME = 'study-planner-sync';

let supaChannel = null;
let supaUserId = null;
let bc = null;
let bcListener = null;

const getBroadcastChannel = () => {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return null;
  if (!bc) bc = new window.BroadcastChannel(CHANNEL_NAME);
  return bc;
};

export function startRealtimeSync(userId, onRemoteChange) {
  stopRealtimeSync();
  if (!userId || typeof onRemoteChange !== 'function') return;

  // Same-browser cross-tab sync
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

  // Cross-device realtime via Supabase
  if (isRealtimeConfigured) {
    const client = getRealtimeClient();
    if (client) {
      try {
        supaUserId = userId;
        supaChannel = client
          .channel(`sync-log-${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'sync_log',
              filter: `user_id=eq.${userId}`,
            },
            (payload) => {
              const row = payload?.new;
              if (!row) return;
              onRemoteChange({
                source: 'supabase',
                table: row.table_name,
                recordId: row.record_id,
                revision: row.revision,
              });
            },
          )
          .subscribe();
      } catch {
        supaChannel = null;
      }
    }
  }
}

export function stopRealtimeSync() {
  if (supaChannel) {
    try {
      const client = getRealtimeClient();
      if (client) client.removeChannel(supaChannel);
    } catch {}
    supaChannel = null;
    supaUserId = null;
  }
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
