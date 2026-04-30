import { openDB } from 'idb';

const DB_NAME = 'studyplanner_offline';
const DB_VERSION = 4;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('plans')) {
          db.createObjectStore('plans', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('plan_activities')) {
          const store = db.createObjectStore('plan_activities', { keyPath: 'id' });
          store.createIndex('plan_id', 'plan_id');
          store.createIndex('plan_id_dia', ['plan_id', 'dia']);
        }
        if (!db.objectStoreNames.contains('weeks')) {
          const store = db.createObjectStore('weeks', { keyPath: 'id' });
          store.createIndex('user_id', 'user_id');
          store.createIndex('week_start', 'week_start');
        }
        if (!db.objectStoreNames.contains('week_activities')) {
          const store = db.createObjectStore('week_activities', { keyPath: 'id' });
          store.createIndex('week_id', 'week_id');
          store.createIndex('week_id_dia', ['week_id', 'dia']);
        }
        if (!db.objectStoreNames.contains('week_notes')) {
          const store = db.createObjectStore('week_notes', { keyPath: ['week_id', 'dia'] });
          store.createIndex('week_id', 'week_id');
        }
        if (!db.objectStoreNames.contains('activity_todos')) {
          const store = db.createObjectStore('activity_todos', { keyPath: 'id' });
          store.createIndex('week_activity_id', 'week_activity_id');
        }
        if (!db.objectStoreNames.contains('resources')) {
          const store = db.createObjectStore('resources', { keyPath: 'id' });
          store.createIndex('user_id', 'user_id');
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'user_id' });
        }
        if (!db.objectStoreNames.contains('sync_meta')) {
          db.createObjectStore('sync_meta', { keyPath: 'user_id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status');
          store.createIndex('queued_at', 'queued_at');
        }
        if (!db.objectStoreNames.contains('global_todos')) {
          const store = db.createObjectStore('global_todos', { keyPath: 'id' });
          store.createIndex('user_id', 'user_id');
        }
        if (!db.objectStoreNames.contains('sync_meta')) {
          db.createObjectStore('sync_meta', { keyPath: 'user_id' });
        }
        if (!db.objectStoreNames.contains('pomodoro_sessions')) {
          const store = db.createObjectStore('pomodoro_sessions', { keyPath: 'id' });
          store.createIndex('user_id', 'user_id');
          store.createIndex('week_activity_id', 'week_activity_id');
        }
      },
    });
  }
  return dbPromise;
}

export async function cachePlans(plans) {
  const db = await getDB();
  const tx = db.transaction('plans', 'readwrite');
  await Promise.all(plans.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function getCachedPlans() {
  const db = await getDB();
  return db.getAll('plans');
}

export async function cachePlanActivities(planId, activitiesByDay) {
  const db = await getDB();
  const tx = db.transaction('plan_activities', 'readwrite');
  const existing = await tx.store.index('plan_id').getAllKeys(planId);
  for (const key of existing) {
    const record = await tx.store.get(key);
    if (record && record.plan_id === planId) {
      await tx.store.delete(key);
    }
  }
  for (const acts of Object.values(activitiesByDay)) {
    for (const act of acts) {
      await tx.store.put(act);
    }
  }
  await tx.done;
}

export async function getCachedPlanActivities(planId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('plan_activities', 'plan_id', planId);
  const grouped = {
    Lunes: [], Martes: [], Miércoles: [], Jueves: [],
    Viernes: [], Sábado: [], Domingo: [],
  };
  for (const act of all) {
    grouped[act.dia] = grouped[act.dia] || [];
    grouped[act.dia].push(act);
  }
  for (const dia of Object.keys(grouped)) {
    grouped[dia].sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }
  return grouped;
}

export async function cacheWeekActivities(weekId, activities) {
  const db = await getDB();
  const tx = db.transaction('week_activities', 'readwrite');
  for (const act of activities) {
    await tx.store.put(act);
  }
  await tx.done;
}

export async function getCachedWeekActivities(weekId) {
  const db = await getDB();
  return db.getAllFromIndex('week_activities', 'week_id', weekId);
}

export async function cacheWeekNotes(weekId, notesMap) {
  const db = await getDB();
  const tx = db.transaction('week_notes', 'readwrite');
  for (const [dia, content] of Object.entries(notesMap)) {
    await tx.store.put({ week_id: weekId, dia, content, updated_at: new Date().toISOString() });
  }
  await tx.done;
}

export async function getCachedWeekNotes(weekId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('week_notes', 'week_id', weekId);
  const map = {};
  for (const n of all) {
    map[n.dia] = n.content;
  }
  return map;
}

export async function cachePreferences(prefs) {
  const db = await getDB();
  await db.put('preferences', prefs);
}

export async function getCachedPreferences(userId) {
  const db = await getDB();
  return db.get('preferences', userId);
}

export async function enqueueOperation(operation) {
  const db = await getDB();
  const entry = {
    ...operation,
    status: 'pending',
    queued_at: new Date().toISOString(),
    retries: 0,
  };
  await db.add('sync_queue', entry);
  return entry;
}

export async function getPendingOperations() {
  const db = await getDB();
  return db.getAllFromIndex('sync_queue', 'status', 'pending');
}

export async function updateOperationStatus(id, status) {
  const db = await getDB();
  const entry = await db.get('sync_queue', id);
  if (entry) {
    entry.status = status;
    await db.put('sync_queue', entry);
  }
}

export async function clearSyncedOperations() {
  const db = await getDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  const all = await tx.store.getAll();
  for (const entry of all) {
    if (entry.status === 'synced') {
      await tx.store.delete(entry.id);
    }
  }
  await tx.done;
}

export async function setSyncMeta(userId, lastRevision) {
  const db = await getDB();
  await db.put('sync_meta', { user_id: userId, last_revision: lastRevision });
}

export async function getSyncMeta(userId) {
  const db = await getDB();
  return db.get('sync_meta', userId);
}

export async function clearAllData() {
  const db = await getDB();
  const storeNames = db.objectStoreNames;
  for (const name of storeNames) {
    await db.clear(name);
  }
}

export async function cacheGlobalTodos(userId, todos) {
  const db = await getDB();
  const tx = db.transaction('global_todos', 'readwrite');
  const existing = await tx.store.index('user_id').getAllKeys(userId);
  for (const key of existing) {
    await tx.store.delete(key);
  }
  for (const todo of todos) {
    await tx.store.put({ ...todo, user_id: userId });
  }
  await tx.done;
}

export async function getCachedGlobalTodos(userId) {
  const db = await getDB();
  return db.getAllFromIndex('global_todos', 'user_id', userId);
}

export async function cachePomodoroSessions(userId, sessions) {
  const db = await getDB();
  const tx = db.transaction('pomodoro_sessions', 'readwrite');
  for (const session of sessions) {
    await tx.store.put({ ...session, user_id: userId });
  }
  await tx.done;
}
