import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import WeekNavigation from './components/WeekNavigation';
import DayView from './components/DayView';
import DayDetailModal from './components/DayDetailModal';
import { defaultActivities } from './data/defaultActivities';
import ProgressBar from './components/ProgressBar';
import { format, startOfWeek, addDays, parseISO, isBefore, startOfDay, differenceInCalendarDays } from 'date-fns';
import CalendarModal from './components/CalendarModal';
import FrequencyModal from './components/FrequencyModal';
import SettingsModal from './components/SettingsModal';
import ResourcesModal from './components/ResourcesModal';
import TodoListModal from './components/TodoListModal';
import TodoListView from './components/TodoListView';
import PomodoroWidget, {
  requestNotificationPermission,
  getPomodoroState,
  savePomodoroState,
  clearPomodoroState,
  getPomodoroConfig,
  savePomodoroConfig,
  DEFAULT_POMODORO_CONFIG,
  getPomodoroDurationOptions,
  getEstimatedTargetMinutes,
} from './components/PomodoroWidget';
import WeeklyPlanner from './components/WeeklyPlanner';
import * as DS from './services/dataService';
import { api } from './services/api';
import { pushPendingChanges, pullChanges } from './services/syncEngine';
import { enqueueOperation } from './services/offlineQueue';
import {
  setHttpLogUser,
  getHttpLogs,
  clearHttpLogs,
  onHttpLog,
} from './services/httpLogger';
import {
  FaThLarge,
  FaChartLine,
  FaCalendarAlt,
  FaBook,
  FaListUl,
  FaCog,
  FaAngleLeft,
  FaAngleRight,
  FaSignOutAlt,
  FaPlus,
  FaUndo,
  FaRedo,
  FaTimes,
  FaBars,
  FaSearch,
  FaClipboardList
} from 'react-icons/fa';

// Utilidad simple para generar UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

const normalizeActivity = (activity = {}) => {
  const normalizedTags = Array.isArray(activity.tags)
    ? [...new Set(activity.tags.map(tag => String(tag || '').trim()).filter(Boolean))]
    : [];

  const parseMinutes = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  return {
    ...activity,
    id: String(activity.id || ''),
    dia: activity.dia || 'Lunes',
    actividad: String(activity.actividad || '').trim(),
    tipo: activity.tipo || 'Secundaria',
    icono: activity.icono || '📝',
    orden: Number.isFinite(Number(activity.orden)) ? Number(activity.orden) : 0,
    completado: Boolean(activity.completado),
    bloqueada: Boolean(activity.bloqueada),
    tags: normalizedTags,
    targetMinutes: parseMinutes(activity.targetMinutes ?? activity.target_minutes),
    spentMinutes: parseMinutes(activity.spentMinutes ?? activity.spent_minutes),
    pomodoroSessions: parseMinutes(activity.pomodoroSessions ?? activity.pomodoro_sessions),
    kanbanStatus: activity.kanbanStatus || null,
    semana: activity.semana || '',
    updatedAt: activity.updatedAt || activity.updated_at || '',
    createdAt: activity.createdAt || activity.created_at || '',
  };
};

const getActivityTimestamp = (activity) => {
  const updated = Date.parse(activity?.updatedAt || activity?.updated_at || '');
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(activity?.createdAt || activity?.created_at || '');
  if (Number.isFinite(created)) return created;
  return 0;
};

const buildExactActivitySignature = (activity) => {
  const normalized = normalizeActivity(activity);
  return JSON.stringify({
    dia: normalized.dia,
    actividad: normalized.actividad,
    tipo: normalized.tipo,
    icono: normalized.icono,
    completado: normalized.completado,
    bloqueada: normalized.bloqueada,
    orden: normalized.orden,
    tags: normalized.tags,
    targetMinutes: normalized.targetMinutes,
    spentMinutes: normalized.spentMinutes,
    pomodoroSessions: normalized.pomodoroSessions,
    kanbanStatus: normalized.kanbanStatus || '',
    semana: normalized.semana || '',
  });
};

const cleanDuplicatedActivities = (activities) => {
  if (!Array.isArray(activities)) return [];

  const byId = new Map();
  activities.forEach((rawActivity) => {
    if (!rawActivity || !rawActivity.id) return;
    const normalized = normalizeActivity(rawActivity);
    const existing = byId.get(normalized.id);
    if (!existing || getActivityTimestamp(normalized) >= getActivityTimestamp(existing)) {
      byId.set(normalized.id, normalized);
    }
  });

  const bySignature = new Map();
  Array.from(byId.values()).forEach((activity) => {
    const signature = buildExactActivitySignature(activity);
    const existing = bySignature.get(signature);
    if (!existing || getActivityTimestamp(activity) >= getActivityTimestamp(existing)) {
      bySignature.set(signature, activity);
    }
  });

  return Array.from(bySignature.values()).sort((a, b) => {
    const dayDiff = (DAY_ORDER_MAP[a.dia] ?? 99) - (DAY_ORDER_MAP[b.dia] ?? 99);
    if (dayDiff !== 0) return dayDiff;
    if (a.orden !== b.orden) return a.orden - b.orden;
    return a.actividad.localeCompare(b.actividad);
  });
};

const HISTORY_LIMIT = 50;
const TYPE_ICON_MAP = {
  'Algoritmos': '🧠',
  'Actividad Principal': '📌',
  'Secundaria': '🧩',
  'Menor Prioridad': '🪶',
  'Conocimiento Pasivo': '📘',
};
const ACTIVITY_TYPES = [
  'Algoritmos',
  'Actividad Principal',
  'Secundaria',
  'Menor Prioridad',
  'Conocimiento Pasivo'
];
const EMOJI_PRESETS = ['🧠', '📌', '🧩', '🪶', '📘', '💻', '📚', '⚙️', '🚀', '📝', '🎯', '🔥'];
const GLOBAL_TODO_STORAGE_PREFIX = 'todoList_';
const LEGACY_ACTIVITY_TODOS_KEY = 'activity_todos';
const KANBAN_STATUSES = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];
const KANBAN_STATUS_LABELS = KANBAN_STATUSES.reduce((acc, status) => {
  acc[status.key] = status.label;
  return acc;
}, {});
const TODO_PRIORITIES = ['low', 'medium', 'high'];
const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
const ACTIVITY_TYPE_ORDER = {
  'Algoritmos': 1,
  'Actividad Principal': 2,
  'Principal': 2,
  'Secundaria': 3,
  'Menor Prioridad': 4,
  'Menor prioridad': 4,
  'Conocimiento Pasivo': 5,
  'Conocimiento pasivo': 5
};
const ACTIVITY_TYPE_TO_TODO_PRIORITY = {
  'Algoritmos': 'high',
  'Actividad Principal': 'high',
  'Principal': 'high',
  'Secundaria': 'medium',
  'Menor Prioridad': 'low',
  'Menor prioridad': 'low',
  'Conocimiento Pasivo': 'low',
  'Conocimiento pasivo': 'low'
};
const DEFAULT_KANBAN_FILTER = {
  query: '',
  status: 'all',
  priority: 'all',
  tag: '',
};
const DEFAULT_KANBAN_SORT = 'manual';

const createLocalTodoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeUsername = (value = '') => String(value || '').trim().toLowerCase();
const PLAN_SYNC_META_STORAGE_PREFIX = 'planSyncMeta_';
const DAY_ORDER_MAP = {
  Lunes: 0,
  Martes: 1,
  Miércoles: 2,
  Jueves: 3,
  Viernes: 4,
  Sábado: 5,
  Domingo: 6,
};

const isUuid = (value = '') => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));

const cloneJson = (value, fallback) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const getActivityKanbanStatus = (activity) => {
  if (!activity || typeof activity !== 'object') return 'todo';
  if (activity.completado) return 'done';
  return KANBAN_STATUS_LABELS[activity.kanbanStatus] ? activity.kanbanStatus : 'todo';
};

const getPriorityFromActivityType = (type) => ACTIVITY_TYPE_TO_TODO_PRIORITY[type] || 'medium';

const normalizeGlobalTodo = (todo) => {
  if (!todo || typeof todo !== 'object') return null;
  const text = String(todo.text || '').trim();
  if (!text) return null;
  const createdAt = todo.createdAt || new Date().toISOString();
  const normalizedStatus = KANBAN_STATUS_LABELS[todo.status]
    ? todo.status
    : (todo.completed ? 'done' : 'todo');
  const normalizedPriority = TODO_PRIORITIES.includes(todo.priority)
    ? todo.priority
    : 'medium';
  const normalizedTags = Array.isArray(todo.tags)
    ? [...new Set(todo.tags.map(tag => String(tag || '').trim()).filter(Boolean))]
    : [];
  const dueDateValue = typeof todo.dueDate === 'string' && todo.dueDate.trim()
    ? todo.dueDate.trim()
    : null;
  const normalizedDueDate = dueDateValue && !Number.isNaN(Date.parse(dueDateValue))
    ? dueDateValue
    : null;

  return {
    id: String(todo.id || createLocalTodoId()),
    text,
    completed: normalizedStatus === 'done',
    createdAt,
    updatedAt: todo.updatedAt || createdAt,
    status: normalizedStatus,
    description: String(todo.description || '').trim(),
    priority: normalizedPriority,
    tags: normalizedTags,
    dueDate: normalizedDueDate,
  };
};

const parseGlobalTodos = (rawValue) => {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeGlobalTodo)
      .filter(Boolean);
  } catch {
    return [];
  }
};

