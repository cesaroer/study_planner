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
          const s = db.createObjectStore('plan_activities', { keyPath: 'id' });
          s.createIndex('plan_id', 'plan_id');
        }
        if (!db.objectStoreNames.contains('weeks')) {
          const s = db.createObjectStore('weeks', { keyPath: 'id' });
          s.createIndex('user_id', 'user_id');
          s.createIndex('week_start', 'week_start');
        }
        if (!db.objectStoreNames.contains('week_activities')) {
          const s = db.createObjectStore('week_activities', { keyPath: 'id' });
          s.createIndex('week_id', 'week_id');
        }
        if (!db.objectStoreNames.contains('week_notes')) {
          const s = db.createObjectStore('week_notes', { keyPath: ['week_id', 'dia'] });
          s.createIndex('week_id', 'week_id');
        }
        if (!db.objectStoreNames.contains('activity_todos')) {
          const s = db.createObjectStore('activity_todos', { keyPath: 'id' });
          s.createIndex('week_activity_id', 'week_activity_id');
          s.createIndex('activity_identifier', 'activity_identifier');
        }
        if (!db.objectStoreNames.contains('resources')) {
          const s = db.createObjectStore('resources', { keyPath: 'id' });
          s.createIndex('user_id', 'user_id');
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'user_id' });
        }
        if (!db.objectStoreNames.contains('sync_meta')) {
          db.createObjectStore('sync_meta', { keyPath: 'user_id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const s = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          s.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('global_todos')) {
          const s = db.createObjectStore('global_todos', { keyPath: 'id' });
          s.createIndex('user_id', 'user_id');
        }
        if (!db.objectStoreNames.contains('pomodoro_sessions')) {
          const s = db.createObjectStore('pomodoro_sessions', { keyPath: 'id' });
          s.createIndex('user_id', 'user_id');
          s.createIndex('week_activity_id', 'week_activity_id');
        }
      },
    });
  }
  return dbPromise;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const TYPE_PRIORITY = {
  Algoritmos: 0,
  'Actividad Principal': 1,
  Secundaria: 2,
  'Menor Prioridad': 3,
  'Conocimiento Pasivo': 4,
};

function sortActivities(acts) {
  return [...acts].sort((a, b) => {
    if (a.bloqueada !== b.bloqueada) return a.bloqueada ? 1 : -1;
    const pa = TYPE_PRIORITY[a.tipo] ?? 99;
    const pb = TYPE_PRIORITY[b.tipo] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.orden || 0) - (b.orden || 0);
  });
}

// ========================
// PLANS
// ========================

export async function getAllPlans(userId = null) {
  const db = await getDB();
  const plans = await db.getAll('plans');
  if (!userId) return plans;
  return plans.filter(plan => !plan.user_id || plan.user_id === userId);
}

export async function getAllPlansCaseInsensitive(userId) {
  const normalized = String(userId || '').trim().toLowerCase();
  if (!normalized) return [];
  const db = await getDB();
  const plans = await db.getAll('plans');
  return plans.filter(plan => String(plan.user_id || '').trim().toLowerCase() === normalized);
}

export async function getPlan(planId) {
  const db = await getDB();
  return db.get('plans', planId);
}

