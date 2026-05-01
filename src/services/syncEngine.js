import { api } from './api';
import {
  getPendingOperations,
  updateOperationStatus,
  clearSyncedOperations,
  getSyncMeta,
  setSyncMeta,
  enqueueOperation,
  cacheWeekActivities,
  cacheWeekNotes,
  cacheGlobalTodos,
  cachePomodoroSessions,
} from './offlineQueue';
import { getWeek, getWeekActivityByPlanActivityId } from './dataService';

let isSyncing = false;
let listeners = [];

export function onSyncStatusChange(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyListeners(status) {
  for (const l of listeners) {
    l(status);
  }
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export async function pushPendingChanges(userId) {
  if (isSyncing || !isOnline()) return;
  isSyncing = true;
  notifyListeners('syncing');

  try {
    const pending = await getPendingOperations();
    if (pending.length === 0) {
      isSyncing = false;
      notifyListeners('synced');
      return;
    }

    const changes = pending.map((op) => ({
      op_id: op.op_id,
      table: op.table,
      operation: op.operation,
      record_id: op.record_id,
      base_revision: op.base_revision || 0,
      data: op.data,
    }));

    const result = await api.post('/sync/push', { changes });

    for (let i = 0; i < pending.length; i++) {
      const op = pending[i];
      const res = result.results?.[i];
      if (res && (res.status === 'applied' || res.status === 'duplicate')) {
        await updateOperationStatus(op.id, 'synced');
      } else {
        await updateOperationStatus(op.id, 'failed');
      }
    }

    await clearSyncedOperations();
    if (result.last_revision) {
      await setSyncMeta(userId, result.last_revision);
    }
  } catch (e) {
    console.error('Push failed:', e);
  } finally {
    isSyncing = false;
    notifyListeners(isOnline() ? 'synced' : 'offline');
  }
}

export async function pullChanges(userId) {
  if (!isOnline()) return;
  isSyncing = true;
  notifyListeners('syncing');

  try {
    const meta = await getSyncMeta(userId);
    const sinceRevision = meta?.last_revision || 0;
    const result = await api.get(`/sync/changes?since_revision=${sinceRevision}`);

    for (const change of result.changes || []) {
      switch (change.table) {
        case 'plans':
          if (change.operation === 'DELETE') {
            // handled by cache refresh
          } else {
            // handled by cache refresh
          }
          break;
        case 'week_activities':
          if (change.operation !== 'DELETE' && change.record) {
            const act = change.record;
            if (act.semana) {
              const localWeek = await getWeek(userId, act.semana);
              if (localWeek) {
                if (act.plan_activity_id) {
                  // Match by plan_activity_id so we update the local record in-place
                  // rather than inserting a foreign-ID duplicate
                  const localAct = await getWeekActivityByPlanActivityId(localWeek.id, act.plan_activity_id);
                  if (localAct) {
                    await cacheWeekActivities(localWeek.id, [{
                      ...localAct,
                      completado: act.completado,
                      kanbanStatus: act.kanbanStatus ?? localAct.kanbanStatus,
                      spent_minutes: act.spent_minutes ?? localAct.spent_minutes,
                      pomodoro_sessions: act.pomodoro_sessions ?? localAct.pomodoro_sessions,
                    }]);
                  } else {
                    await cacheWeekActivities(localWeek.id, [{ ...act, week_id: localWeek.id }]);
                  }
                } else {
                  await cacheWeekActivities(localWeek.id, [{ ...act, week_id: localWeek.id }]);
                }
              }
            } else {
              await cacheWeekActivities(act.week_id, [act]);
            }
          }
          break;
        case 'week_notes':
          if (change.operation !== 'DELETE' && change.record) {
            const notesMap = { [change.record.dia]: change.record.content };
            await cacheWeekNotes(change.record.week_id, notesMap);
          }
          break;
        case 'global_todos':
          if (change.operation === 'DELETE') {
            // handled by cache refresh
          } else if (change.record) {
            await cacheGlobalTodos(change.record.user_id, [change.record]);
          }
          break;
        case 'pomodoro_sessions':
          if (change.operation !== 'DELETE' && change.record) {
            await cachePomodoroSessions(change.record.user_id, [change.record]);
          }
          break;
        default:
          break;
      }
    }

    if (result.last_revision) {
      await setSyncMeta(userId, result.last_revision);
    }
  } catch (e) {
    console.error('Pull failed:', e);
  } finally {
    isSyncing = false;
    notifyListeners(isOnline() ? 'synced' : 'offline');
  }
}

export async function fullSync(userId) {
  if (!isOnline()) return;
  await pushPendingChanges(userId);
  await pullChanges(userId);
}

export async function queueAndSync(userId, operation) {
  const queued = await enqueueOperation(operation);
  if (isOnline()) {
    try {
      await pushPendingChanges(userId);
    } catch (e) {
      console.error('Immediate sync failed, will retry later:', e);
    }
  }
  return queued;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyListeners('syncing');
    const userId = localStorage.getItem('sync_user_id');
    if (userId) {
      fullSync(userId).catch(console.error);
    } else {
      notifyListeners('synced');
    }
  });

  window.addEventListener('offline', () => {
    notifyListeners('offline');
  });
}