const parseLegacyActivityTodos = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_ACTIVITY_TODOS_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce((acc, [activityId, todos]) => {
      if (!Array.isArray(todos)) return acc;
      const normalizedTodos = todos
        .filter(todo => todo && typeof todo === 'object')
        .map(todo => ({
          id: String(todo.id || createLocalTodoId()),
          text: String(todo.text || '').trim(),
          completed: Boolean(todo.completed),
          createdAt: todo.createdAt || new Date().toISOString()
        }))
        .filter(todo => Boolean(todo.text));

      if (normalizedTodos.length > 0) {
        acc[String(activityId)] = normalizedTodos;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

export default function App() {
  // eslint-disable-next-line
  const [deviceId] = useState(() => {
    let id = localStorage.getItem('trustedDeviceId');
    if (!id) {
      id = generateUUID();
      localStorage.setItem('trustedDeviceId', id);
    }
    return id;
  });

  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  // Hooks para control de login/registro
  const [authMode, setAuthMode] = useState('login');
  const [pendingUsername, setPendingUsername] = useState('');
  const [loginError, setLoginError] = useState('');

  const [currentWeek, setCurrentWeek] = useState(() => {
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  });
  
  // Estado para la fecha seleccionada (inicialmente hoy)
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Hook para datos de usuario actual (clave depende del usuario)
  const [weeksData, setWeeksData] = useState({});
  const [areWeeksLoaded, setAreWeeksLoaded] = useState(false);
  const [weekPlanIds, setWeekPlanIds] = useState({});
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [focusMode, setFocusMode] = useState(false);
  const [focusSkippedIds, setFocusSkippedIds] = useState([]);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [dragState, setDragState] = useState({ activityId: null, fromDay: null });
  const [dropTargetDay, setDropTargetDay] = useState(null);
  const [activityContextMenu, setActivityContextMenu] = useState({
    open: false,
    activityId: null,
    day: null,
    x: 0,
    y: 0
  });
  const [showContextMovePicker, setShowContextMovePicker] = useState(false);
  const [isContextEditModalOpen, setIsContextEditModalOpen] = useState(false);
  const [isContextTagsModalOpen, setIsContextTagsModalOpen] = useState(false);
  const [contextEditForm, setContextEditForm] = useState({
    activityId: null,
    actividad: '',
    tipo: ACTIVITY_TYPES[0],
    icono: TYPE_ICON_MAP[ACTIVITY_TYPES[0]],
    dia: 'Lunes'
  });
  const [contextTagsForm, setContextTagsForm] = useState({
    activityId: null,
    selectedTags: [],
    tagsInput: ''
  });
  const [quickAddForm, setQuickAddForm] = useState({
    actividad: '',
    tipo: 'Algoritmos',
    dia: 'Lunes',
    icono: TYPE_ICON_MAP['Algoritmos'],
    tagsInput: '',
    selectedTags: []
  });
  const [globalTodos, setGlobalTodos] = useState([]);
  const [globalTodoInput, setGlobalTodoInput] = useState('');
  const [globalTodosReady, setGlobalTodosReady] = useState(false);
  const [activityTodosMap, setActivityTodosMap] = useState({});
  const [isTodoDetailModalOpen, setIsTodoDetailModalOpen] = useState(false);
  const [todoDetailActivity, setTodoDetailActivity] = useState(null);
  const [todoViewMode, setTodoViewMode] = useState('list');
  const [kanbanFilter, setKanbanFilter] = useState(DEFAULT_KANBAN_FILTER);
  const [kanbanSort, setKanbanSort] = useState(DEFAULT_KANBAN_SORT);
  const [isKanbanEditOpen, setIsKanbanEditOpen] = useState(false);
  const [selectedKanbanTodoId, setSelectedKanbanTodoId] = useState(null);
  const [kanbanEditDraft, setKanbanEditDraft] = useState({
    text: '',
    description: '',
    priority: 'medium',
    tagsInput: '',
    dueDate: '',
    status: 'todo',
  });

  const [pomodoroState, setPomodoroState] = useState(null);
  const [pomodoroConfig, setPomodoroConfig] = useState(() => ({ ...DEFAULT_POMODORO_CONFIG }));
  const [pomodoroStartSelector, setPomodoroStartSelector] = useState({
    open: false,
    activity: null,
    options: []
  });
  const [httpLogs, setHttpLogs] = useState([]);
  const [httpToasts, setHttpToasts] = useState([]);
  const [planSyncMeta, setPlanSyncMeta] = useState({});
  const [isSavingPlanId, setIsSavingPlanId] = useState(null);
  const [settingsSection, setSettingsSection] = useState('activities');
  useEffect(() => {
    if (user) { setIsAuthLoading(false); return; }
    const lastUser = localStorage.getItem('lastLoggedUsername');
    if (lastUser) setUser({ username: normalizeUsername(lastUser) });
    setIsAuthLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentUserKey = normalizeUsername(user?.username);
  const planSyncMetaStorageKey = currentUserKey
    ? `${PLAN_SYNC_META_STORAGE_PREFIX}${currentUserKey}`
    : '';

  const pushToast = useCallback((toast) => {
    if (!toast || !toast.title) return;
    const nextToast = {
      id: toast.id || `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: toast.type || 'info',
      title: toast.title,
      message: toast.message || '',
      actionLabel: toast.actionLabel || '',
      action: typeof toast.action === 'function' ? toast.action : null,
      duration: Number.isFinite(Number(toast.duration)) ? Number(toast.duration) : 7000,
    };
    setHttpToasts(prev => [nextToast, ...prev].slice(0, 4));
  }, []);

  const dismissToast = useCallback((toastId) => {
    setHttpToasts(prev => prev.filter(toast => toast.id !== toastId));
  }, []);

  useEffect(() => {
    setHttpLogUser(currentUserKey);
  }, [currentUserKey]);

  useEffect(() => {
    const timers = httpToasts.map(toast => setTimeout(() => {
      dismissToast(toast.id);
    }, toast.duration));
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [httpToasts, dismissToast]);

  useEffect(() => {
    if (!currentUserKey) {
      setHttpLogs([]);
      return;
    }
    setHttpLogs(getHttpLogs(currentUserKey));
    const unsubscribe = onHttpLog((nextLogs, latestEntry) => {
      if (Array.isArray(nextLogs)) setHttpLogs(nextLogs);
      if (!latestEntry || latestEntry.ok) return;
      pushToast({
        type: 'error',
        title: latestEntry.actionTitle || 'Petición fallida',
        message: latestEntry.error?.detail || latestEntry.error || `${latestEntry.method} ${latestEntry.path}`,
        actionLabel: 'Salió mal petición en backend',
        action: () => {
          setActiveSidebarSection('settings');
          setShowSettingsModal(true);
          setSettingsSection('logs');
        },
        duration: 9000,
      });
    });
    return () => unsubscribe();
  }, [currentUserKey, pushToast]);

  useEffect(() => {
    if (!planSyncMetaStorageKey) {
      setPlanSyncMeta({});
      return;
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(planSyncMetaStorageKey) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setPlanSyncMeta(parsed);
      } else {
        setPlanSyncMeta({});
      }
    } catch {
      setPlanSyncMeta({});
    }
  }, [planSyncMetaStorageKey]);

  useEffect(() => {
    if (!planSyncMetaStorageKey) return;
    localStorage.setItem(planSyncMetaStorageKey, JSON.stringify(planSyncMeta));
  }, [planSyncMetaStorageKey, planSyncMeta]);

  const handleClearHttpLogEntries = useCallback(() => {
    clearHttpLogs(currentUserKey);
    setHttpLogs([]);
  }, [currentUserKey]);

  const loadWeeksFromDB = useCallback(async () => {
    setAreWeeksLoaded(false);
    if (!currentUserKey) {
      setWeeksData({});
      setAreWeeksLoaded(true);
      return;
    }
    try {
      let dbWeeks = await DS.getWeeksInRange(currentUserKey, '2000-01-01', '2099-12-31');
      if (dbWeeks.length === 0) {
        dbWeeks = await DS.getWeeksInRangeCaseInsensitive(currentUserKey, '2000-01-01', '2099-12-31');
      }
      const data = {};
      const planIdMap = {};
      for (const w of dbWeeks) {
        const { all } = await DS.getWeekActivities(w.id);
        const deduped = cleanDuplicatedActivities(all);
        data[w.week_start] = deduped;
        planIdMap[w.week_start] = w.plan_id || null;
        if (deduped.length !== all.length) {
          await DS.replaceWeekActivities(w.id, deduped, w.week_start);
        }
      }
      if (Object.keys(data).length === 0) {
        const lsKey = `studyPlannerData_${currentUserKey}`;
        const stored = localStorage.getItem(lsKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            Object.entries(parsed).forEach(([wk, acts]) => { data[wk] = cleanDuplicatedActivities(acts); });
            if (Object.keys(data).length > 0) {
              DS.importWeeksFromLocalStorage(data, currentUserKey).catch(() => {});
            }
          } catch {}
        }
      }
      setWeeksData(data);
      setWeekPlanIds(planIdMap);
      setAreWeeksLoaded(true);
    } catch (e) {
      console.error('Error loading weeks from IndexedDB:', e);
      const lsKey = `studyPlannerData_${currentUserKey}`;
      const stored = localStorage.getItem(lsKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const cleaned = {};
          Object.entries(parsed || {}).forEach(([weekKey, activities]) => {
            cleaned[weekKey] = cleanDuplicatedActivities(activities);
          });
          setWeeksData(cleaned);
        } catch { setWeeksData({}); }
      } else { setWeeksData({}); }
      setAreWeeksLoaded(true);
    }
  }, [currentUserKey]);

  useEffect(() => { loadWeeksFromDB(); }, [loadWeeksFromDB]);

  useEffect(() => {
    if (!currentUserKey || !currentWeek) { setNotes({}); return; }
    (async () => {
      try {
        const week = await DS.getWeek(currentUserKey, currentWeek);
        if (week) {
          const noteMap = await DS.getWeekNotes(week.id);
          setNotes(noteMap);
        } else {
          setNotes({});
        }
      } catch { setNotes({}); }
    })();
  }, [currentUserKey, currentWeek]);

  const refreshLegacyActivityTodos = async () => {
    try {
      const grouped = await DS.getAllTodosGrouped();
      const map = {};
      for (const [activityId, todos] of Object.entries(grouped)) {
        map[activityId] = todos.map(t => ({
          id: t.id,
          text: t.text,
          completed: t.completed,
          createdAt: t.created_at || t.createdAt,
        }));
      }
      if (Object.keys(map).length === 0) {
        setActivityTodosMap(parseLegacyActivityTodos());
      } else {
        setActivityTodosMap(map);
      }
    } catch {
      setActivityTodosMap(parseLegacyActivityTodos());
    }
  };

  // Cargar todo list global por usuario + legacy activity todos
  useEffect(() => {
    if (!currentUserKey) {
      setGlobalTodos([]);
      setGlobalTodoInput('');
      setGlobalTodosReady(false);
      setActivityTodosMap({});
      setTodoViewMode('list');
      setKanbanFilter(DEFAULT_KANBAN_FILTER);
      setKanbanSort(DEFAULT_KANBAN_SORT);
      setIsKanbanEditOpen(false);
      setSelectedKanbanTodoId(null);
      return;
    }

    (async () => {
      try {
        let dbTodos = await DS.getGlobalTodos(currentUserKey);
        if (dbTodos.length === 0) {
          const todoStorageKey = `${GLOBAL_TODO_STORAGE_PREFIX}${currentUserKey}`;
          const lsRaw = localStorage.getItem(todoStorageKey);
          if (lsRaw) {
            const lsTodos = parseGlobalTodos(lsRaw);
            if (lsTodos.length > 0) {
              await DS.importGlobalTodosFromLocalStorage(currentUserKey, lsTodos);
              dbTodos = await DS.getGlobalTodos(currentUserKey);
            }
          }
        }
        setGlobalTodos(dbTodos.map(normalizeGlobalTodo).filter(Boolean));
      } catch {
        const todoStorageKey = `${GLOBAL_TODO_STORAGE_PREFIX}${currentUserKey}`;
        setGlobalTodos(parseGlobalTodos(localStorage.getItem(todoStorageKey)));
      }
      setGlobalTodosReady(true);

      try {
        const grouped = await DS.getAllTodosGrouped();
        const map = {};
        for (const [activityId, todos] of Object.entries(grouped)) {
          map[activityId] = todos.map(t => ({
            id: t.id,
            text: t.text,
            completed: t.completed,
            createdAt: t.created_at || t.createdAt,
          }));
        }
        if (Object.keys(map).length === 0) {
          const legacy = parseLegacyActivityTodos();
          setActivityTodosMap(legacy);
          if (Object.keys(legacy).length > 0) {
            DS.importTodosFromLocalStorage(legacy).catch(() => {});
          }
        } else {
          setActivityTodosMap(map);
        }
      } catch {
        const legacy = parseLegacyActivityTodos();
        setActivityTodosMap(legacy);
        if (Object.keys(legacy).length > 0) {
          DS.importTodosFromLocalStorage(legacy).catch(() => {});
        }
      }
    })();
  }, [currentUserKey]);

  // Persistir global todos a IndexedDB
  useEffect(() => {
    if (!currentUserKey || !globalTodosReady) return;
    DS.saveGlobalTodos(currentUserKey, globalTodos).catch(() => {});
  }, [globalTodos, currentUserKey, globalTodosReady]);

  // Rehidratar summary de activity todos cuando cambia foco de ventana o storage
  useEffect(() => {
    const handleRefresh = () => refreshLegacyActivityTodos();
    window.addEventListener('focus', handleRefresh);
    window.addEventListener('storage', handleRefresh);
    return () => {
      window.removeEventListener('focus', handleRefresh);
      window.removeEventListener('storage', handleRefresh);
    };
  }, []);

  const [studyPlans, setStudyPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const DAYS_LIST = useMemo(() => ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], []);

  const updatePlanSyncMeta = useCallback((planId, patch) => {
    if (!planId || !patch || typeof patch !== 'object') return;
    setPlanSyncMeta(prev => {
      const previous = prev[planId] || {};
      return {
        ...prev,
        [planId]: {
          ...previous,
          ...patch,
        }
      };
    });
  }, []);

  const getPlanSyncState = useCallback((planId) => {
    if (!planId || planId === 'plan_default') return 'default';
    const meta = planSyncMeta[planId] || {};
    if (meta.pendingSync || meta.lastError) return 'error';
    if (meta.origin === 'cloud' || meta.cloudPlanId) return 'cloud';
    return 'local';
  }, [planSyncMeta]);

  const createEmptyPlanWeek = useCallback(() => {
    return DAYS_LIST.reduce((acc, day) => ({ ...acc, [day]: [] }), {});
  }, [DAYS_LIST]);

  const normalizePlanActivitiesByDay = useCallback((activitiesByDay = {}) => {
    const normalized = createEmptyPlanWeek();
    DAYS_LIST.forEach((day) => {
      const list = Array.isArray(activitiesByDay?.[day]) ? activitiesByDay[day] : [];
      normalized[day] = list.map((activity, index) => {
        const normalizedActivity = normalizeActivity({
          ...activity,
          dia: day,
          icono: activity?.icono || TYPE_ICON_MAP[activity?.tipo] || '📝',
          tags: Array.isArray(activity?.tags) ? activity.tags : [],
          targetMinutes: activity?.targetMinutes ?? activity?.target_minutes ?? 0,
          spentMinutes: activity?.spentMinutes ?? activity?.spent_minutes ?? 0,
          pomodoroSessions: activity?.pomodoroSessions ?? activity?.pomodoro_sessions ?? 0,
          completado: Boolean(activity?.completado),
          bloqueada: Boolean(activity?.bloqueada),
          orden: Number.isFinite(Number(activity?.orden)) ? Number(activity.orden) : index
        });
        return {
          ...normalizedActivity,
          id: normalizedActivity.id || `plan-${day}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`
        };
      });
    });
    return normalized;
  }, [DAYS_LIST, createEmptyPlanWeek]);

  const flattenPlanActivities = useCallback((planId, activitiesByDay = {}) => {
    const payload = [];
    DAYS_LIST.forEach((day) => {
      const dayActivities = Array.isArray(activitiesByDay?.[day]) ? activitiesByDay[day] : [];
      dayActivities.forEach((activity, index) => {
        if (!activity?.actividad) return;
        payload.push({
          id: activity.id || `${planId}-${day}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          plan_id: planId,
          dia: day,
          actividad: String(activity.actividad || '').trim(),
          tipo: activity.tipo || 'Secundaria',
          icono: activity.icono || TYPE_ICON_MAP[activity.tipo] || '📝',
          orden: Number.isFinite(Number(activity.orden)) ? Number(activity.orden) : index,
          tags: Array.isArray(activity.tags) ? activity.tags : [],
          target_minutes: Number(activity.targetMinutes ?? activity.target_minutes ?? 0) || 0
        });
      });
    });
    return payload;
  }, [DAYS_LIST]);

  const pullCloudPlansIntoLocal = useCallback(async () => {
    if (!currentUserKey || !user) return [];
    const remotePlans = await api.get('/plans', {
      actionTitle: 'Planes recuperados de la nube'
    });
    if (!Array.isArray(remotePlans) || remotePlans.length === 0) return [];

    const hydratedPlans = [];
    for (const remotePlan of remotePlans) {
      const grouped = await api.get(`/plans/${remotePlan.id}/activities`, {
        actionTitle: `Actividades recuperadas: ${remotePlan.name || 'Plan'}`
      });
      const activitiesByDay = {};
      DAYS_LIST.forEach((day) => {
        const remoteActivities = Array.isArray(grouped?.[day]) ? grouped[day] : [];
        activitiesByDay[day] = remoteActivities.map((activity, index) => normalizeActivity({
          id: activity.id,
          dia: day,
          actividad: activity.actividad,
          tipo: activity.tipo,
          icono: activity.icono || TYPE_ICON_MAP[activity.tipo] || '📝',
          orden: Number.isFinite(Number(activity.orden)) ? Number(activity.orden) : index,
          tags: Array.isArray(activity.tags) ? activity.tags : [],
          targetMinutes: activity.target_minutes || 0,
          spentMinutes: 0,
          pomodoroSessions: 0,
          completado: false,
          bloqueada: false,
          createdAt: activity.created_at || '',
          updatedAt: activity.updated_at || '',
        }));
      });

      let localPlan = await DS.getPlan(remotePlan.id);
      if (!localPlan) {
        localPlan = await DS.createPlan(remotePlan.name || 'Plan', false, remotePlan.id, currentUserKey);
      } else {
        await DS.updatePlan(remotePlan.id, { name: remotePlan.name || localPlan.name });
      }

      await DS.replacePlanActivities(remotePlan.id, activitiesByDay);
      hydratedPlans.push({
        id: remotePlan.id,
        name: remotePlan.name || 'Plan',
        createdAt: remotePlan.created_at || localPlan?.created_at || new Date().toISOString(),
        isDefault: Boolean(remotePlan.is_default),
        activities: activitiesByDay,
      });

      updatePlanSyncMeta(remotePlan.id, {
        origin: 'cloud',
        cloudPlanId: remotePlan.id,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        pendingSync: false,
      });
    }
    return hydratedPlans;
  }, [DAYS_LIST, currentUserKey, updatePlanSyncMeta, user]);

  const loadPlansFromDB = useCallback(async () => {
    if (!currentUserKey) { setStudyPlans([]); setActivePlanId(null); return; }
    try {
      let dbPlans = await DS.getAllPlans(currentUserKey);
      if (dbPlans.length === 0) {
        dbPlans = await DS.getAllPlansCaseInsensitive(currentUserKey);
      }
      let plans = dbPlans;
      const hasDefault = plans.some(p => p.id === 'plan_default');
      if (!hasDefault) {
        const defaultPlanActivities = {};
        DAYS_LIST.forEach(d => {
          const dayActs = defaultActivities[d] || [];
          defaultPlanActivities[d] = dayActs.map(act => ({
            id: act.id || `def-${d}-${(act.actividad || '').trim().toLowerCase().replace(/\s+/g, '-')}`,
            actividad: act.actividad || '',
            tipo: act.tipo || 'estudio',
            icono: act.icono || '📝',
            dia: d,
            completado: false,
            bloqueada: false,
            tags: [],
            targetMinutes: 0,
            spentMinutes: 0,
            pomodoroSessions: 0,
          }));
        });
        const defaultPlan = { id: 'plan_default', name: 'Plan default', createdAt: '2025-01-01T00:00:00.000Z', activities: defaultPlanActivities, isDefault: true };
        await DS.createPlan('Plan default', true, 'plan_default', currentUserKey);
        for (const [dia, acts] of Object.entries(defaultPlanActivities)) {
          for (const act of acts) {
            await DS.addPlanActivity('plan_default', { ...act, dia });
          }
        }
        plans = [defaultPlan, ...plans];
      }

      for (const plan of plans) {
        if (!plan.activities) {
          plan.activities = await DS.getPlanActivities(plan.id);
        }
      }

      if (plans.length === 0) {
        const lsKey = `studyPlans_${currentUserKey}`;
        const stored = localStorage.getItem(lsKey);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            plans = parsed.plans || [];
            if (plans.length > 0) {
              await DS.importPlansFromLocalStorage(plans, parsed.activePlanId, currentUserKey);
              if (parsed.activePlanId) await DS.setActivePlanId(currentUserKey, parsed.activePlanId);
            }
          } catch {}
        }
      }

      const canUseCloud = Boolean(user);
      const shouldPullFromCloud = canUseCloud && (plans.length === 0 || (
        plans.length === 1 && plans[0].id === 'plan_default'
      ));
      if (shouldPullFromCloud) {
        try {
          const cloudPlans = await pullCloudPlansIntoLocal();
          if (cloudPlans.length > 0) {
            const localDefault = plans.find(plan => plan.id === 'plan_default');
            const merged = [];
            if (localDefault) merged.push(localDefault);
            cloudPlans.forEach((plan) => {
              if (!merged.some(item => item.id === plan.id)) {
                merged.push(plan);
              }
            });
            plans = merged;
          }
        } catch {}
      }

      for (const plan of plans) {
        if (!plan.activities) {
          plan.activities = await DS.getPlanActivities(plan.id);
        }
      }

      const normalizedPlans = plans.map((plan) => ({
        ...plan,
        isDefault: Boolean(plan.isDefault || plan.is_default || plan.id === 'plan_default'),
      }));

      setStudyPlans(normalizedPlans);
      setPlanSyncMeta((prev) => {
        const next = { ...prev };
        normalizedPlans.forEach((plan) => {
          if (plan.id === 'plan_default') return;
          const existing = next[plan.id] || {};
          next[plan.id] = {
            origin: existing.origin || (isUuid(plan.id) ? 'cloud' : 'local'),
            cloudPlanId: existing.cloudPlanId || (isUuid(plan.id) ? plan.id : null),
            lastSyncedAt: existing.lastSyncedAt || null,
            lastError: existing.lastError || null,
            pendingSync: Boolean(existing.pendingSync),
          };
        });
        return next;
      });

      const activeId = await DS.getActivePlanId(currentUserKey);
      if (activeId && normalizedPlans.some(p => p.id === activeId)) {
        setActivePlanId(activeId);
      } else if (normalizedPlans.length > 0) {
        const cloudFirst = normalizedPlans.find(plan => plan.id !== 'plan_default');
        setActivePlanId((cloudFirst || normalizedPlans[0]).id);
      } else {
        setActivePlanId(null);
      }
    } catch (e) {
      console.error('Error loading plans from IndexedDB:', e);
      const lsKey = `studyPlans_${currentUserKey}`;
      const stored = localStorage.getItem(lsKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setStudyPlans(parsed.plans || []);
          setActivePlanId(parsed.activePlanId || null);
        } catch { setStudyPlans([]); setActivePlanId(null); }
      } else { setStudyPlans([]); setActivePlanId(null); }
    }
  }, [currentUserKey, DAYS_LIST, pullCloudPlansIntoLocal, user]);

  useEffect(() => { loadPlansFromDB(); }, [loadPlansFromDB]);

  useEffect(() => {
    if (!currentUserKey) return;
    DS.setActivePlanId(currentUserKey, activePlanId || null).catch(() => {});
  }, [currentUserKey, activePlanId]);

  const handleSetActivePlan = useCallback(async (planId) => {
    setActivePlanId(planId);
    if (!planId || !user) return;
    const meta = planSyncMeta[planId];
    const cloudPlanId = meta?.cloudPlanId || (isUuid(planId) ? planId : null);
    if (cloudPlanId) {
      try { await api.patch(`/plans/${cloudPlanId}/activate`); } catch {}
    }
    if (!currentWeek) return;
    // Redeploy current week + all future weeks that already exist in IndexedDB
    const futureWeeks = await DS.getFutureWeeks(currentUserKey, currentWeek);
    const newState = {};
    for (const fw of futureWeeks) {
      try {
        await DS.deployPlanToWeek(currentUserKey, fw.week_start, planId);
        const reloaded = await DS.getWeek(currentUserKey, fw.week_start);
        if (reloaded) {
          const { all } = await DS.getWeekActivities(reloaded.id);
          newState[fw.week_start] = cleanDuplicatedActivities(all);
        }
      } catch {}
    }
    // Safety net: if currentWeek wasn't in the list, deploy it
    if (!newState[currentWeek]) {
      try {
        await DS.deployPlanToWeek(currentUserKey, currentWeek, planId);
        const reloaded = await DS.getWeek(currentUserKey, currentWeek);
        if (reloaded) {
          const { all } = await DS.getWeekActivities(reloaded.id);
          newState[currentWeek] = cleanDuplicatedActivities(all);
        }
      } catch {}
    }
    setWeeksData(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(newState)) {
        next[k] = v;
      }
      return next;
    });
    setWeekPlanIds(prev => {
      const next = { ...prev };
      for (const weekStart of Object.keys(newState)) {
        next[weekStart] = planId;
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSyncMeta, user, currentWeek, currentUserKey]);

  // CRUD de planes
  const handleCreatePlan = async (planId, name) => {
    const emptyActivities = {};
    DAYS_LIST.forEach(d => { emptyActivities[d] = []; });
    const newPlan = { id: planId, name, createdAt: new Date().toISOString(), activities: emptyActivities };
    setStudyPlans(prev => [...prev, newPlan]);
    setActivePlanId(planId);
    updatePlanSyncMeta(planId, {
      origin: 'local',
      cloudPlanId: null,
      lastSyncedAt: null,
      lastError: null,
      pendingSync: false,
    });
    try {
      await DS.createPlan(name, false, planId, currentUserKey);
      await DS.setActivePlanId(currentUserKey, planId);
      await DS.replacePlanActivities(planId, emptyActivities);
    } catch {}
  };

  const handleDeletePlan = async (planId) => {
    if (planId === 'plan_default') return;
    setPlanSyncMeta(prev => {
      if (!prev[planId]) return prev;
      const next = { ...prev };
      delete next[planId];
      return next;
    });
    setStudyPlans(prev => {
      const updated = prev.filter(p => p.id !== planId);
      if (activePlanId === planId) {
        setActivePlanId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
    try { await DS.deletePlan(planId); } catch {}
  };

  const handleRenamePlan = async (planId, newName) => {
    setStudyPlans(prev => prev.map(p => p.id === planId ? { ...p, name: newName } : p));
    try { await DS.updatePlan(planId, { name: newName }); } catch {}
  };

  const handleAddActivityToPlan = async (planId, activity) => {
    const nextPlans = studyPlans.map(p => {
      if (p.id !== planId) return p;
      const dayActivities = p.activities[activity.dia] || [];
      return {
        ...p,
        activities: {
          ...p.activities,
          [activity.dia]: [...dayActivities, activity],
        },
      };
    });
    setStudyPlans(nextPlans);
    const updatedPlan = nextPlans.find(p => p.id === planId);
    try {
      if (updatedPlan) {
        await DS.replacePlanActivities(planId, updatedPlan.activities);
      }
    } catch {}
  };

  const handleDeleteActivityFromPlan = async (planId, day, activityId) => {
    const nextPlans = studyPlans.map(p => {
      if (p.id !== planId) return p;
      return {
        ...p,
        activities: {
          ...p.activities,
          [day]: (p.activities[day] || []).filter(a => a.id !== activityId),
        },
      };
    });
    setStudyPlans(nextPlans);
    const updatedPlan = nextPlans.find(p => p.id === planId);
    try {
      if (updatedPlan) {
        await DS.replacePlanActivities(planId, updatedPlan.activities);
      }
    } catch {}
  };

  const handleUpdateActivityInPlan = async (planId, updates) => {
    const plan = studyPlans.find(p => p.id === planId);
    if (!plan) return;

    const newPlans = studyPlans.map(p => {
      if (p.id !== planId) return p;

      const newActivities = { ...p.activities };

      updates.forEach(({ action, day, activityId, activity }) => {
        if (action === 'delete') {
          newActivities[day] = (newActivities[day] || []).filter(a => a.id !== activityId);
        } else if (action === 'update') {
          const targetDay = day || activity?.dia;
          if (!targetDay) return;
          newActivities[targetDay] = (newActivities[targetDay] || []).map(a =>
            a.id === activityId ? { ...a, ...activity, id: activityId, dia: targetDay } : a
          );
        } else if (action === 'add') {
          const targetDay = day || activity?.dia;
          if (!targetDay || !activity) return;
          const dayActs = newActivities[targetDay] || [];
          const activityToAdd = { ...activity, dia: targetDay };
          newActivities[targetDay] = [...dayActs, activityToAdd];
        }
      });

      return { ...p, activities: newActivities };
    });

    setStudyPlans(newPlans);
    const updatedPlan = newPlans.find(p => p.id === planId);
    try {
      if (updatedPlan) {
        await DS.replacePlanActivities(planId, updatedPlan.activities);
      }
    } catch {}
  };

  const handleCopyFromPlan = async (targetPlanId, sourcePlanId) => {
    const source = studyPlans.find(p => p.id === sourcePlanId);
    if (!source) return;

    const copiedActivities = {};
    DAYS_LIST.forEach(d => {
      copiedActivities[d] = (source.activities[d] || []).map(act => ({
        ...act,
        id: `plan-${d}-${act.actividad.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }));
    });

    const nextPlans = studyPlans.map(p => {
      if (p.id !== targetPlanId) return p;
      return { ...p, activities: copiedActivities };
    });
    setStudyPlans(nextPlans);

    try {
      await DS.replacePlanActivities(targetPlanId, copiedActivities);
    } catch {}
  };

  const replaceRemotePlanActivities = useCallback(async (cloudPlanId, activitiesByDay) => {
    const existingGrouped = await api.get(`/plans/${cloudPlanId}/activities`, {
      actionTitle: 'Actividades remotas consultadas'
    });
    const existing = Object.values(existingGrouped || {}).flat();

    for (const activity of existing) {
      if (!activity?.id) continue;
      await api.delete(`/plans/${cloudPlanId}/activities/${activity.id}`, {
        actionTitle: 'Actividad remota eliminada'
      });
    }

    const payloadActivities = flattenPlanActivities(cloudPlanId, activitiesByDay);
    for (const activity of payloadActivities) {
      await api.post(`/plans/${cloudPlanId}/activities`, {
        dia: activity.dia,
        actividad: activity.actividad,
        tipo: activity.tipo,
        icono: activity.icono,
        orden: activity.orden,
        tags: activity.tags,
      }, {
        actionTitle: 'Actividad remota creada'
      });
    }
  }, [flattenPlanActivities]);

  const handleSavePlanToCloud = useCallback(async (planId) => {
    const targetPlan = studyPlans.find(plan => plan.id === planId);
    if (!targetPlan || !currentUserKey) return false;
    if (!user) {
      pushToast({
        type: 'info',
        title: 'Inicia sesión para sincronizar',
        message: 'Tu plan está guardado localmente. Inicia sesión para sincronizarlo con el backend.',
        duration: 6500,
      });
      return false;
    }
    if (targetPlan.id === 'plan_default') {
      pushToast({
        type: 'info',
        title: 'El plan default no se guarda en nube',
        message: 'Crea un plan personalizado para sincronizarlo con backend.',
        duration: 5000,
      });
      return false;
    }

    setIsSavingPlanId(planId);
    try {
      const currentMeta = planSyncMeta[planId] || {};
      let cloudPlanId = currentMeta.cloudPlanId || null;

      if (!cloudPlanId) {
        const createdPlan = await api.post('/plans', {
          name: targetPlan.name || 'Plan de estudios'
        }, {
          actionTitle: 'Plan de estudios guardado con éxito'
        });
        cloudPlanId = createdPlan?.id || null;
      } else {
        await api.put(`/plans/${cloudPlanId}`, {
          name: targetPlan.name || 'Plan de estudios'
        }, {
          actionTitle: 'Plan de estudios guardado con éxito'
        });
      }

      if (!cloudPlanId) {
        throw new Error('No se obtuvo un id de plan en backend.');
      }

      const normalizedActivities = normalizePlanActivitiesByDay(targetPlan.activities || {});
      await replaceRemotePlanActivities(cloudPlanId, normalizedActivities);

      updatePlanSyncMeta(planId, {
        origin: 'cloud',
        cloudPlanId,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        pendingSync: false,
      });

      pushToast({
        type: 'success',
        title: 'Plan de estudios guardado con éxito',
        message: `${targetPlan.name} quedó sincronizado con la nube.`,
        duration: 6000,
      });
      return true;
    } catch (error) {
      updatePlanSyncMeta(planId, {
        origin: 'local',
        lastError: error?.message || 'Error de sincronización',
        pendingSync: true,
      });

      pushToast({
        type: 'error',
        title: 'No se pudo guardar el plan',
        message: error?.message || 'Falló la petición al backend.',
        actionLabel: 'Salió mal petición en backend',
        action: () => {
          setActiveSidebarSection('settings');
          setShowSettingsModal(true);
          setSettingsSection('logs');
        },
        duration: 9000,
      });
      return false;
    } finally {
      setIsSavingPlanId(null);
    }
  }, [
    currentUserKey,
    normalizePlanActivitiesByDay,
    planSyncMeta,
    pushToast,
    replaceRemotePlanActivities,
    studyPlans,
    updatePlanSyncMeta,
    user
  ]);

  useEffect(() => {
    if (!currentUserKey) return undefined;
    const handleOnline = () => {
      const pendingPlans = Object.entries(planSyncMeta)
        .filter(([, meta]) => meta?.pendingSync)
        .map(([planId]) => planId);
      pendingPlans.forEach((planId) => {
        handleSavePlanToCloud(planId).catch(() => {});
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [currentUserKey, planSyncMeta, handleSavePlanToCloud]);

  const handleImportPlanToActive = async (planId, payload) => {
    const targetPlan = studyPlans.find(plan => plan.id === planId);
    if (!targetPlan) return false;

    const normalizedActivities = normalizePlanActivitiesByDay(payload?.activitiesByDay || {});
    const nextName = String(payload?.name || '').trim();

    setStudyPlans(prev => prev.map(plan => (
      plan.id === planId
        ? {
            ...plan,
            name: nextName || plan.name,
            activities: normalizedActivities
          }
        : plan
    )));

    try {
      if (nextName && nextName !== targetPlan.name) {
        await DS.updatePlan(planId, { name: nextName });
      }
      await DS.replacePlanActivities(planId, normalizedActivities);
    } catch {}

    updatePlanSyncMeta(planId, {
      origin: 'local',
      pendingSync: true,
      lastError: null,
    });

    if (payload?.applyToVisibleWeek && currentWeek) {
      const importedWeekActivities = DAYS_LIST.flatMap((day) => (
        (normalizedActivities[day] || []).map((activity, index) => normalizeActivity({
          ...activity,
          id: `${currentWeek}-${day}-${activity.actividad}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          dia: day,
          semana: currentWeek,
          completado: false,
          bloqueada: false,
          spentMinutes: 0,
          pomodoroSessions: 0,
          orden: Number.isFinite(Number(activity.orden)) ? Number(activity.orden) : index,
        }))
      ));

      const dedupedWeek = cleanDuplicatedActivities(importedWeekActivities);
      setWeeksDataWithHistory(prev => ({
        ...prev,
        [currentWeek]: dedupedWeek
      }));
      persistWeekActivities(currentWeek, dedupedWeek);
    }

    pushToast({
      type: 'success',
      title: 'Plan importado con éxito',
      message: payload?.applyToVisibleWeek
        ? 'El plan se aplicó al planificador y a la semana visible.'
        : 'El plan quedó actualizado localmente.',
      duration: 6000,
    });
    return true;
  };

  const handleLogin = async (username, mode = 'login') => {
    const normalizedUsername = normalizeUsername(username);
    try {
      const API_BASE = process.env.REACT_APP_API_URL || '/api';
      if (mode === 'login') {
        const res = await fetch(`${API_BASE}/auth/check/${encodeURIComponent(normalizedUsername)}`);
        if (!res.ok) throw new Error('Error de red');
        const { exists } = await res.json();
        if (!exists) {
          setLoginError('Usuario no encontrado. ¿Quieres crear una cuenta?');
          setAuthMode('register');
          setPendingUsername(normalizedUsername);
          return;
        }
      } else {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: normalizedUsername }),
        });
        if (res.status === 409) {
          setLoginError('Ese usuario ya existe. Inicia sesión.');
          setAuthMode('login');
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setLoginError(data.detail || 'Error al crear usuario');
          return;
        }
      }
    } catch {
      // offline - continuar con localStorage
    }

    localStorage.setItem('lastLoggedUsername', normalizedUsername);
    localStorage.setItem('hasHadUser', 'true');
    localStorage.setItem('sync_user_id', normalizedUsername);
    setUser({ username: normalizedUsername });
    setLoginError('');
  };

  const handleLogout = () => {
    localStorage.removeItem('lastLoggedUsername');
    setUser(null);
  };


  const initializeWeekRef = useRef(false);

  useEffect(() => {
    initializeWeekRef.current = false;
  }, [currentWeek]);

  useEffect(() => {
    if (!currentUserKey || !currentWeek) return;
    if (!areWeeksLoaded) return;
    if (initializeWeekRef.current) return;
    if (weeksData[currentWeek] && weeksData[currentWeek].length > 0) {
      if (weekPlanIds[currentWeek] === activePlanId) return;
    }
    if (!activePlanId || studyPlans.length === 0) return;
    initializeWeekRef.current = true;

    const initializeWeek = async () => {
      try {
        const week = await DS.getWeek(currentUserKey, currentWeek);
        if (week) {
          const { all } = await DS.getWeekActivities(week.id);
          const planMatches = week.plan_id === activePlanId;
          if (all.length > 0 && planMatches) {
            const deduped = cleanDuplicatedActivities(all);
            if (deduped.length !== all.length) {
              await DS.replaceWeekActivities(week.id, deduped, currentWeek);
            }
            setWeeksData(prev => ({ ...prev, [currentWeek]: deduped }));
            setWeekPlanIds(prev => ({ ...prev, [currentWeek]: activePlanId }));
            return;
          }
        }
        const activePlan = studyPlans.find(p => p.id === activePlanId);
        if (activePlan?.activities) {
          await DS.deployPlanToWeek(currentUserKey, currentWeek, activePlanId);
          const deployedWeek = await DS.getWeek(currentUserKey, currentWeek);
          if (deployedWeek) {
            const { all } = await DS.getWeekActivities(deployedWeek.id);
            const deduped = cleanDuplicatedActivities(all);
            if (deduped.length !== all.length) {
              await DS.replaceWeekActivities(deployedWeek.id, deduped, currentWeek);
            }
            setWeeksData(prev => ({ ...prev, [currentWeek]: deduped }));
            setWeekPlanIds(prev => ({ ...prev, [currentWeek]: activePlanId }));
          }
        }
      } catch {
        console.error('Error initializing week');
        initializeWeekRef.current = false;
      }
    };
    initializeWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeek, currentUserKey, studyPlans, activePlanId, areWeeksLoaded, weeksData, weekPlanIds]);

  const currentWeekData = useMemo(
    () => (Array.isArray(weeksData[currentWeek]) ? weeksData[currentWeek] : []),
    [weeksData, currentWeek]
  );

  const allActivities = Object.values(weeksData).flat();
  const globalTodoTotalCount = globalTodos.length;
  const globalTodoRemainingCount = globalTodos.filter(todo => !todo.completed).length;

  const activitiesById = useMemo(() => {
    const map = new Map();
    allActivities.forEach(activity => {
      if (activity?.id && !map.has(activity.id)) {
        map.set(activity.id, activity);
      }
    });
    return map;
  }, [allActivities]);

  const activityTodoSummaries = useMemo(() => {
    return Object.entries(activityTodosMap)
      .map(([activityId, todos]) => {
        const todoList = Array.isArray(todos) ? todos : [];
        if (todoList.length === 0) return null;

        const total = todoList.length;
        const completed = todoList.filter(todo => Boolean(todo?.completed)).length;
        const pending = total - completed;
        const activityReference = activitiesById.get(activityId);

        return {
          activityId,
          total,
          completed,
          pending,
          activity: activityReference || {
            id: activityId,
            actividad: 'Actividad sin referencia',
            tipo: 'Sin tipo',
            icono: '📝'
          }
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aHasPending = a.pending > 0 ? 1 : 0;
        const bHasPending = b.pending > 0 ? 1 : 0;
        if (aHasPending !== bHasPending) return bHasPending - aHasPending;
        if (a.total !== b.total) return b.total - a.total;
        return (a.activity?.actividad || '').localeCompare(b.activity?.actividad || '');
      });
  }, [activityTodosMap, activitiesById]);

  useEffect(() => {
    requestNotificationPermission();
    const savedConfig = getPomodoroConfig();
    setPomodoroConfig(savedConfig);
    const saved = getPomodoroState();
    if (saved) {
      const mergedSaved = {
        ...saved,
        workDuration: Number(saved.workDuration || savedConfig.workDuration || DEFAULT_POMODORO_CONFIG.workDuration),
        breakDuration: Number(saved.breakDuration || savedConfig.breakDuration || DEFAULT_POMODORO_CONFIG.breakDuration),
        longBreakDuration: Number(saved.longBreakDuration || savedConfig.longBreakDuration || DEFAULT_POMODORO_CONFIG.longBreakDuration),
        sessionsBeforeLongBreak: Number(saved.sessionsBeforeLongBreak || savedConfig.sessionsBeforeLongBreak || DEFAULT_POMODORO_CONFIG.sessionsBeforeLongBreak),
      };
      if (saved.pausedAt) {
        setPomodoroState(mergedSaved);
      } else {
        const startedAt = new Date(mergedSaved.startedAt).getTime();
        const duration = (
          mergedSaved.phase === 'work'
            ? (mergedSaved.workDuration || savedConfig.workDuration || DEFAULT_POMODORO_CONFIG.workDuration)
            : mergedSaved.phase === 'break'
              ? (mergedSaved.breakDuration || savedConfig.breakDuration || DEFAULT_POMODORO_CONFIG.breakDuration)
              : (mergedSaved.longBreakDuration || savedConfig.longBreakDuration || DEFAULT_POMODORO_CONFIG.longBreakDuration)
        ) * 60;
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        if (elapsed >= duration) {
          const completedState = { ...mergedSaved, pausedAt: new Date().toISOString(), remaining: 0 };
          setPomodoroState(completedState);
          savePomodoroState(completedState);
        } else {
          const pausedState = { ...mergedSaved, pausedAt: new Date().toISOString(), remaining: duration - elapsed };
          setPomodoroState(pausedState);
          savePomodoroState(pausedState);
        }
      }
    }
  }, []);

  const handleUpdatePomodoroConfig = useCallback((patch = {}) => {
    if (!patch || typeof patch !== 'object') return;
    setPomodoroConfig(prev => {
      const nextRaw = { ...prev, ...patch };
      const next = savePomodoroConfig(nextRaw);
      setPomodoroState(current => {
        if (!current) return current;

        const phase = current.phase || 'work';
        const currentDuration = phase === 'work'
          ? (current.workDuration || prev.workDuration || DEFAULT_POMODORO_CONFIG.workDuration)
          : phase === 'break'
            ? (current.breakDuration || prev.breakDuration || DEFAULT_POMODORO_CONFIG.breakDuration)
            : (current.longBreakDuration || prev.longBreakDuration || DEFAULT_POMODORO_CONFIG.longBreakDuration);
        const nextDuration = phase === 'work'
          ? next.workDuration
          : phase === 'break'
            ? next.breakDuration
            : next.longBreakDuration;
        const currentDurationSec = currentDuration * 60;
        const nextDurationSec = nextDuration * 60;
        const currentRemaining = Number(current.remaining || 0);
        const elapsed = Math.max(0, currentDurationSec - currentRemaining);
        const nextRemaining = Math.max(0, nextDurationSec - elapsed);
        const adjustedStartedAt = new Date(Date.now() - elapsed * 1000).toISOString();

        const updatedState = {
          ...current,
          workDuration: next.workDuration,
          breakDuration: next.breakDuration,
          longBreakDuration: next.longBreakDuration,
          sessionsBeforeLongBreak: next.sessionsBeforeLongBreak,
          startedAt: current.pausedAt ? current.startedAt : adjustedStartedAt,
          remaining: current.pausedAt ? Math.min(currentRemaining, nextDurationSec) : nextRemaining,
        };
        savePomodoroState(updatedState);
        return updatedState;
      });
      return next;
    });
  }, []);

  const beginPomodoroSession = useCallback((activity, selectedWorkDuration) => {
    if (!activity?.activityId) return;

    const existingActivity = allActivities.find(a => a.id === activity.activityId);
    const spentBefore = existingActivity?.spentMinutes || 0;
    const workDuration = Number.isFinite(Number(selectedWorkDuration))
      ? Number(selectedWorkDuration)
      : (pomodoroConfig.workDuration || DEFAULT_POMODORO_CONFIG.workDuration);
    const breakDuration = pomodoroConfig.breakDuration || DEFAULT_POMODORO_CONFIG.breakDuration;
    const longBreakDuration = pomodoroConfig.longBreakDuration || DEFAULT_POMODORO_CONFIG.longBreakDuration;
    const sessionsBeforeLongBreak = pomodoroConfig.sessionsBeforeLongBreak || DEFAULT_POMODORO_CONFIG.sessionsBeforeLongBreak;
    const targetMinutes = getEstimatedTargetMinutes(activity.activityType);

    const state = {
      id: activity.activityId,
      activityId: activity.activityId,
      activityName: activity.activityName,
      activityType: activity.activityType,
      activityIcon: activity.activityIcon || '📌',
      phase: 'work',
      startedAt: new Date().toISOString(),
      pausedAt: null,
      remaining: workDuration * 60,
      workDuration,
      breakDuration,
      longBreakDuration,
      sessionsBeforeLongBreak,
      totalSessions: 1,
      targetMinutes,
      spentBefore,
    };

    setPomodoroState(state);
    savePomodoroState(state);
  }, [allActivities, pomodoroConfig]);

  const startPomodoroForActivity = useCallback((activityId, activityName, activityType, activityIcon) => {
    const normalizedActivity = {
      activityId,
      activityName,
      activityType,
      activityIcon
    };

    const durationOptions = getPomodoroDurationOptions(activityType);
    const maxOption = Math.max(...durationOptions);

    if (maxOption > 20 && durationOptions.length > 1) {
      setPomodoroStartSelector({
        open: true,
        activity: normalizedActivity,
        options: durationOptions
      });
      return;
    }

    beginPomodoroSession(normalizedActivity, durationOptions[0] || 25);
  }, [beginPomodoroSession]);

  const handlePomodoroPause = useCallback((remaining) => {
    setPomodoroState(prev => {
      if (!prev) return null;
      const updated = { ...prev, pausedAt: new Date().toISOString(), remaining };
      savePomodoroState(updated);
      return updated;
    });
  }, []);

  const handlePomodoroResume = useCallback((remaining) => {
    setPomodoroState(prev => {
      if (!prev) return null;
      const normalizedRemaining = Number.isFinite(Number(remaining))
        ? Math.max(0, Number(remaining))
        : (prev.remaining || 0);
      const totalDurationSeconds = prev.phase === 'work'
        ? (prev.workDuration || 25) * 60
        : prev.phase === 'break'
          ? (prev.breakDuration || 5) * 60
          : (prev.longBreakDuration || DEFAULT_POMODORO_CONFIG.longBreakDuration) * 60;
      const elapsedBeforeResume = Math.max(0, totalDurationSeconds - normalizedRemaining);
      const resumedStartedAt = new Date(Date.now() - elapsedBeforeResume * 1000).toISOString();

      const updated = {
        ...prev,
        startedAt: resumedStartedAt,
        pausedAt: null,
        remaining: normalizedRemaining,
      };
      savePomodoroState(updated);
      return updated;
    });
  }, []);

  const buildPausedPomodoroState = useCallback((state) => {
    if (!state || state.pausedAt) return state;
    const totalDurationSeconds = state.phase === 'work'
      ? (state.workDuration || DEFAULT_POMODORO_CONFIG.workDuration) * 60
      : state.phase === 'break'
        ? (state.breakDuration || DEFAULT_POMODORO_CONFIG.breakDuration) * 60
        : (state.longBreakDuration || DEFAULT_POMODORO_CONFIG.longBreakDuration) * 60;
    const startedAtTime = new Date(state.startedAt || Date.now()).getTime();
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAtTime) / 1000));
    const remaining = Math.max(0, totalDurationSeconds - elapsed);
    return {
      ...state,
      pausedAt: new Date().toISOString(),
      remaining,
    };
  }, []);

  const handlePomodoroCompleteSession = useCallback(() => {
    setPomodoroState(prev => {
      if (!prev) return null;
      const activityId = prev.activityId;
      const workMinutes = prev.workDuration || 25;

      setWeeksData(prevWeeks => {
        const newWeeks = { ...prevWeeks };
        for (const [weekKey, activities] of Object.entries(newWeeks)) {
          const idx = activities.findIndex(a => a.id === activityId);
          if (idx >= 0) {
            const updated = [...activities];
            updated[idx] = {
              ...updated[idx],
              spentMinutes: (updated[idx].spentMinutes || 0) + workMinutes,
              pomodoroSessions: (updated[idx].pomodoroSessions || 0) + 1,
            };
            newWeeks[weekKey] = updated;
            DS.updateWeekActivity(updated[idx].id, {
              spent_minutes: updated[idx].spentMinutes,
              pomodoro_sessions: updated[idx].pomodoroSessions,
            }).catch(() => {});
            DS.savePomodoroSession(normalizeUsername(user?.username), {
              id: `pom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              week_activity_id: activityId,
              activity_name: prev.activityName,
              activity_type: prev.activityType,
              duration_minutes: workMinutes,
              phase: 'work',
              completed_at: new Date().toISOString(),
            }).catch(() => {});
            break;
          }
        }
        return newWeeks;
      });

      const totalSessions = (prev.totalSessions || 0) + 1;
      const sessionsBeforeLongBreak = prev.sessionsBeforeLongBreak || pomodoroConfig.sessionsBeforeLongBreak || DEFAULT_POMODORO_CONFIG.sessionsBeforeLongBreak;
      const isLongBreak = totalSessions % sessionsBeforeLongBreak === 0;
      const longBreakDuration = prev.longBreakDuration || pomodoroConfig.longBreakDuration || DEFAULT_POMODORO_CONFIG.longBreakDuration;

      const breakState = {
        ...prev,
        phase: isLongBreak ? 'long_break' : 'break',
        startedAt: new Date().toISOString(),
        pausedAt: null,
        remaining: (isLongBreak ? longBreakDuration : prev.breakDuration || 5) * 60,
        totalSessions,
        sessionsBeforeLongBreak,
        longBreakDuration,
        spentBefore: (prev.spentBefore || 0) + workMinutes,
      };
      savePomodoroState(breakState);
      return breakState;
    });
  }, [pomodoroConfig.longBreakDuration, pomodoroConfig.sessionsBeforeLongBreak, user?.username]);

  const handlePomodoroSkip = useCallback(() => {
    setPomodoroState(prev => {
      if (!prev) return null;
      const workState = {
        ...prev,
        phase: 'work',
        startedAt: new Date().toISOString(),
        pausedAt: null,
        remaining: (prev.workDuration || 25) * 60,
      };
      savePomodoroState(workState);
      return workState;
    });
  }, []);

  const handlePomodoroCancel = useCallback(() => {
    setPomodoroState(null);
    clearPomodoroState();
  }, []);

  const handleClosePomodoroSelector = useCallback(() => {
    setPomodoroStartSelector({
      open: false,
      activity: null,
      options: []
    });
  }, []);

  const handleChoosePomodoroDuration = useCallback((minutes) => {
    const selectedMinutes = Number(minutes);
    if (!pomodoroStartSelector.activity || !Number.isFinite(selectedMinutes)) {
      handleClosePomodoroSelector();
      return;
    }
    beginPomodoroSession(pomodoroStartSelector.activity, selectedMinutes);
    handleClosePomodoroSelector();
  }, [beginPomodoroSession, handleClosePomodoroSelector, pomodoroStartSelector.activity]);

  useEffect(() => {
    if (!pomodoroState || pomodoroState.pausedAt || typeof window === 'undefined') return undefined;

    const handlePageHide = () => {
      setPomodoroState(prev => {
        const next = buildPausedPomodoroState(prev);
        if (!next) return prev;
        savePomodoroState(next);
        return next;
      });
    };

    const handleBeforeUnload = () => {
      const latest = getPomodoroState() || pomodoroState;
      const next = buildPausedPomodoroState(latest);
      if (next) {
        savePomodoroState(next);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [buildPausedPomodoroState, pomodoroState]);

  useEffect(() => {
    if (!pomodoroStartSelector.open) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        handleClosePomodoroSelector();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [pomodoroStartSelector.open, handleClosePomodoroSelector]);

  const realToday = startOfDay(new Date());
  const realWeekStart = format(startOfWeek(realToday, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const todayDayNameForKanban = DAYS_LIST[realToday.getDay() === 0 ? 6 : realToday.getDay() - 1];
  const isViewingCurrentWeek = currentWeek === realWeekStart;

  const kanbanActivityCards = useMemo(() => {
    if (!isViewingCurrentWeek) return [];

    const seenActivityIds = new Set();
    return (currentWeekData || [])
      .filter(activity => {
        if (!activity?.id || seenActivityIds.has(activity.id)) return false;
        seenActivityIds.add(activity.id);
        return activity.dia === todayDayNameForKanban && !activity.bloqueada;
      })
      .sort((a, b) => {
        const pa = ACTIVITY_TYPE_ORDER[a?.tipo] ?? 999;
        const pb = ACTIVITY_TYPE_ORDER[b?.tipo] ?? 999;
        if (pa !== pb) return pa - pb;
        return (a?.actividad || '').localeCompare(b?.actividad || '');
      })
      .map(activity => {
        const status = getActivityKanbanStatus(activity);
        return {
          id: `activity:${activity.id}`,
          source: 'activity',
          sourceId: activity.id,
          text: activity.actividad || 'Actividad',
          description: activity.tipo || '',
          priority: getPriorityFromActivityType(activity.tipo),
          tags: Array.isArray(activity.tags) ? activity.tags : [],
          dueDate: null,
          status,
          completed: status === 'done',
          icono: activity.icono || TYPE_ICON_MAP[activity.tipo] || '📝',
          activityType: activity.tipo || '',
          createdAt: activity.createdAt || activity.created_at || '',
          updatedAt: activity.updatedAt || activity.updated_at || ''
        };
      });
  }, [currentWeekData, isViewingCurrentWeek, todayDayNameForKanban]);

  const kanbanGlobalCards = useMemo(() => {
    return globalTodos.map(todo => ({
      ...todo,
      id: `global:${todo.id}`,
      source: 'global',
      sourceId: todo.id
    }));
  }, [globalTodos]);

  const kanbanFilteredCards = useMemo(() => {
    const normalizedQuery = kanbanFilter.query.trim().toLowerCase();
    const normalizedTag = kanbanFilter.tag.trim().toLowerCase();

    const baseItems = [...kanbanActivityCards, ...kanbanGlobalCards];

    const filtered = baseItems.filter(item => {
      if (!item) return false;

      const matchesStatus = kanbanFilter.status === 'all' || item.status === kanbanFilter.status;
      const matchesPriority = kanbanFilter.priority === 'all' || item.priority === kanbanFilter.priority;
      const tags = Array.isArray(item.tags) ? item.tags : [];

      const matchesTag = !normalizedTag || tags.some(tag => tag.toLowerCase().includes(normalizedTag));
      const haystack = [
        item.text,
        item.description,
        ...tags,
        item.activityType || '',
        KANBAN_STATUS_LABELS[item.status] || '',
        item.source === 'activity' ? 'actividad planner' : 'todo global'
      ].join(' ').toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);

      return matchesStatus && matchesPriority && matchesTag && matchesQuery;
    });

    if (kanbanSort === 'manual') {
      return filtered;
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (kanbanSort === 'updatedAt') {
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      }
      if (kanbanSort === 'createdAt') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (kanbanSort === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (kanbanSort === 'priority') {
        return (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
      }
      return 0;
    });
    return sorted;
  }, [kanbanActivityCards, kanbanGlobalCards, kanbanFilter, kanbanSort]);

  const kanbanColumns = useMemo(() => {
    return KANBAN_STATUSES.reduce((acc, status) => {
      acc[status.key] = kanbanFilteredCards.filter(item => item.status === status.key);
      return acc;
    }, {});
  }, [kanbanFilteredCards]);

  const kanbanContextNotice = isViewingCurrentWeek
    ? ''
    : 'Estás viendo una semana distinta. Vuelve a la semana actual para ver actividades de hoy en el Kanban.';

  const cloneWeeksData = (data) => cloneJson(data || {}, {});

  const persistWeekActivities = async (weekKey, activities) => {
    if (!weekKey || !currentUserKey) return;
    try {
      let week = await DS.getWeek(currentUserKey, weekKey);
      if (!week) week = await DS.getOrCreateWeek(currentUserKey, weekKey, activePlanId);
      const deduped = cleanDuplicatedActivities(activities || []);
      await DS.replaceWeekActivities(week.id, deduped, weekKey);
      // Eager sync: enqueue each activity then push to cloud
      for (const act of deduped) {
        await enqueueOperation({
          op_id: `${currentUserKey}-${act.id}-${act.updated_at}`,
          table: 'week_activities',
          operation: 'UPDATE',
          record_id: act.id,
          data: act,
        });
      }
      pushPendingChanges(currentUserKey).catch(() => {});
    } catch {}
  };

  // Periodic pull: every 30s fetch changes from cloud and reload current week state
  useEffect(() => {
    if (!currentUserKey || !currentWeek) return;
    const syncAndReload = async () => {
      try {
        await pullChanges(currentUserKey);
        const week = await DS.getWeek(currentUserKey, currentWeek);
        if (week) {
          const { all } = await DS.getWeekActivities(week.id);
          setWeeksData(prev => ({ ...prev, [currentWeek]: cleanDuplicatedActivities(all) }));
        }
      } catch {}
    };
    const interval = setInterval(syncAndReload, 30000);
    return () => clearInterval(interval);
  }, [currentUserKey, currentWeek]);

  const setWeeksDataWithHistory = (updater) => {
    setWeeksData(prevWeeksData => {
      const nextWeeksData = typeof updater === 'function' ? updater(prevWeeksData) : updater;
      if (!nextWeeksData) return prevWeeksData;

      const prevSerialized = JSON.stringify(prevWeeksData);
      const nextSerialized = JSON.stringify(nextWeeksData);

      if (prevSerialized === nextSerialized) {
        return prevWeeksData;
      }

      setUndoStack(prevUndo => [
        ...prevUndo.slice(-(HISTORY_LIMIT - 1)),
        JSON.parse(prevSerialized)
      ]);
      setRedoStack([]);

      return JSON.parse(nextSerialized);
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;

    const previousSnapshot = undoStack[undoStack.length - 1];
    const currentSnapshot = cloneWeeksData(weeksData);

    setUndoStack(prevUndo => prevUndo.slice(0, -1));
    setRedoStack(prevRedo => [
      ...prevRedo.slice(-(HISTORY_LIMIT - 1)),
      currentSnapshot
    ]);
    setWeeksData(previousSnapshot);
    persistWeekActivities(currentWeek, previousSnapshot[currentWeek] || []);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;

    const nextSnapshot = redoStack[redoStack.length - 1];
    const currentSnapshot = cloneWeeksData(weeksData);

    setRedoStack(prevRedo => prevRedo.slice(0, -1));
    setUndoStack(prevUndo => [
      ...prevUndo.slice(-(HISTORY_LIMIT - 1)),
      currentSnapshot
    ]);
    setWeeksData(nextSnapshot);
    persistWeekActivities(currentWeek, nextSnapshot[currentWeek] || []);
  };

  const handleToggleActivity = (id) => {
    setWeeksDataWithHistory(prevWeeksData => {
      const weekActivities = Array.isArray(prevWeeksData[currentWeek]) ? prevWeeksData[currentWeek] : [];
      const updatedActivities = weekActivities.map(act =>
        act.id === id
          ? (act.bloqueada ? act : normalizeActivity({ ...act, completado: !act.completado }))
          : normalizeActivity(act)
      );

      const nextWeeksData = {
        ...prevWeeksData,
        [currentWeek]: updatedActivities,
      };

      persistWeekActivities(currentWeek, updatedActivities);
      return nextWeeksData;
    });
  };
  
  const navigateWeek = (direction) => {
    const currentMonday = parseISO(currentWeek);
    const currentWeekStart = startOfDay(currentMonday);
    const currentSelected = startOfDay(selectedDate);

    // Mantener el mismo día de la semana al navegar (ej: Mié -> Mié)
    const rawOffset = differenceInCalendarDays(currentSelected, currentWeekStart);
    const dayOffset = Math.min(6, Math.max(0, rawOffset));

    const newMonday = addDays(currentMonday, direction === 'next' ? 7 : -7);
    const newWeek = format(newMonday, 'yyyy-MM-dd');
    setCurrentWeek(newWeek);

    const newSelectedDate = addDays(startOfDay(newMonday), dayOffset);
    setSelectedDate(newSelectedDate);
  };
  
  const completedCount = currentWeekData.filter(a => a && !a.bloqueada && a.completado).length;
  const totalCount = currentWeekData.filter(a => a && !a.bloqueada).length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const getProgressBarEmoji = (percentage) => {
    if (percentage === 100) return '🎉';
    if (percentage >= 75) return '💪';
    if (percentage >= 50) return '🚀';
    if (percentage >= 25) return '✨';
    return '📚';
  };

  const progressText = `Progreso: ${completedCount}/${totalCount} actividades ${getProgressBarEmoji(progress)}`;

  const days = useMemo(() => ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'], []);
  
  // Create a map to track unique activities by ID
  const uniqueActivitiesMap = new Map();
  
  // Filter out duplicates by using the activity ID
  const uniqueActivities = (currentWeekData || []).filter(activity => {
    if (!activity || !activity.id || !activity.dia) return false;
    
    // If we've already seen this activity, skip it
    if (uniqueActivitiesMap.has(activity.id)) {
      return false;
    }
    
    // Otherwise, add it to our map and include it
    uniqueActivitiesMap.set(activity.id, true);
    return true;
  });
  
  // Group activities by day
  const activitiesByDay = uniqueActivities.reduce((acc, activity) => {
    const day = activity.dia;
    if (!acc[day]) acc[day] = [];
    acc[day].push(activity);
    return acc;
  }, {});

  Object.keys(activitiesByDay).forEach(day => {
    activitiesByDay[day] = (activitiesByDay[day] || []).slice().sort((a, b) => {
      const ba = Boolean(a?.bloqueada);
      const bb = Boolean(b?.bloqueada);
      if (ba !== bb) return ba ? 1 : -1; // bloqueadas siempre al final
      const pa = ACTIVITY_TYPE_ORDER[a?.tipo] ?? 999;
      const pb = ACTIVITY_TYPE_ORDER[b?.tipo] ?? 999;
      if (pa !== pb) return pa - pb;
      // Desempate estable: por nombre (si existe)
      const na = (a?.actividad || '').toString();
      const nb = (b?.actividad || '').toString();
      return na.localeCompare(nb);
    });
  });
  
  // Ensure all days exist in the object, even if empty
  days.forEach(day => {
    if (!activitiesByDay[day]) {
      activitiesByDay[day] = [];
    }
  });

  const suggestedTags = ['Algoritmos', 'Proyecto', 'Lectura'];
  const availableTags = [...new Set([
    ...suggestedTags,
    ...currentWeekData.flatMap(activity => (Array.isArray(activity.tags) ? activity.tags : []))
  ])].filter(Boolean);
  const contextTagOptions = [...new Set([
    ...availableTags,
    ...(Array.isArray(contextTagsForm.selectedTags) ? contextTagsForm.selectedTags : [])
  ])].filter(Boolean);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesActivityFilters = (activity) => {
    const tags = Array.isArray(activity.tags) ? activity.tags : [];
    const matchesSearch =
      !normalizedQuery ||
      activity.actividad?.toLowerCase().includes(normalizedQuery) ||
      activity.tipo?.toLowerCase().includes(normalizedQuery) ||
      tags.some(tag => tag.toLowerCase().includes(normalizedQuery));

    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.every(selectedTag =>
        tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
      );

    return matchesSearch && matchesTags;
  };

  const filteredActivitiesByDay = days.reduce((acc, day) => {
    acc[day] = (activitiesByDay[day] || []).filter(matchesActivityFilters);
    return acc;
  }, {});

  const focusCandidates = days
    .flatMap(day => filteredActivitiesByDay[day] || [])
    .filter(activity => !activity.bloqueada && !activity.completado)
    .filter(activity => !focusSkippedIds.includes(activity.id));

  const currentFocusActivity = focusCandidates[0] || null;
  const nextFocusActivity = focusCandidates[1] || null;
  
  const getDayNumber = (dayName) => {
    const dayIndex = days.indexOf(dayName);
    if (dayIndex === -1) return '';
    
    const weekStart = parseISO(currentWeek);
    const dayDate = addDays(weekStart, dayIndex);
    return format(dayDate, 'd');
  };
  
  const today = startOfDay(new Date());
  const todayFormatted = format(today, 'yyyy-MM-dd');
  // eslint-disable-next-line
  const todayDayName = days[today.getDay() === 0 ? 6 : today.getDay() - 1]; 
  
  const isCurrentDay = (dayName) => {
    const weekStart = parseISO(currentWeek);
    const dayIndex = days.indexOf(dayName);
    const dayDate = addDays(weekStart, dayIndex);
    
    const dayFormatted = format(dayDate, 'yyyy-MM-dd');
    
    return dayFormatted === todayFormatted;
  };

  const getDateForDay = (dayName) => {
    const dayIndex = days.indexOf(dayName);
    if (dayIndex === -1) return parseISO(currentWeek);
    return addDays(parseISO(currentWeek), dayIndex);
  };

  const closeActivityContextMenu = () => {
    setShowContextMovePicker(false);
    setActivityContextMenu({
      open: false,
      activityId: null,
      day: null,
      x: 0,
      y: 0
    });
  };

  const openActivityContextMenu = ({ activityId, day, x, y }) => {
    if (!activityId || !day) return;
    setShowContextMovePicker(false);

    const menuWidth = 224;
    const menuHeight = 320;
    const padding = 12;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const nextX = Number.isFinite(x) ? x : padding;
    const nextY = Number.isFinite(y) ? y : padding;
    const clampedX = Math.min(
      Math.max(padding, nextX),
      Math.max(padding, viewportWidth - menuWidth - padding)
    );
    const clampedY = Math.min(
      Math.max(padding, nextY),
      Math.max(padding, viewportHeight - menuHeight - padding)
    );

    setActivityContextMenu({
      open: true,
      activityId,
      day,
      x: clampedX,
      y: clampedY
    });
  };

  const contextMenuActivity = activityContextMenu.open
    ? currentWeekData.find(activity => activity.id === activityContextMenu.activityId) || null
    : null;
  const contextMenuDayIndex = contextMenuActivity ? days.indexOf(contextMenuActivity.dia) : -1;
  const canMoveContextTomorrow =
    Boolean(contextMenuActivity) &&
    contextMenuDayIndex >= 0 &&
    contextMenuDayIndex < days.length - 1;
  const canMoveContextToMonday =
    Boolean(contextMenuActivity) &&
    contextMenuDayIndex > 0;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [notes, setNotes] = useState({}); 
  const [completions, setCompletions] = useState({});
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isResourcesModalOpen, setIsResourcesModalOpen] = useState(false);
  const [activeSidebarSection, setActiveSidebarSection] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const closeMobileSidebarIfNeeded = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 920px)').matches) {
      setIsMobileSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 920px)');
    if (!mediaQuery.matches) {
      setIsMobileSidebarOpen(false);
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    if (isMobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow || '';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return undefined;
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isMobileSidebarOpen]);

  const handleSaveNotes = (dayKey, newNotes) => {
    setNotes(prevNotes => ({ ...prevNotes, [dayKey]: newNotes }));
    if (currentUserKey && currentWeek) {
      DS.getWeek(currentUserKey, currentWeek).then(week => {
        if (week) DS.saveWeekNote(week.id, dayKey, newNotes).catch(() => {});
      });
    }
  };

  const handleCheckAll = (dayKey) => {
    setWeeksDataWithHistory(prevWeeksData => {
      const weekActivities = Array.isArray(prevWeeksData[currentWeek]) ? prevWeeksData[currentWeek] : [];
      const updatedActivities = weekActivities.map(activity =>
        activity.dia === dayKey && !activity.bloqueada
          ? normalizeActivity({ ...activity, completado: true })
          : normalizeActivity(activity)
      );

      const nextWeeksData = {
        ...prevWeeksData,
        [currentWeek]: updatedActivities
      };
      persistWeekActivities(currentWeek, updatedActivities);
      return nextWeeksData;
    });
  };

  const handleUncheckAll = (dayKey) => {
    setWeeksDataWithHistory(prevWeeksData => {
      const weekActivities = Array.isArray(prevWeeksData[currentWeek]) ? prevWeeksData[currentWeek] : [];
      const updatedActivities = weekActivities.map(activity =>
        activity.dia === dayKey && !activity.bloqueada
          ? normalizeActivity({ ...activity, completado: false })
          : normalizeActivity(activity)
      );

      const nextWeeksData = {
        ...prevWeeksData,
        [currentWeek]: updatedActivities
      };
      persistWeekActivities(currentWeek, updatedActivities);
      return nextWeeksData;
    });
  };

  const handleDayClick = (day) => {
    setSelectedDay(day);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDay(null);
  };

  const handleOpenCalendar = () => {
    setActiveSidebarSection('calendar');
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
    setIsCalendarModalOpen(true);
  };

  const handleCloseCalendar = () => {
    setIsCalendarModalOpen(false);
    setActiveSidebarSection('dashboard');
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
  };

  const handleOpenFrequency = () => {
    setActiveSidebarSection('activity');
    setIsCalendarModalOpen(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
    setShowFrequencyModal(true);
  };

  const handleCloseFrequency = () => {
    setShowFrequencyModal(false);
    setActiveSidebarSection('dashboard');
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
  };

  const handleOpenSettings = () => {
    setActiveSidebarSection('settings');
    setSettingsSection('activities');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setIsResourcesModalOpen(false);
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
    setShowSettingsModal(true);
  };

  const handleAddActivity = (newActivity, day) => {
    setWeeksDataWithHistory(prevWeeksData => {
      const newWeeksData = { ...prevWeeksData };
      const weekKey = currentWeek;
      
      if (!newWeeksData[weekKey]) {
        newWeeksData[weekKey] = [];
      }
      
      const activityToAdd = normalizeActivity({
        ...newActivity,
        semana: weekKey,
        dia: day,
        id: `${weekKey}-${day}-${newActivity.actividad}-${Date.now()}`,
        completado: Boolean(newActivity.completado)
      });
      
      const existingIndex = newWeeksData[weekKey].findIndex(
        act => act.id === activityToAdd.id
      );
      
      if (existingIndex >= 0) {
        newWeeksData[weekKey][existingIndex] = activityToAdd;
      } else {
        newWeeksData[weekKey] = [
          ...(newWeeksData[weekKey] || []),
          activityToAdd
        ];
      }
      
      persistWeekActivities(weekKey, newWeeksData[weekKey] || []);

      // Two-way sync: also add to active plan
      if (activePlanId) {
        const planActivity = {
          id: `plan-${day}-${newActivity.actividad.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          actividad: newActivity.actividad,
          tipo: newActivity.tipo,
          icono: newActivity.icono || '📝',
          dia: day,
          completado: false,
          bloqueada: false,
          tags: newActivity.tags || [],
          targetMinutes: 0,
          spentMinutes: 0,
          pomodoroSessions: 0,
        };
        setStudyPlans(prev => prev.map(p => {
          if (p.id !== activePlanId) return p;
          const dayActivities = p.activities[day] || [];
          return {
            ...p,
            activities: {
              ...p.activities,
              [day]: [...dayActivities, planActivity],
            },
          };
        }));
      }
      
      return newWeeksData;
    });
  };

  const handleUpdateActivity = (activityId, updates) => {
    setWeeksDataWithHistory(prevWeeksData => {
      const weekKey = currentWeek;
      const weekActivities = Array.isArray(prevWeeksData[weekKey]) ? prevWeeksData[weekKey] : [];
      const updatedActivities = weekActivities.map(activity => (
        activity.id === activityId ? normalizeActivity({ ...activity, ...updates }) : normalizeActivity(activity)
      ));

      const newWeeksData = {
        ...prevWeeksData,
        [weekKey]: updatedActivities
      };

      persistWeekActivities(weekKey, updatedActivities);
      return newWeeksData;
    });
  };

  const handleDeleteActivity = (activityId) => {
    setWeeksDataWithHistory(prevWeeksData => {
      const weekKey = currentWeek;
      const weekActivities = Array.isArray(prevWeeksData[weekKey]) ? prevWeeksData[weekKey] : [];
      const updatedActivities = weekActivities.filter(activity => activity.id !== activityId);

      const newWeeksData = {
        ...prevWeeksData,
        [weekKey]: updatedActivities
      };

      persistWeekActivities(weekKey, updatedActivities);
      return newWeeksData;
    });
  };

  const moveActivityToDay = (activityId, targetDay) => {
    if (!activityId || !targetDay || !days.includes(targetDay)) return;

    setWeeksDataWithHistory(prevWeeksData => {
      const weekKey = currentWeek;
      const weekActivities = Array.isArray(prevWeeksData[weekKey]) ? prevWeeksData[weekKey] : [];
      const activityToMove = weekActivities.find(activity => activity.id === activityId);
      if (!activityToMove || activityToMove.dia === targetDay) return prevWeeksData;

      const updatedActivities = weekActivities.map(activity =>
        activity.id === activityId
          ? normalizeActivity({ ...activity, dia: targetDay, semana: weekKey })
          : normalizeActivity(activity)
      );

      const newWeeksData = {
        ...prevWeeksData,
        [weekKey]: updatedActivities
      };

      persistWeekActivities(weekKey, updatedActivities);
      return newWeeksData;
    });
  };

  const handleMoveActivityTomorrow = (activityId) => {
    const activity = currentWeekData.find(item => item.id === activityId);
    if (!activity) return;
    const dayIndex = days.indexOf(activity.dia);
    if (dayIndex < 0 || dayIndex >= days.length - 1) return;
    moveActivityToDay(activityId, days[dayIndex + 1]);
  };

  const handleMoveActivityToMonday = (activityId) => {
    const activity = currentWeekData.find(item => item.id === activityId);
    if (!activity || activity.dia === 'Lunes') return;
    moveActivityToDay(activityId, 'Lunes');
  };

  const handleContextMoveTomorrow = () => {
    if (!contextMenuActivity) return;
    handleMoveActivityTomorrow(contextMenuActivity.id);
    closeActivityContextMenu();
  };

  const handleContextMoveToMonday = () => {
    if (!contextMenuActivity) return;
    handleMoveActivityToMonday(contextMenuActivity.id);
    closeActivityContextMenu();
  };

  const handleContextMoveToDay = (targetDay) => {
    if (!contextMenuActivity || !targetDay || !days.includes(targetDay)) return;
    moveActivityToDay(contextMenuActivity.id, targetDay);
    closeActivityContextMenu();
  };

  const handleOpenContextEditModal = () => {
    if (!contextMenuActivity) return;
    setContextEditForm({
      activityId: contextMenuActivity.id,
      actividad: contextMenuActivity.actividad || '',
      tipo: contextMenuActivity.tipo || ACTIVITY_TYPES[0],
      icono: contextMenuActivity.icono || TYPE_ICON_MAP[contextMenuActivity.tipo] || TYPE_ICON_MAP[ACTIVITY_TYPES[0]],
      dia: contextMenuActivity.dia || 'Lunes'
    });
    closeActivityContextMenu();
    setIsContextEditModalOpen(true);
  };

  const closeContextEditModal = () => {
    setIsContextEditModalOpen(false);
    setContextEditForm({
      activityId: null,
      actividad: '',
      tipo: ACTIVITY_TYPES[0],
      icono: TYPE_ICON_MAP[ACTIVITY_TYPES[0]],
      dia: 'Lunes'
    });
  };

  const handleContextEditChange = (event) => {
    const { name, value } = event.target;
    setContextEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmitContextEdit = (event) => {
    event.preventDefault();
    if (!contextEditForm.activityId) return;
    const trimmedName = contextEditForm.actividad.trim();
    if (!trimmedName) return;
    handleUpdateActivity(contextEditForm.activityId, {
      actividad: trimmedName,
      tipo: contextEditForm.tipo,
      icono: (contextEditForm.icono || '').trim() || TYPE_ICON_MAP[contextEditForm.tipo] || TYPE_ICON_MAP[ACTIVITY_TYPES[0]],
      dia: contextEditForm.dia
    });
    closeContextEditModal();
  };

  const handleOpenContextTagsModal = () => {
    if (!contextMenuActivity) return;
    setContextTagsForm({
      activityId: contextMenuActivity.id,
      selectedTags: Array.isArray(contextMenuActivity.tags) ? contextMenuActivity.tags : [],
      tagsInput: ''
    });
    closeActivityContextMenu();
    setIsContextTagsModalOpen(true);
  };

  const closeContextTagsModal = () => {
    setIsContextTagsModalOpen(false);
    setContextTagsForm({
      activityId: null,
      selectedTags: [],
      tagsInput: ''
    });
  };

  const toggleContextTagSelection = (tag) => {
    setContextTagsForm(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter(existingTag => existingTag !== tag)
        : [...prev.selectedTags, tag]
    }));
  };

  const handleContextTagsInputChange = (event) => {
    setContextTagsForm(prev => ({
      ...prev,
      tagsInput: event.target.value
    }));
  };

  const handleSaveContextTags = (event) => {
    event.preventDefault();
    if (!contextTagsForm.activityId) return;
    const customTags = contextTagsForm.tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
    const mergedTags = [...new Set([...contextTagsForm.selectedTags, ...customTags])];
    handleUpdateActivity(contextTagsForm.activityId, { tags: mergedTags });
    closeContextTagsModal();
  };

  const handleToggleContextFreeze = () => {
    if (!contextMenuActivity) return;
    handleUpdateActivity(contextMenuActivity.id, {
      bloqueada: !Boolean(contextMenuActivity.bloqueada)
    });
    closeActivityContextMenu();
  };

  const handleDeleteContextActivity = () => {
    if (!contextMenuActivity) return;
    const confirmed = window.confirm(`¿Eliminar "${contextMenuActivity.actividad}" de ${contextMenuActivity.dia}?`);
    if (!confirmed) return;
    handleDeleteActivity(contextMenuActivity.id);
    closeActivityContextMenu();
  };

  const handleActivityDragStart = (activityId, fromDay) => {
    closeActivityContextMenu();
    setDragState({ activityId, fromDay });
  };

  const handleActivityDragEnd = () => {
    setDragState({ activityId: null, fromDay: null });
    setDropTargetDay(null);
  };

  const handleDragOverDay = (targetDay, event) => {
    if (!dragState.activityId) return;
    event.preventDefault();
    if (dragState.fromDay === targetDay) return;
    if (dropTargetDay !== targetDay) {
      setDropTargetDay(targetDay);
    }
  };

  const handleDragLeaveDay = (targetDay, event) => {
    if (!dragState.activityId) return;
    const related = event.relatedTarget;
    if (related && event.currentTarget.contains(related)) return;
    if (dropTargetDay === targetDay) {
      setDropTargetDay(null);
    }
  };

  const handleDropOnDay = (targetDay, event) => {
    if (!dragState.activityId) return;
    event.preventDefault();
    const sourceDay = dragState.fromDay;
    if (sourceDay && sourceDay !== targetDay) {
      moveActivityToDay(dragState.activityId, targetDay);
    }
    setDragState({ activityId: null, fromDay: null });
    setDropTargetDay(null);
  };

  const handleCloseSettings = () => {
    setShowSettingsModal(false);
    setActiveSidebarSection('dashboard');
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
  };

  const handleOpenResources = () => {
    setActiveSidebarSection('resources');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
    setIsResourcesModalOpen(true);
  };

  const handleCloseResources = () => {
    setIsResourcesModalOpen(false);
    setActiveSidebarSection('dashboard');
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
  };

  const handleOpenPlanner = () => {
    setActiveSidebarSection('planner');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
  };

  const handleSidebarDashboard = () => {
    setActiveSidebarSection('dashboard');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
  };

  const handleOpenTodos = () => {
    setActiveSidebarSection('todos');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
    setIsModalOpen(false);
    setSelectedDay(null);
    setIsFilterModalOpen(false);
    setIsQuickAddOpen(false);
    closeActivityContextMenu();
    refreshLegacyActivityTodos();
  };

  const openKanbanTodoEditor = (todo) => {
    if (!todo?.id) return;
    const tags = Array.isArray(todo.tags) ? todo.tags : [];
    setSelectedKanbanTodoId(todo.id);
    setKanbanEditDraft({
      text: todo.text || '',
      description: todo.description || '',
      priority: TODO_PRIORITIES.includes(todo.priority) ? todo.priority : 'medium',
      tagsInput: tags.join(', '),
      dueDate: todo.dueDate || '',
      status: KANBAN_STATUS_LABELS[todo.status] ? todo.status : 'todo',
    });
    setIsKanbanEditOpen(true);
  };

  const handleGlobalTodoInputChange = (event) => {
    setGlobalTodoInput(event.target.value);
  };

  const handleAddGlobalTodo = (event) => {
    event.preventDefault();
    const text = globalTodoInput.trim();
    if (!text) return;

    const now = new Date().toISOString();
    const nextTodo = normalizeGlobalTodo({
      id: createLocalTodoId(),
      text,
      completed: false,
      status: 'todo',
      description: '',
      priority: 'medium',
      tags: [],
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    });

    if (!nextTodo) return;
    setGlobalTodos(prev => [nextTodo, ...prev]);
    setGlobalTodoInput('');
  };

  const handleToggleGlobalTodo = (todoId) => {
    setGlobalTodos(prev => prev.map(todo => (
      todo.id === todoId
        ? {
            ...todo,
            completed: !todo.completed,
            status: !todo.completed ? 'done' : (todo.status === 'done' ? 'todo' : todo.status),
            updatedAt: new Date().toISOString()
          }
        : todo
    )));
  };

  const handleDeleteGlobalTodo = (todoId) => {
    setGlobalTodos(prev => prev.filter(todo => todo.id !== todoId));
    if (selectedKanbanTodoId === todoId) {
      setIsKanbanEditOpen(false);
      setSelectedKanbanTodoId(null);
    }
  };

  const handleTodoViewModeChange = (mode) => {
    if (mode !== 'list' && mode !== 'kanban') return;
    setTodoViewMode(mode);
  };

  const handleKanbanFilterChange = (patch) => {
    setKanbanFilter(prev => ({
      ...prev,
      ...patch,
    }));
  };

  const handleKanbanSortChange = (nextSort) => {
    setKanbanSort(nextSort || DEFAULT_KANBAN_SORT);
  };

  const handleCreateKanbanTodo = (status) => {
    const normalizedStatus = KANBAN_STATUS_LABELS[status] ? status : 'todo';
    const now = new Date().toISOString();
    const createdTodo = normalizeGlobalTodo({
      id: createLocalTodoId(),
      text: 'Nueva tarea',
      status: normalizedStatus,
      completed: normalizedStatus === 'done',
      description: '',
      priority: 'medium',
      tags: [],
      dueDate: null,
      createdAt: now,
      updatedAt: now,
    });

    if (!createdTodo) return;
    setGlobalTodos(prev => [createdTodo, ...prev]);
    openKanbanTodoEditor(createdTodo);
  };

  const handleOpenKanbanEdit = (card) => {
    const source = card?.source || 'global';
    const sourceId = card?.sourceId || card?.id || card;
    if (source !== 'global' || !sourceId) return;

    const target = globalTodos.find(todo => todo.id === sourceId);
    if (!target) return;
    openKanbanTodoEditor(target);
  };

  const handleCloseKanbanEdit = () => {
    setIsKanbanEditOpen(false);
    setSelectedKanbanTodoId(null);
  };

  const handleKanbanEditDraftChange = ({ name, value }) => {
    setKanbanEditDraft(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleKanbanEditTagsChange = (value) => {
    setKanbanEditDraft(prev => ({
      ...prev,
      tagsInput: value
    }));
  };

  const handleSaveKanbanEdit = (event) => {
    event.preventDefault();
    if (!selectedKanbanTodoId) return;

    const nextText = kanbanEditDraft.text.trim();
    if (!nextText) return;

    const parsedTags = kanbanEditDraft.tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
    const uniqueTags = [...new Set(parsedTags)];

    const nextStatus = KANBAN_STATUS_LABELS[kanbanEditDraft.status]
      ? kanbanEditDraft.status
      : 'todo';
    const nextPriority = TODO_PRIORITIES.includes(kanbanEditDraft.priority)
      ? kanbanEditDraft.priority
      : 'medium';
    const nextDueDate = kanbanEditDraft.dueDate && !Number.isNaN(Date.parse(kanbanEditDraft.dueDate))
      ? kanbanEditDraft.dueDate
      : null;

    setGlobalTodos(prev => prev.map(todo => (
      todo.id === selectedKanbanTodoId
        ? normalizeGlobalTodo({
            ...todo,
            text: nextText,
            description: kanbanEditDraft.description.trim(),
            priority: nextPriority,
            tags: uniqueTags,
            dueDate: nextDueDate,
            status: nextStatus,
            completed: nextStatus === 'done',
            updatedAt: new Date().toISOString()
          }) || todo
        : todo
    )));

    handleCloseKanbanEdit();
  };

  const handleDeleteKanbanTodo = () => {
    if (!selectedKanbanTodoId) return;
    setGlobalTodos(prev => prev.filter(todo => todo.id !== selectedKanbanTodoId));
    handleCloseKanbanEdit();
  };

  const handleMoveKanbanTodo = (payload) => {
    const source = payload?.source;
    const sourceId = payload?.sourceId;
    const targetStatus = payload?.targetStatus;
    const targetCardId = payload?.targetCardId || null;

    if (!source || !sourceId || !KANBAN_STATUS_LABELS[targetStatus]) return;

    if (source === 'activity') {
      setWeeksDataWithHistory(prevWeeksData => {
        const weekActivities = Array.isArray(prevWeeksData[currentWeek]) ? prevWeeksData[currentWeek] : [];
        let hasChanges = false;

        const updatedActivities = weekActivities.map(activity => {
          if (activity.id !== sourceId || activity.bloqueada) {
            return normalizeActivity(activity);
          }

          hasChanges = true;
          return normalizeActivity({
            ...activity,
            kanbanStatus: targetStatus,
            completado: targetStatus === 'done'
          });
        });

        if (!hasChanges) return prevWeeksData;

        const nextWeeksData = {
          ...prevWeeksData,
          [currentWeek]: updatedActivities
        };

        persistWeekActivities(currentWeek, updatedActivities);
        return nextWeeksData;
      });
      return;
    }

    if (source !== 'global') return;

    setGlobalTodos(prev => {
      const sourceIndex = prev.findIndex(todo => todo.id === sourceId);
      if (sourceIndex === -1) return prev;

      const movedBase = prev[sourceIndex];
      const updatedMovedTodo = normalizeGlobalTodo({
        ...movedBase,
        status: targetStatus,
        completed: targetStatus === 'done',
        updatedAt: new Date().toISOString()
      });
      if (!updatedMovedTodo) return prev;

      if (kanbanSort !== 'manual') {
        return prev.map(todo => (todo.id === sourceId ? updatedMovedTodo : todo));
      }

      const targetGlobalId = typeof targetCardId === 'string' && targetCardId.startsWith('global:')
        ? targetCardId.replace('global:', '')
        : null;

      const listWithoutMoved = prev.filter(todo => todo.id !== sourceId);
      let insertionIndex = listWithoutMoved.length;

      if (targetGlobalId) {
        const targetIndex = listWithoutMoved.findIndex(todo => todo.id === targetGlobalId);
        if (targetIndex >= 0) {
          insertionIndex = targetIndex;
        }
      } else {
        for (let index = listWithoutMoved.length - 1; index >= 0; index -= 1) {
          if (listWithoutMoved[index].status === targetStatus) {
            insertionIndex = index + 1;
            break;
          }
        }
      }

      const nextTodos = [...listWithoutMoved];
      nextTodos.splice(insertionIndex, 0, updatedMovedTodo);
      return nextTodos;
    });
  };

  const handleOpenActivityTodoDetail = (activity) => {
    if (!activity?.id) return;
    setTodoDetailActivity(activity);
    setIsTodoDetailModalOpen(true);
  };

  const handleCloseTodoDetailModal = () => {
    setIsTodoDetailModalOpen(false);
    setTodoDetailActivity(null);
    refreshLegacyActivityTodos();
  };

  const toggleTagFilter = (tag) => {
    setSelectedTags(prevTags =>
      prevTags.includes(tag)
        ? prevTags.filter(existingTag => existingTag !== tag)
        : [...prevTags, tag]
    );
  };

  const clearDashboardFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
    setFocusSkippedIds([]);
  };

  const openQuickAddModal = () => {
    const selectedDayIndex = selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1;
    setQuickAddForm(prev => ({
      ...prev,
      dia: days[selectedDayIndex] || 'Lunes'
    }));
    setIsFilterModalOpen(false);
    setIsQuickAddOpen(true);
  };

  const openFilterModal = () => {
    setIsQuickAddOpen(false);
    setIsFilterModalOpen(true);
  };

  const closeFilterModal = () => {
    setIsFilterModalOpen(false);
  };

  const toggleFocusMode = () => {
    setFocusMode(prev => {
      if (!prev) {
        setFocusSkippedIds([]);
      }
      return !prev;
    });
  };

  const handleSkipFocusTask = () => {
    if (!currentFocusActivity) return;
    setFocusSkippedIds(prev => [...new Set([...prev, currentFocusActivity.id])]);
  };

  const handleOpenFocusTask = () => {
    if (!currentFocusActivity) return;
    setSelectedDate(getDateForDay(currentFocusActivity.dia));
    setSelectedDay(currentFocusActivity.dia);
    setIsModalOpen(true);
  };

  const handleQuickAddInputChange = (event) => {
    const { name, value } = event.target;
    setQuickAddForm(prev => {
      if (name === 'tipo') {
        const nextTypeIcon = TYPE_ICON_MAP[value] || '📝';
        const shouldSyncIcon = !prev.icono || prev.icono === TYPE_ICON_MAP[prev.tipo];
        return {
          ...prev,
          tipo: value,
          icono: shouldSyncIcon ? nextTypeIcon : prev.icono
        };
      }
      return { ...prev, [name]: value };
    });
  };

  const toggleQuickAddTag = (tag) => {
    setQuickAddForm(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter(existingTag => existingTag !== tag)
        : [...prev.selectedTags, tag]
    }));
  };

  const selectQuickAddEmoji = (emoji) => {
    setQuickAddForm(prev => ({ ...prev, icono: emoji }));
  };

  const handleCloseQuickAdd = () => {
    setIsQuickAddOpen(false);
    setQuickAddForm({
      actividad: '',
      tipo: 'Algoritmos',
      dia: 'Lunes',
      icono: TYPE_ICON_MAP['Algoritmos'],
      tagsInput: '',
      selectedTags: []
    });
  };

  const handleQuickAddSubmit = (event) => {
    event.preventDefault();
    const activityName = quickAddForm.actividad.trim();
    if (!activityName) return;

    const customTags = quickAddForm.tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    const mergedTags = [...new Set([...quickAddForm.selectedTags, ...customTags])];

    handleAddActivity({
      actividad: activityName,
      tipo: quickAddForm.tipo,
      icono: quickAddForm.icono?.trim() || TYPE_ICON_MAP[quickAddForm.tipo] || '📝',
      completado: false,
      tags: mergedTags,
      targetMinutes: 0,
      spentMinutes: 0,
      pomodoroSessions: 0,
    }, quickAddForm.dia);

    handleCloseQuickAdd();
  };

  useEffect(() => {
    setFocusSkippedIds([]);
  }, [currentWeek, searchQuery, selectedTags]);

  useEffect(() => {
    setDragState({ activityId: null, fromDay: null });
    setDropTargetDay(null);
    closeActivityContextMenu();
    closeContextEditModal();
    closeContextTagsModal();
  }, [currentWeek]);

  useEffect(() => {
    if (!activityContextMenu.open) return;

    const handlePointerDown = (event) => {
      if (event.target.closest('.activity-context-menu')) return;
      if (event.target.closest('.activity-menu-trigger')) return;
      closeActivityContextMenu();
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeActivityContextMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [activityContextMenu.open]);

  useEffect(() => {
    if (
      isFilterModalOpen ||
      isQuickAddOpen ||
      showFrequencyModal ||
      isCalendarModalOpen ||
      showSettingsModal ||
      isResourcesModalOpen ||
      isModalOpen ||
      isContextEditModalOpen ||
      isContextTagsModalOpen ||
      isTodoDetailModalOpen ||
      isKanbanEditOpen
    ) {
      closeActivityContextMenu();
    }
  }, [
    isFilterModalOpen,
    isQuickAddOpen,
    showFrequencyModal,
    isCalendarModalOpen,
    showSettingsModal,
    isResourcesModalOpen,
    isModalOpen,
    isContextEditModalOpen,
    isContextTagsModalOpen,
    isTodoDetailModalOpen,
    isKanbanEditOpen
  ]);

  useEffect(() => {
    if (activeSidebarSection === 'todos') {
      refreshLegacyActivityTodos();
    }
    if (activeSidebarSection !== 'todos' && isTodoDetailModalOpen) {
      setIsTodoDetailModalOpen(false);
      setTodoDetailActivity(null);
    }
    if (activeSidebarSection !== 'todos' && isKanbanEditOpen) {
      setIsKanbanEditOpen(false);
      setSelectedKanbanTodoId(null);
    }
  }, [activeSidebarSection, isTodoDetailModalOpen, isKanbanEditOpen]);

  useEffect(() => {
    const newCompletions = {};

    Object.keys(weeksData).forEach(weekKey => {
      const weekActivities = weeksData[weekKey];
      
      // Skip if weekActivities is not an array or is empty
      if (!Array.isArray(weekActivities) || weekActivities.length === 0) {
        return;
      }
      
      weekActivities.forEach(activity => {
        // Skip if activity is not an object or doesn't have required properties
        if (!activity || typeof activity !== 'object' || !('dia' in activity) || !('completado' in activity)) {
          console.warn('Invalid activity data:', activity);
          return;
        }

        // Las actividades bloqueadas no cuentan para el calendario/progreso diario
        if (activity.bloqueada) {
          return;
        }
        
        const weekStart = parseISO(weekKey);
        const dayIndex = days.indexOf(activity.dia);
        if (dayIndex === -1) return;
        
        try {
          // Sumar 1 al dayIndex para corregir el desplazamiento de fechas
          const activityDate = startOfDay(addDays(weekStart, dayIndex + 1));
          const dateStr = format(activityDate, 'yyyy-MM-dd');
          
          if (!newCompletions[dateStr]) {
            newCompletions[dateStr] = { completed: 0, total: 0 };
          }
          
          // Count all activities for the day
          newCompletions[dateStr].total += 1;
          
          // Count completed activities
          if (activity.completado) {
            newCompletions[dateStr].completed += 1;
          }
        } catch (error) {
          console.error('Error processing activity:', error, 'Activity:', activity);
        }
      });
    });
    
    setCompletions(prev => {
      // Merge with existing completions to preserve any updates not in weeksData
      const merged = { ...newCompletions };
      Object.entries(prev).forEach(([date, data]) => {
        if (!merged[date]) {
          merged[date] = { ...data };
        }
      });
      return merged;
    });
  }, [weeksData, days]);

  if (isAuthLoading) {
    return (
      <div className="login-bg">
        <div className="login-card">
          <h2 className="login-title">Accediendo...</h2>
        </div>
      </div>
    );
  }
  if (!user) {
    // eslint-disable-next-line
    const hasHadUser = Boolean(localStorage.getItem('hasHadUser'));

    // Login/registro controlado
    const handleForm = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const username = formData.get('username');
      setPendingUsername(username);
      if (authMode === 'login') {
        await handleLogin(username, 'login');
      } else {
        await handleLogin(username, 'register');
      }
    };

    return (
      <div className="login-bg">
        <div className="login-layout">
          <div className="login-card">
            <div className="login-logo">
              <span className="logo-circle">◉</span>
            </div>
            <h2 className="login-title">{authMode === 'login' ? 'Sign in to Study Planner' : 'Crea tu cuenta'}</h2>
            <p className="login-sub">
              {authMode === 'login'
                ? 'Continuar con tu dashboard de estudio'
                : 'Elige tu usuario para crear tu cuenta'}
            </p>
            {loginError && <p className="login-error">{loginError}</p>}
            <form className="login-form" onSubmit={handleForm}>
              <div className="login-field">
                <input type="text" name="username" placeholder="Nombre de usuario" autoComplete="username" required defaultValue={pendingUsername} />
              </div>
              <button className="login-btn" type="submit">{authMode === 'login' ? 'Login' : 'Crear cuenta'}</button>
            </form>
            {authMode === 'register' && (
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <button className="login-link" onClick={() => { setAuthMode('login'); setLoginError(''); }}>
                  Volver a inicio de sesión
                </button>
              </div>
            )}
          </div>

          <div className="login-preview">
            <div className="login-preview-panel">
              <div className="preview-top">
                <span className="preview-brand-dot">◉</span>
                <span>Dashboard</span>
              </div>
              <div className="preview-metrics">
                <div className="preview-line" />
                <div className="preview-line short" />
                <div className="preview-ring" />
              </div>
              <div className="preview-bars">
                {[32, 48, 28, 62, 39, 54, 44].map((height, idx) => (
                  <span key={idx} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`dashboard-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${isMobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
      <button
        type="button"
        className="mobile-sidebar-toggle"
        onClick={() => setIsMobileSidebarOpen(prev => !prev)}
        aria-label={isMobileSidebarOpen ? 'Cerrar menú lateral' : 'Abrir menú lateral'}
        aria-expanded={isMobileSidebarOpen}
      >
        {isMobileSidebarOpen ? <FaTimes /> : <FaBars />}
      </button>
      {isMobileSidebarOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}
      <aside className={`dashboard-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''} ${isMobileSidebarOpen ? 'is-mobile-open' : ''}`}>
        <div className="sidebar-head">
          <div className="sidebar-brand">
            <span className="sidebar-brand-dot">◉</span>
            <span className="sidebar-brand-text">Studycart</span>
          </div>
          <button
            className="sidebar-toggle-button"
            type="button"
            onClick={() => setIsSidebarCollapsed(prev => !prev)}
            aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            title={isSidebarCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {isSidebarCollapsed ? <FaAngleRight /> : <FaAngleLeft />}
          </button>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'dashboard' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              handleSidebarDashboard();
              closeMobileSidebarIfNeeded();
            }}
          >
            <FaThLarge />
            <span>Dashboard</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'planner' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              handleOpenPlanner();
              closeMobileSidebarIfNeeded();
            }}
          >
            <FaClipboardList />
            <span>Planificador</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'activity' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              handleOpenFrequency();
              closeMobileSidebarIfNeeded();
            }}
          >
            <FaChartLine />
            <span>Actividad</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'calendar' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              handleOpenCalendar();
              closeMobileSidebarIfNeeded();
            }}
          >
            <FaCalendarAlt />
            <span>Calendario</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'resources' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              handleOpenResources();
              closeMobileSidebarIfNeeded();
            }}
          >
            <FaBook />
            <span>Recursos</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'todos' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              handleOpenTodos();
              closeMobileSidebarIfNeeded();
            }}
          >
            <FaListUl />
            <span>Todo/List</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'settings' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              handleOpenSettings();
              closeMobileSidebarIfNeeded();
            }}
          >
            <FaCog />
            <span>Ajustes</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">Bienvenido, {user.username}</div>
          <button
            className="sidebar-logout-btn"
            type="button"
            onClick={() => {
              closeMobileSidebarIfNeeded();
              handleLogout();
            }}
          >
            <FaSignOutAlt />
            <span>Salir</span>
          </button>
        </div>
      </aside>

      <div className="app dashboard-main">
        {activeSidebarSection === 'planner' ? (
          <WeeklyPlanner
            plans={studyPlans}
            activePlanId={activePlanId}
            onSetActivePlan={handleSetActivePlan}
            onCreatePlan={handleCreatePlan}
            onDeletePlan={handleDeletePlan}
            onRenamePlan={handleRenamePlan}
            onAddActivity={handleAddActivityToPlan}
            onDeleteActivity={handleDeleteActivityFromPlan}
            onUpdateActivity={handleUpdateActivityInPlan}
            onCopyFromPlan={handleCopyFromPlan}
            onImportPlan={handleImportPlanToActive}
            onSavePlan={handleSavePlanToCloud}
            getPlanSyncState={getPlanSyncState}
            isSavingPlanId={isSavingPlanId}
          />
        ) : activeSidebarSection === 'todos' ? (
          <TodoListView
            todos={globalTodos}
            todoInput={globalTodoInput}
            onTodoInputChange={handleGlobalTodoInputChange}
            onAddTodo={handleAddGlobalTodo}
            onToggleTodo={handleToggleGlobalTodo}
            onDeleteTodo={handleDeleteGlobalTodo}
            remainingCount={globalTodoRemainingCount}
            totalCount={globalTodoTotalCount}
            activityTodoSummaries={activityTodoSummaries}
            onOpenActivityTodo={handleOpenActivityTodoDetail}
            todoViewMode={todoViewMode}
            onTodoViewModeChange={handleTodoViewModeChange}
            kanbanFilter={kanbanFilter}
            onKanbanFilterChange={handleKanbanFilterChange}
            kanbanSort={kanbanSort}
            onKanbanSortChange={handleKanbanSortChange}
            kanbanStatuses={KANBAN_STATUSES}
            kanbanColumns={kanbanColumns}
            kanbanContextNotice={kanbanContextNotice}
            onCreateKanbanTodo={handleCreateKanbanTodo}
            onMoveKanbanTodo={handleMoveKanbanTodo}
            onOpenKanbanEdit={handleOpenKanbanEdit}
            isKanbanEditOpen={isKanbanEditOpen}
            selectedKanbanTodoId={selectedKanbanTodoId}
            kanbanEditDraft={kanbanEditDraft}
            onKanbanEditDraftChange={handleKanbanEditDraftChange}
            onKanbanEditTagsChange={handleKanbanEditTagsChange}
            onSaveKanbanEdit={handleSaveKanbanEdit}
            onCloseKanbanEdit={handleCloseKanbanEdit}
            onDeleteKanbanTodo={handleDeleteKanbanTodo}
            onStartPomodoro={startPomodoroForActivity}
            quote={'"La disciplina de hoy crea la libertad de tu semana."'}
          />
        ) : (
        <>
        <WeekNavigation
          onPrev={() => navigateWeek('prev')}
          onNext={() => navigateWeek('next')}
          currentWeek={currentWeek}
          onSelectDate={setSelectedDate}
          selectedDate={selectedDate}
          activitiesByDay={activitiesByDay}
        />

        <div className="progress-summary">
          <p>{progressText}</p>
          <ProgressBar progress={progress} />
        </div>

        {focusMode ? (
          <section className="focus-mode-panel" aria-label="Modo enfoque">
            {currentFocusActivity ? (
              <>
                <div className="focus-mode-main-task">
                  <p className="focus-mode-kicker">Tarea actual</p>
                  <h3>{currentFocusActivity.actividad}</h3>
                  <p>
                    {currentFocusActivity.dia} · {currentFocusActivity.tipo}
                  </p>
                  {Array.isArray(currentFocusActivity.tags) && currentFocusActivity.tags.length > 0 && (
                    <div className="focus-mode-tags">
                      {currentFocusActivity.tags.map(tag => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="focus-mode-next">
                  <p className="focus-mode-kicker">Siguiente sugerida</p>
                  {nextFocusActivity ? (
                    <p>{nextFocusActivity.actividad} · {nextFocusActivity.dia}</p>
                  ) : (
                    <p>No hay siguiente sugerida por ahora.</p>
                  )}
                </div>
                <div className="focus-mode-actions">
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleActivity(currentFocusActivity.id);
                      setFocusSkippedIds(prev => prev.filter(id => id !== currentFocusActivity.id));
                    }}
                  >
                    Completar
                  </button>
                  <button type="button" onClick={handleSkipFocusTask}>Saltar a siguiente</button>
                  <button type="button" onClick={handleOpenFocusTask}>Abrir edición</button>
                </div>
              </>
            ) : (
              <div className="focus-mode-empty">
                No hay tareas pendientes con los filtros actuales.
              </div>
            )}
          </section>
        ) : (
          studyPlans.length === 0 && currentWeekData.length === 0 ? (
            <div className="dashboard-empty-plan">
              <span style={{ fontSize: 32, opacity: 0.4 }}><FaClipboardList /></span>
              <p>Crea un plan de estudios para empezar a planificar tu semana</p>
              <button
                className="planner-btn primary"
                type="button"
                onClick={() => {
                  const newId = `plan_${Date.now()}`;
                  handleCreatePlan(newId, 'Plan de estudios 1');
                  setActiveSidebarSection('planner');
                }}
              >
                <FaPlus /> Crear plan de estudios
              </button>
            </div>
          ) : (
          <div className="week-view">
            {days.map((day, index) => {
              const dayDate = addDays(parseISO(currentWeek), index);
              const isPast = isBefore(startOfDay(dayDate), today);
              const isTodayDay = isCurrentDay(day);
              const isFuture = !isPast && !isTodayDay;
              const formattedDate = format(dayDate, 'yyyy-MM-dd');
              const isSelected = format(selectedDate, 'yyyy-MM-dd') === formattedDate;

              return (
                <div key={day} className={`day-container ${isSelected ? 'selected-day' : ''}`}>
                  <DayView
                    day={day}
                    dayNumber={getDayNumber(day)}
                    activities={filteredActivitiesByDay[day] || []}
                    onToggle={handleToggleActivity}
                    onOpenContextMenu={openActivityContextMenu}
                    onActivityDragStart={handleActivityDragStart}
                    onActivityDragEnd={handleActivityDragEnd}
                    onDropOnDay={handleDropOnDay}
                    onDragOverDay={handleDragOverDay}
                    onDragLeaveDay={handleDragLeaveDay}
                    draggedActivityId={dragState.activityId}
                    isDropTarget={dropTargetDay === day}
                    isDragSource={dragState.fromDay === day}
                    onDayClick={() => {
                      setSelectedDate(dayDate);
                      handleDayClick(day);
                    }}
                    isToday={isTodayDay}
                    isPast={isPast}
                    isFuture={isFuture}
                    isSelected={isSelected}
                  />
                </div>
              );
            })}
          </div>
          )
        )}

        {activityContextMenu.open && contextMenuActivity && typeof document !== 'undefined' && createPortal(
          <div
            className="activity-context-menu"
            role="menu"
            aria-label={`Acciones para ${contextMenuActivity.actividad}`}
            style={{ left: activityContextMenu.x, top: activityContextMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenContextEditModal}
            >
              Editar actividad
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleContextMoveTomorrow}
              disabled={!canMoveContextTomorrow}
            >
              Mover a mañana
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setShowContextMovePicker(prev => !prev)}
            >
              Mover a...
            </button>
            {showContextMovePicker && (
              <div className="activity-context-days" role="group" aria-label="Seleccionar día">
                {days.map(day => (
                  <button
                    key={day}
                    type="button"
                    className={`activity-context-day ${contextMenuActivity.dia === day ? 'is-current' : ''}`}
                    disabled={contextMenuActivity.dia === day}
                    onClick={() => handleContextMoveToDay(day)}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
                <button
                  type="button"
                  className="activity-context-jump"
                  onClick={handleContextMoveToMonday}
                  disabled={!canMoveContextToMonday}
                >
                  Ir al lunes
                </button>
              </div>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenContextTagsModal}
            >
              Agregar/editar etiquetas
            </button>
            <button
              type="button"
              role="menuitem"
              className="activity-context-freeze"
              onClick={handleToggleContextFreeze}
            >
              {contextMenuActivity.bloqueada ? 'Descongelar actividad' : '❄️ Congelar por hoy'}
            </button>
            <div className="activity-context-divider" />
            <button
              type="button"
              role="menuitem"
              className="activity-context-danger"
              onClick={handleDeleteContextActivity}
            >
              Eliminar
            </button>
          </div>,
          document.body
        )}

        <button
          type="button"
          className="quick-filter-fab"
          onClick={openFilterModal}
          aria-label="Filtros y búsqueda"
          title="Filtros y búsqueda"
        >
          <FaSearch />
        </button>

        <button
          type="button"
          className="quick-add-fab"
          onClick={openQuickAddModal}
          aria-label="Quick Add"
          title="Quick Add"
        >
          <FaPlus />
        </button>

        {isFilterModalOpen && (
          <div className="quick-add-overlay" onClick={closeFilterModal}>
            <div className="quick-filter-modal" onClick={(event) => event.stopPropagation()}>
              <div className="quick-add-header">
                <h3>Filtros y búsqueda</h3>
                <button type="button" className="quick-add-close" onClick={closeFilterModal}>
                  <FaTimes />
                </button>
              </div>

              <label>
                Buscar actividad o etiqueta
                <input
                  className="dashboard-search-input"
                  type="search"
                  placeholder="Buscar por actividad, tipo o etiqueta..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>

              <div className="quick-filter-tags">
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className={`dashboard-tag-chip ${selectedTags.includes(tag) ? 'active' : ''}`}
                    onClick={() => toggleTagFilter(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <div className="quick-filter-actions">
                <button
                  type="button"
                  className={`dashboard-toggle ${focusMode ? 'active' : ''}`}
                  onClick={toggleFocusMode}
                >
                  {focusMode ? 'Salir de enfoque' : 'Modo enfoque'}
                </button>
                <button
                  type="button"
                  className="dashboard-icon-btn"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  aria-label="Deshacer último cambio"
                  title="Deshacer"
                >
                  <FaUndo />
                </button>
                <button
                  type="button"
                  className="dashboard-icon-btn"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  aria-label="Rehacer último cambio"
                  title="Rehacer"
                >
                  <FaRedo />
                </button>
                <button type="button" className="dashboard-clear-btn" onClick={clearDashboardFilters}>
                  Limpiar
                </button>
              </div>
            </div>
          </div>
        )}

        {isQuickAddOpen && (
          <div className="quick-add-overlay" onClick={handleCloseQuickAdd}>
            <form className="quick-add-modal" onClick={(event) => event.stopPropagation()} onSubmit={handleQuickAddSubmit}>
              <div className="quick-add-header">
                <h3>Quick Add</h3>
                <button type="button" className="quick-add-close" onClick={handleCloseQuickAdd}>
                  <FaTimes />
                </button>
              </div>

              <label>
                Actividad
                <input
                  type="text"
                  name="actividad"
                  value={quickAddForm.actividad}
                  onChange={handleQuickAddInputChange}
                  placeholder="Ej. Practicar algoritmos"
                  required
                />
              </label>

              <div className="quick-add-row">
                <label>
                  Tipo
                  <select name="tipo" value={quickAddForm.tipo} onChange={handleQuickAddInputChange}>
                    <option value="Algoritmos">Algoritmos</option>
                    <option value="Actividad Principal">Actividad Principal</option>
                    <option value="Secundaria">Secundaria</option>
                    <option value="Menor Prioridad">Menor Prioridad</option>
                    <option value="Conocimiento Pasivo">Conocimiento Pasivo</option>
                  </select>
                </label>
                <label>
                  Día
                  <select name="dia" value={quickAddForm.dia} onChange={handleQuickAddInputChange}>
                    {days.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="quick-add-tags">
                <p>Emoji / ícono</p>
                <input
                  type="text"
                  name="icono"
                  value={quickAddForm.icono}
                  onChange={handleQuickAddInputChange}
                  placeholder="Ej. 🚀"
                  maxLength={4}
                />
                <div className="quick-add-tags-grid">
                  {EMOJI_PRESETS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className={`quick-add-tag ${quickAddForm.icono === emoji ? 'active' : ''}`}
                      onClick={() => selectQuickAddEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="quick-add-tags">
                <p>Etiquetas sugeridas</p>
                <div className="quick-add-tags-grid">
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className={`quick-add-tag ${quickAddForm.selectedTags.includes(tag) ? 'active' : ''}`}
                      onClick={() => toggleQuickAddTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  name="tagsInput"
                  value={quickAddForm.tagsInput}
                  onChange={handleQuickAddInputChange}
                  placeholder="Etiquetas extra separadas por coma"
                />
              </div>

              <button type="submit" className="quick-add-submit">Guardar actividad</button>
            </form>
          </div>
        )}

        {isContextEditModalOpen && (
          <div className="quick-add-overlay" onClick={closeContextEditModal}>
            <form className="quick-add-modal context-edit-modal" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmitContextEdit}>
              <div className="quick-add-header">
                <h3>Editar actividad</h3>
                <button type="button" className="quick-add-close" onClick={closeContextEditModal}>
                  <FaTimes />
                </button>
              </div>

              <label>
                Actividad
                <input
                  type="text"
                  name="actividad"
                  value={contextEditForm.actividad}
                  onChange={handleContextEditChange}
                  placeholder="Nombre de la actividad"
                  required
                />
              </label>

              <div className="quick-add-row">
                <label>
                  Tipo
                  <select name="tipo" value={contextEditForm.tipo} onChange={handleContextEditChange}>
                    {ACTIVITY_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Día
                  <select name="dia" value={contextEditForm.dia} onChange={handleContextEditChange}>
                    {days.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="quick-add-tags">
                <p>Emoji / ícono</p>
                <input
                  type="text"
                  name="icono"
                  value={contextEditForm.icono}
                  onChange={handleContextEditChange}
                  placeholder="Ej. 🚀"
                  maxLength={4}
                />
                <div className="quick-add-tags-grid">
                  {EMOJI_PRESETS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className={`quick-add-tag ${contextEditForm.icono === emoji ? 'active' : ''}`}
                      onClick={() => setContextEditForm(prev => ({ ...prev, icono: emoji }))}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="quick-add-submit">Guardar cambios</button>
            </form>
          </div>
        )}

        {isContextTagsModalOpen && (
          <div className="quick-add-overlay" onClick={closeContextTagsModal}>
            <form className="quick-add-modal context-tags-modal" onClick={(event) => event.stopPropagation()} onSubmit={handleSaveContextTags}>
              <div className="quick-add-header">
                <h3>Etiquetas</h3>
                <button type="button" className="quick-add-close" onClick={closeContextTagsModal}>
                  <FaTimes />
                </button>
              </div>

              <div className="quick-add-tags">
                <p>Etiquetas sugeridas</p>
                <div className="quick-add-tags-grid">
                  {contextTagOptions.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className={`quick-add-tag ${contextTagsForm.selectedTags.includes(tag) ? 'active' : ''}`}
                      onClick={() => toggleContextTagSelection(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={contextTagsForm.tagsInput}
                  onChange={handleContextTagsInputChange}
                  placeholder="Agregar etiquetas separadas por coma"
                />
              </div>

              <button type="submit" className="quick-add-submit">Guardar etiquetas</button>
            </form>
          </div>
        )}
        </>
        )}
      </div>

      {isTodoDetailModalOpen && todoDetailActivity && (
        <TodoListModal
          isOpen={isTodoDetailModalOpen}
          onClose={handleCloseTodoDetailModal}
          activity={todoDetailActivity}
        />
      )}

      {isModalOpen && selectedDay && (
        <DayDetailModal
          day={selectedDay} 
          activities={activitiesByDay[selectedDay] || []}
          notes={notes[selectedDay] || ''}
          onToggleActivity={handleToggleActivity}
          onSaveNotes={handleSaveNotes}
          onClose={handleCloseModal}
          onCheckAll={handleCheckAll}
          onUncheckAll={handleUncheckAll}
        />
      )}
      
      <CalendarModal 
        isOpen={isCalendarModalOpen} 
        onClose={handleCloseCalendar}
        completions={completions}
      />
      
      {showFrequencyModal && (
        <FrequencyModal
          isOpen={showFrequencyModal}
          onClose={handleCloseFrequency}
          activities={allActivities}
          currentWeek={currentWeek}
        />
      )}
      
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={handleCloseSettings} 
        onLogout={handleLogout}
        onAddActivity={handleAddActivity}
        onUpdateActivity={handleUpdateActivity}
        onDeleteActivity={handleDeleteActivity}
        currentWeekActivities={currentWeekData}
        httpLogs={httpLogs}
        onClearHttpLogs={handleClearHttpLogEntries}
        initialSection={settingsSection}
        onSectionChange={setSettingsSection}
      />

      <ResourcesModal
        isOpen={isResourcesModalOpen}
        onClose={handleCloseResources}
        activities={allActivities}
        onAddActivity={handleAddActivity}
      />

      {httpToasts.length > 0 && (
        <div className="http-toast-stack" aria-live="polite" aria-label="Notificaciones de peticiones">
          {httpToasts.map((toast) => (
            <article key={toast.id} className={`http-toast-card is-${toast.type || 'info'}`}>
              <header className="http-toast-header">
                <strong>{toast.title}</strong>
                <button
                  type="button"
                  className="http-toast-close"
                  aria-label="Cerrar notificación"
                  onClick={() => dismissToast(toast.id)}
                >
                  <FaTimes />
                </button>
              </header>
              {toast.message ? (
                <p className="http-toast-message">{toast.message}</p>
              ) : null}
              {toast.actionLabel && toast.action ? (
                <button
                  type="button"
                  className="http-toast-action"
                  onClick={() => {
                    toast.action();
                    dismissToast(toast.id);
                  }}
                >
                  {toast.actionLabel}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {pomodoroStartSelector.open && (
        <div className="quick-add-overlay pomodoro-start-overlay" onClick={handleClosePomodoroSelector}>
          <div className="pomodoro-start-modal" onClick={(event) => event.stopPropagation()}>
            <div className="quick-add-header">
              <h3>Iniciar Pomodoro</h3>
              <button type="button" className="quick-add-close" onClick={handleClosePomodoroSelector}>
                <FaTimes />
              </button>
            </div>
            <p className="pomodoro-start-copy">
              Selecciona duración para <strong>{pomodoroStartSelector.activity?.activityName}</strong>
            </p>
            <div className="pomodoro-start-options">
              {pomodoroStartSelector.options.map((minutes) => (
                <button
                  key={`pomodoro-duration-${minutes}`}
                  type="button"
                  className="pomodoro-start-option"
                  onClick={() => handleChoosePomodoroDuration(minutes)}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <p className="pomodoro-start-hint">
              Regla aplicada por tipo de actividad. Descanso: {pomodoroConfig.breakDuration} min.
            </p>
          </div>
        </div>
      )}

      <PomodoroWidget
        pomodoroState={pomodoroState}
        pomodoroConfig={pomodoroConfig}
        onUpdateConfig={handleUpdatePomodoroConfig}
        onPause={handlePomodoroPause}
        onResume={handlePomodoroResume}
        onSkip={handlePomodoroSkip}
        onCancel={handlePomodoroCancel}
        onCompleteSession={handlePomodoroCompleteSession}
      />
    </div>
  );
}