export async function createPlan(name, isDefault = false, overrideId = null, userId = null) {
  const db = await getDB();
  const plan = {
    id: overrideId || `plan_${uid()}`,
    name,
    is_default: isDefault,
    user_id: userId || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.put('plans', plan);
  return plan;
}

export async function updatePlan(planId, updates) {
  const db = await getDB();
  const plan = await db.get('plans', planId);
  if (!plan) return null;
  Object.assign(plan, updates, { updated_at: new Date().toISOString() });
  await db.put('plans', plan);
  return plan;
}

export async function deletePlan(planId) {
  const db = await getDB();
  const acts = await db.getAllFromIndex('plan_activities', 'plan_id', planId);
  const tx = db.transaction(['plans', 'plan_activities'], 'readwrite');
  for (const a of acts) {
    await tx.objectStore('plan_activities').delete(a.id);
  }
  await tx.objectStore('plans').delete(planId);
  await tx.done;
}

export async function setActivePlanId(userId, planId) {
  const db = await getDB();
  let prefs = await db.get('preferences', userId);
  if (!prefs) {
    prefs = { user_id: userId, active_plan_id: planId, estimated_times: {}, sidebar_collapsed: false, theme: 'dark', updated_at: new Date().toISOString() };
  } else {
    prefs.active_plan_id = planId;
    prefs.updated_at = new Date().toISOString();
  }
  await db.put('preferences', prefs);
  return prefs;
}

export async function getActivePlanId(userId) {
  const db = await getDB();
  const prefs = await db.get('preferences', userId);
  return prefs?.active_plan_id || null;
}

// ========================
// PLAN ACTIVITIES
// ========================

export async function getPlanActivities(planId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('plan_activities', 'plan_id', planId);
  const grouped = {};
  for (const d of DAYS) grouped[d] = [];
  for (const act of all) {
    if (!grouped[act.dia]) grouped[act.dia] = [];
    grouped[act.dia].push(act);
  }
  for (const d of DAYS) grouped[d] = sortActivities(grouped[d]);
  return grouped;
}

export async function addPlanActivity(planId, activity) {
  const db = await getDB();
  const act = {
    id: activity.id || uid(),
    plan_id: planId,
    dia: activity.dia,
    actividad: activity.actividad,
    tipo: activity.tipo,
    icono: activity.icono || '📝',
    orden: activity.orden || 0,
    tags: activity.tags || [],
    target_minutes: activity.target_minutes || 0,
    created_at: new Date().toISOString(),
  };
  await db.put('plan_activities', act);
  return act;
}

export async function replacePlanActivities(planId, activitiesByDay = {}) {
  const db = await getDB();
  const existing = await db.getAllFromIndex('plan_activities', 'plan_id', planId);
  const tx = db.transaction('plan_activities', 'readwrite');

  for (const entry of existing) {
    await tx.store.delete(entry.id);
  }

  for (const day of DAYS) {
    const dayActivities = Array.isArray(activitiesByDay?.[day]) ? activitiesByDay[day] : [];
    for (let index = 0; index < dayActivities.length; index += 1) {
      const activity = dayActivities[index] || {};
      await tx.store.put({
        id: activity.id || uid(),
        plan_id: planId,
        dia: day,
        actividad: activity.actividad || '',
        tipo: activity.tipo || 'Secundaria',
        icono: activity.icono || '📝',
        orden: Number.isFinite(activity.orden) ? activity.orden : index,
        tags: Array.isArray(activity.tags) ? activity.tags : [],
        target_minutes: activity.target_minutes ?? activity.targetMinutes ?? 0,
        created_at: activity.created_at || activity.createdAt || new Date().toISOString(),
      });
    }
  }

  await tx.done;
}

export async function updatePlanActivity(actId, updates) {
  const db = await getDB();
  const act = await db.get('plan_activities', actId);
  if (!act) return null;
  Object.assign(act, updates);
  await db.put('plan_activities', act);
  return act;
}

export async function deletePlanActivity(actId) {
  const db = await getDB();
  await db.delete('plan_activities', actId);
}

export async function copyPlanActivities(targetPlanId, sourcePlanId) {
  const db = await getDB();
  const sourceActs = await db.getAllFromIndex('plan_activities', 'plan_id', sourcePlanId);
  let count = 0;
  for (const src of sourceActs) {
    const newAct = {
      ...src,
      id: uid(),
      plan_id: targetPlanId,
      created_at: new Date().toISOString(),
    };
    await db.put('plan_activities', newAct);
    count++;
  }
  return count;
}

// ========================
// WEEKS
// ========================

export async function getWeek(userId, weekStart) {
  const db = await getDB();
  const all = await db.getAllFromIndex('weeks', 'week_start', weekStart);
  const normalized = String(userId || '').trim().toLowerCase();
  return all.find((w) => String(w.user_id || '').trim().toLowerCase() === normalized) || null;
}

export async function getOrCreateWeek(userId, weekStart, planId) {
  let week = await getWeek(userId, weekStart);
  if (week) return week;
  const db = await getDB();
  week = {
    id: uid(),
    user_id: userId,
    plan_id: planId || null,
    week_start: weekStart,
    created_at: new Date().toISOString(),
  };
  await db.put('weeks', week);
  return week;
}

export async function getWeeksInRange(userId, from, to) {
  const db = await getDB();
  const all = await db.getAllFromIndex('weeks', 'user_id', userId);
  return all.filter((w) => w.week_start >= from && w.week_start <= to).sort((a, b) => a.week_start.localeCompare(b.week_start));
}

export async function getWeeksInRangeCaseInsensitive(userId, from, to) {
  const normalized = String(userId || '').trim().toLowerCase();
  if (!normalized) return [];
  const db = await getDB();
  const all = await db.getAll('weeks');
  return all
    .filter((w) => String(w.user_id || '').trim().toLowerCase() === normalized)
    .filter((w) => w.week_start >= from && w.week_start <= to)
    .sort((a, b) => a.week_start.localeCompare(b.week_start));
}

// ========================
// WEEK ACTIVITIES
// ========================

export async function getWeekActivities(weekId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('week_activities', 'week_id', weekId);
  const grouped = {};
  for (const d of DAYS) grouped[d] = [];
  for (const act of all) {
    if (!grouped[act.dia]) grouped[act.dia] = [];
    grouped[act.dia].push(act);
  }
  for (const d of DAYS) grouped[d] = sortActivities(grouped[d]);
  return { all, grouped };
}

export async function addWeekActivity(weekId, activity) {
  const db = await getDB();
  const act = normalizeWeekActivityForStore(weekId, activity);
  await db.put('week_activities', act);
  return act;
}

function normalizeWeekActivityForStore(weekId, activity = {}, fallbackOrder = 0, weekStart = '') {
  return {
    id: activity.id || `${uid()}`,
    week_id: weekId,
    plan_activity_id: activity.plan_activity_id ?? activity.planActivityId ?? null,
    dia: activity.dia || 'Lunes',
    actividad: activity.actividad || '',
    tipo: activity.tipo || 'Secundaria',
    icono: activity.icono || '📝',
    completado: Boolean(activity.completado),
    bloqueada: Boolean(activity.bloqueada),
    tags: Array.isArray(activity.tags) ? activity.tags : [],
    target_minutes: activity.target_minutes ?? activity.targetMinutes ?? 0,
    spent_minutes: activity.spent_minutes ?? activity.spentMinutes ?? 0,
    pomodoro_sessions: activity.pomodoro_sessions ?? activity.pomodoroSessions ?? 0,
    orden: Number.isFinite(Number(activity.orden)) ? Number(activity.orden) : fallbackOrder,
    updated_at: activity.updated_at || activity.updatedAt || new Date().toISOString(),
    semana: activity.semana || weekStart || '',
    kanbanStatus: activity.kanbanStatus || null,
  };
}

export async function replaceWeekActivities(weekId, activities = [], weekStart = '') {
  const db = await getDB();
  const safeActivities = Array.isArray(activities) ? activities : [];
  const normalized = safeActivities.map((activity, index) => (
    normalizeWeekActivityForStore(weekId, activity, index, weekStart)
  ));
  const incomingIds = new Set(normalized.map(activity => activity.id));

  const tx = db.transaction('week_activities', 'readwrite');
  const existing = await tx.store.index('week_id').getAll(weekId);

  for (const current of existing) {
    if (!incomingIds.has(current.id)) {
      await tx.store.delete(current.id);
    }
  }

  for (const activity of normalized) {
    await tx.store.put(activity);
  }

  await tx.done;
  return normalized;
}

export async function updateWeekActivity(actId, updates) {
  const db = await getDB();
  const act = await db.get('week_activities', actId);
  if (!act) return null;
  Object.assign(act, updates, { updated_at: new Date().toISOString() });
  await db.put('week_activities', act);
  return act;
}

export async function deleteWeekActivity(actId) {
  const db = await getDB();
  await db.delete('week_activities', actId);
}

export async function moveWeekActivity(actId, targetDay) {
  return updateWeekActivity(actId, { dia: targetDay });
}

export async function checkAllDay(weekId, dia) {
  const db = await getDB();
  const all = await db.getAllFromIndex('week_activities', 'week_id', weekId);
  const tx = db.transaction('week_activities', 'readwrite');
  let count = 0;
  for (const act of all) {
    if (act.dia === dia) {
      act.completado = true;
      act.updated_at = new Date().toISOString();
      await tx.store.put(act);
      count++;
    }
  }
  await tx.done;
  return count;
}

export async function uncheckAllDay(weekId, dia) {
  const db = await getDB();
  const all = await db.getAllFromIndex('week_activities', 'week_id', weekId);
  const tx = db.transaction('week_activities', 'readwrite');
  let count = 0;
  for (const act of all) {
    if (act.dia === dia) {
      act.completado = false;
      act.updated_at = new Date().toISOString();
      await tx.store.put(act);
      count++;
    }
  }
  await tx.done;
  return count;
}

export async function deployPlanToWeek(userId, weekStart, planId) {
  const week = await getOrCreateWeek(userId, weekStart, planId);
  const db = await getDB();

  const existing = await db.getAllFromIndex('week_activities', 'week_id', week.id);
  const tx1 = db.transaction('week_activities', 'readwrite');
  for (const e of existing) {
    await tx1.store.delete(e.id);
  }
  await tx1.done;

  const planActs = await db.getAllFromIndex('plan_activities', 'plan_id', planId);
  const tx2 = db.transaction('week_activities', 'readwrite');
  for (const pa of planActs) {
    const wa = {
      id: `${uid()}`,
      week_id: week.id,
      plan_activity_id: pa.id,
      dia: pa.dia,
      actividad: pa.actividad,
      tipo: pa.tipo,
      icono: pa.icono,
      completado: false,
      bloqueada: false,
      tags: pa.tags || [],
      target_minutes: pa.target_minutes || 0,
      spent_minutes: 0,
      pomodoro_sessions: 0,
      orden: pa.orden || 0,
      updated_at: new Date().toISOString(),
      semana: weekStart,
    };
    await tx2.store.put(wa);
  }
  await tx2.done;
  const updatedWeek = { ...week, plan_id: planId };
  await db.put('weeks', updatedWeek);
  return { weekId: week.id, deployed: planActs.length };
}

export async function getFutureWeeks(userId, fromWeekStart) {
  const db = await getDB();
  const all = await db.getAll('weeks');
  const normalized = String(userId || '').trim().toLowerCase();
  return all.filter(w =>
    String(w.user_id || '').trim().toLowerCase() === normalized &&
    w.week_start >= fromWeekStart
  );
}

// ========================
// NOTES
// ========================

export async function getWeekNotes(weekId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('week_notes', 'week_id', weekId);
  const map = {};
  for (const n of all) map[n.dia] = n.content;
  return map;
}

export async function saveWeekNote(weekId, dia, content) {
  const db = await getDB();
  await db.put('week_notes', { week_id: weekId, dia, content, updated_at: new Date().toISOString() });
}

// ========================
// TODOS (legacy: keyed by activity_identifier string)
// ========================

export async function getActivityTodos(activityIdentifier) {
  const db = await getDB();
  return db.getAllFromIndex('activity_todos', 'activity_identifier', activityIdentifier);
}

export async function addActivityTodo(activityIdentifier, text) {
  const db = await getDB();
  const todo = {
    id: uid(),
    activity_identifier: activityIdentifier,
    text,
    completed: false,
    created_at: new Date().toISOString(),
  };
  await db.put('activity_todos', todo);
  return todo;
}

export async function toggleActivityTodo(todoId) {
  const db = await getDB();
  const todo = await db.get('activity_todos', todoId);
  if (!todo) return null;
  todo.completed = !todo.completed;
  await db.put('activity_todos', todo);
  return todo;
}

export async function deleteActivityTodo(todoId) {
  const db = await getDB();
  await db.delete('activity_todos', todoId);
}

export async function clearCompletedTodos(activityIdentifier) {
  const db = await getDB();
  const all = await db.getAllFromIndex('activity_todos', 'activity_identifier', activityIdentifier);
  const tx = db.transaction('activity_todos', 'readwrite');
  for (const t of all) {
    if (t.completed) await tx.store.delete(t.id);
  }
  await tx.done;
}

export async function getAllTodosGrouped() {
  const db = await getDB();
  const all = await db.getAll('activity_todos');
  const map = {};
  for (const t of all) {
    if (!map[t.activity_identifier]) map[t.activity_identifier] = [];
    map[t.activity_identifier].push(t);
  }
  return map;
}

// ========================
// PREFERENCES
// ========================

export async function getPreferences(userId) {
  const db = await getDB();
  return db.get('preferences', userId);
}

export async function savePreferences(userId, updates) {
  const db = await getDB();
  let prefs = await db.get('preferences', userId);
  if (!prefs) {
    prefs = { user_id: userId, estimated_times: {}, sidebar_collapsed: false, theme: 'dark' };
  }
  Object.assign(prefs, updates, { updated_at: new Date().toISOString() });
  await db.put('preferences', prefs);
  return prefs;
}

// ========================
// RESOURCES
// ========================

export async function getAllResources(userId) {
  const db = await getDB();
  return db.getAllFromIndex('resources', 'user_id', userId);
}

export async function addResource(userId, resource) {
  const db = await getDB();
  const res = {
    id: uid(),
    user_id: userId,
    title: resource.title,
    url: resource.url || '',
    description: resource.description || '',
    type: resource.type || 'link',
    tags: resource.tags || [],
    created_at: new Date().toISOString(),
  };
  await db.put('resources', res);
  return res;
}

export async function updateResource(resourceId, updates) {
  const db = await getDB();
  const res = await db.get('resources', resourceId);
  if (!res) return null;
  Object.assign(res, updates);
  await db.put('resources', res);
  return res;
}

export async function deleteResource(resourceId) {
  const db = await getDB();
  await db.delete('resources', resourceId);
}

// ========================
// MIGRATION HELPERS
// ========================

// ========================
// GLOBAL TODOS (Kanban)
// ========================

export async function getGlobalTodos(userId) {
  const db = await getDB();
  return db.getAllFromIndex('global_todos', 'user_id', userId);
}

export async function saveGlobalTodos(userId, todos) {
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

// ========================
// MIGRATION HELPERS (import)
// ========================

export async function importPlansFromLocalStorage(plans, activePlanId, userId) {
  const db = await getDB();
  for (const plan of plans) {
    await db.put('plans', {
      id: plan.id,
      name: plan.name,
      is_default: plan.isDefault || false,
      user_id: userId || null,
      created_at: plan.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (plan.activities) {
      for (const [dia, acts] of Object.entries(plan.activities)) {
        for (let i = 0; i < acts.length; i++) {
          const a = acts[i];
          await db.put('plan_activities', {
            id: a.id || uid(),
            plan_id: plan.id,
            dia,
            actividad: a.actividad || '',
            tipo: a.tipo || 'Secundaria',
            icono: a.icono || '📝',
            orden: i,
            tags: a.tags || [],
            target_minutes: a.targetMinutes || 0,
            created_at: new Date().toISOString(),
          });
        }
      }
    }
  }
  if (activePlanId) {
    await setActivePlanId(userId, activePlanId);
  }
}

export async function importWeeksFromLocalStorage(weeksData, userId) {
  const db = await getDB();
  for (const [weekStart, activities] of Object.entries(weeksData)) {
    if (!Array.isArray(activities)) continue;
    const week = await getOrCreateWeek(userId, weekStart, null);
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      await db.put('week_activities', {
        id: a.id || uid(),
        week_id: week.id,
        plan_activity_id: null,
        dia: a.dia || 'Lunes',
        actividad: a.actividad || '',
        tipo: a.tipo || 'Secundaria',
        icono: a.icono || '📝',
        completado: a.completado || false,
        bloqueada: a.bloqueada || false,
        tags: a.tags || [],
        target_minutes: a.targetMinutes || 0,
        spent_minutes: a.spentMinutes || 0,
        pomodoro_sessions: a.pomodoroSessions || 0,
        orden: i,
        updated_at: new Date().toISOString(),
        semana: weekStart,
      });
    }
  }
}

export async function importTodosFromLocalStorage(todosMap) {
  const db = await getDB();
  for (const [activityId, todos] of Object.entries(todosMap)) {
    if (!Array.isArray(todos)) continue;
    for (const t of todos) {
      await db.put('activity_todos', {
        id: t.id || uid(),
        activity_identifier: activityId,
        text: t.text || '',
        completed: t.completed || false,
        created_at: t.createdAt || new Date().toISOString(),
      });
    }
  }
}

export async function importGlobalTodosFromLocalStorage(userId, todos) {
  if (!Array.isArray(todos) || todos.length === 0) return;
  const db = await getDB();
  for (const t of todos) {
    await db.put('global_todos', {
      id: t.id || uid(),
      user_id: userId,
      text: t.text || '',
      completed: t.completed || false,
      status: t.status || (t.completed ? 'done' : 'todo'),
      description: t.description || '',
      priority: t.priority || 'medium',
      tags: t.tags || [],
      dueDate: t.dueDate || null,
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
    });
  }
}

export async function clearAllData() {
  const db = await getDB();
  for (const name of db.objectStoreNames) {
    await db.clear(name);
  }
}

export async function pushGlobalTodosToServer(userId) {
  try {
    const todos = await getGlobalTodos(userId);
    const { api } = await import('./api');
    const payload = todos.map(t => ({
      id: t.id,
      text: t.text,
      completed: t.completed,
      status: t.status || 'todo',
      description: t.description || '',
      priority: t.priority || 'medium',
      tags: t.tags || [],
      due_date: t.dueDate || null,
    }));
    await api.put('/global-todos/batch/replace', { todos: payload });
  } catch {}
}

export async function pullGlobalTodosFromServer(userId) {
  try {
    const { api } = await import('./api');
    const remote = await api.get('/global-todos');
    if (Array.isArray(remote)) {
      const mapped = remote.map(t => ({
        id: t.id,
        text: t.text,
        completed: t.completed,
        status: t.status,
        description: t.description || '',
        priority: t.priority || 'medium',
        tags: t.tags || [],
        dueDate: t.due_date || null,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }));
      await saveGlobalTodos(userId, mapped);
      return mapped;
    }
  } catch {}
  return null;
}

export async function savePomodoroSession(userId, session) {
  const db = await getDB();
  await db.put('pomodoro_sessions', { ...session, user_id: userId });
}

export async function getPomodoroSessions(userId) {
  const db = await getDB();
  return db.getAllFromIndex('pomodoro_sessions', 'user_id', userId);
}

export async function getPomodoroStatsForActivity(activityId) {
  const db = await getDB();
  const all = await db.getAllFromIndex('pomodoro_sessions', 'week_activity_id', activityId);
  const workSessions = all.filter(s => s.phase === 'work');
  return {
    sessions: workSessions.length,
    minutes: workSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0),
  };
}
