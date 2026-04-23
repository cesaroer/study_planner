import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocalStorage } from './hooks/useLocalStorage';
import WeekNavigation from './components/WeekNavigation';
import DayView from './components/DayView';
import DayDetailModal from './components/DayDetailModal'; 
import { defaultActivities } from './data/defaultActivities';
import ProgressBar from './components/ProgressBar';
import { format, startOfWeek, addDays, parseISO, isBefore, startOfDay, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import CalendarModal from './components/CalendarModal';
import FrequencyModal from './components/FrequencyModal';
import SettingsModal from './components/SettingsModal';
import ResourcesModal from './components/ResourcesModal';
import WeeklyPlanner from './components/WeeklyPlanner';
import { encryptData, decryptData } from './auth/cryptoUtils';
import {
  FaThLarge,
  FaChartLine,
  FaCalendarAlt,
  FaBook,
  FaCog,
  FaAngleLeft,
  FaAngleRight,
  FaSignOutAlt,
  FaPlus,
  FaUndo,
  FaRedo,
  FaTimes,
  FaSearch,
  FaClipboardList
} from 'react-icons/fa';

// Utilidad simple para generar UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Función para limpiar actividades duplicadas
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
    tags: normalizedTags,
    targetMinutes: parseMinutes(activity.targetMinutes),
    spentMinutes: parseMinutes(activity.spentMinutes),
    pomodoroSessions: parseMinutes(activity.pomodoroSessions),
  };
};

const cleanDuplicatedActivities = (activities) => {
  if (!Array.isArray(activities)) return [];
  
  const uniqueIds = new Set();
  return activities.filter(activity => {
    if (!activity || !activity.id) return false;
    if (uniqueIds.has(activity.id)) return false;
    
    uniqueIds.add(activity.id);
    return true;
  }).map(normalizeActivity);
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

export default function App() {
  // ID único de dispositivo confiable
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

  // Autologin si el dispositivo es confiable
  useEffect(() => {
    if (!user) {
      const username = localStorage.getItem('lastLoggedUsername');
      if (username) {
        const trustedKey = `trustedDevices_${username}`;
        let trusted = [];
        try {
          trusted = JSON.parse(localStorage.getItem(trustedKey)) || [];
        } catch {}
        if (trusted.includes(deviceId)) {
          setUser({ username });
        }
      }
      setIsAuthLoading(false);
    } else {
      setIsAuthLoading(false);
    }
  }, [deviceId, user]);

  // Cargar datos del usuario autenticado
  useEffect(() => {
    if (user && user.username) {
      const key = `studyPlannerData_${user.username}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        try {
          const parsedData = JSON.parse(stored);
          // Limpiar datos duplicados al cargar
          const cleanedData = {};
          Object.entries(parsedData).forEach(([week, activities]) => {
            cleanedData[week] = cleanDuplicatedActivities(activities);
          });
          
          setWeeksData(cleanedData);
          // Guardar datos limpios
          localStorage.setItem(key, JSON.stringify(cleanedData));
        } catch (e) {
          console.error('Error al cargar datos del usuario:', e);
          setWeeksData({});
        }
      } else {
        setWeeksData({});
      }
    } else {
      setWeeksData({});
    }
  }, [user]);

  // Guardar datos automáticamente cuando cambian y hay usuario
  useEffect(() => {
    if (user && user.username) {
      const key = `studyPlannerData_${user.username}`;
      localStorage.setItem(key, JSON.stringify(weeksData));
    }
  }, [weeksData, user]);

  const [studyPlans, setStudyPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const DAYS_LIST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // Cargar planes de estudio
  useEffect(() => {
    if (user && user.username) {
      const key = `studyPlans_${user.username}`;
      const stored = localStorage.getItem(key);
      let loadedPlans = [];

      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          loadedPlans = parsed.plans || [];
        } catch {}
      }

      // Garantizar que el plan default de defaultActivities siempre exista
      const hasDefault = loadedPlans.some(p => p.id === 'plan_default');
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
        const defaultPlan = {
          id: 'plan_default',
          name: 'Plan default',
          createdAt: '2025-01-01T00:00:00.000Z',
          activities: defaultPlanActivities,
          isDefault: true,
        };
        loadedPlans = [defaultPlan, ...loadedPlans];
      }

      setStudyPlans(loadedPlans);

      const savedActiveId = stored ? (JSON.parse(stored).activePlanId || null) : null;
      if (savedActiveId && loadedPlans.some(p => p.id === savedActiveId)) {
        setActivePlanId(savedActiveId);
      } else if (loadedPlans.length > 0) {
        setActivePlanId(loadedPlans[0].id);
      } else {
        setActivePlanId(null);
      }
    } else {
      setStudyPlans([]);
      setActivePlanId(null);
    }
  }, [user]);

  // Guardar planes automáticamente
  useEffect(() => {
    if (user && user.username && studyPlans.length >= 0) {
      const key = `studyPlans_${user.username}`;
      localStorage.setItem(key, JSON.stringify({
        plans: studyPlans,
        activePlanId,
      }));
    }
  }, [studyPlans, activePlanId, user]);

  // CRUD de planes
  const handleCreatePlan = (planId, name) => {
    const emptyActivities = {};
    DAYS_LIST.forEach(d => { emptyActivities[d] = []; });
    const newPlan = { id: planId, name, createdAt: new Date().toISOString(), activities: emptyActivities };
    setStudyPlans(prev => [...prev, newPlan]);
    setActivePlanId(planId);
  };

  const handleDeletePlan = (planId) => {
    if (planId === 'plan_default') return;
    setStudyPlans(prev => {
      const updated = prev.filter(p => p.id !== planId);
      if (activePlanId === planId) {
        setActivePlanId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  const handleRenamePlan = (planId, newName) => {
    setStudyPlans(prev => prev.map(p => p.id === planId ? { ...p, name: newName } : p));
  };

  const handleAddActivityToPlan = (planId, activity) => {
    setStudyPlans(prev => prev.map(p => {
      if (p.id !== planId) return p;
      const dayActivities = p.activities[activity.dia] || [];
      return {
        ...p,
        activities: {
          ...p.activities,
          [activity.dia]: [...dayActivities, activity],
        },
      };
    }));
  };

  const handleDeleteActivityFromPlan = (planId, day, activityId) => {
    setStudyPlans(prev => prev.map(p => {
      if (p.id !== planId) return p;
      return {
        ...p,
        activities: {
          ...p.activities,
          [day]: (p.activities[day] || []).filter(a => a.id !== activityId),
        },
      };
    }));
  };

  const handleUpdateActivityInPlan = (planId, updates) => {
    setStudyPlans(prev => {
      const plan = prev.find(p => p.id === planId);
      if (!plan) return prev;

      const newPlans = prev.map(p => {
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

      return newPlans;
    });
  };

  const handleCopyFromPlan = (targetPlanId, sourcePlanId) => {
    setStudyPlans(prev => {
      const source = prev.find(p => p.id === sourcePlanId);
      if (!source) return prev;
      const copiedActivities = {};
      DAYS_LIST.forEach(d => {
        copiedActivities[d] = (source.activities[d] || []).map(act => ({
          ...act,
          id: `plan-${d}-${act.actividad.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        }));
      });
      return prev.map(p => {
        if (p.id !== targetPlanId) return p;
        return { ...p, activities: copiedActivities };
      });
    });
  };

  const getActivePlan = () => studyPlans.find(p => p.id === activePlanId) || null;

  const saveCredentials = async (username, password) => {
    try {
      const encrypted = await encryptData(JSON.stringify({ username }), password);
      localStorage.setItem('userCredentials', JSON.stringify(encrypted));
      setUser({ username });
      setLoginError('');
    } catch (error) {
      setLoginError('Error al guardar credenciales');
      console.error(error);
    }
  };

  const loadCredentials = async (password) => {
    try {
      const encrypted = JSON.parse(localStorage.getItem('userCredentials'));
      if (!encrypted) return null;
      
      const data = await decryptData(encrypted, password);
      return JSON.parse(data);
    } catch (error) {
      setLoginError('Credenciales inválidas');
      return null;
    }
  };

  const handleLogin = async (username, mode = 'login') => {
    // Obtiene la lista de usuarios
    let userList = [];
    try {
      userList = JSON.parse(localStorage.getItem('userList')) || [];
    } catch {}

    if (mode === 'login') {
      if (!userList.includes(username)) {
        setLoginError('Ese usuario no existe. ¿Quieres crear una cuenta?');
        setAuthMode('register');
        setPendingUsername(username);
        return;
      }
    }

    // Login directo por username
    if (mode === 'login') {
      setUser({ username });
      setLoginError('');
      localStorage.setItem('lastLoggedUsername', username);
      localStorage.setItem('hasHadUser', 'true');
      // Agregar este dispositivo a la lista de confianza
      const trustedKey = `trustedDevices_${username}`;
      let trusted = [];
      try {
        trusted = JSON.parse(localStorage.getItem(trustedKey)) || [];
      } catch {}
      if (!trusted.includes(deviceId)) {
        trusted.push(deviceId);
        localStorage.setItem(trustedKey, JSON.stringify(trusted));
      }
    } else {
      // Crear usuario nuevo
      localStorage.setItem('lastLoggedUsername', username);
      localStorage.setItem('hasHadUser', 'true');
      if (!userList.includes(username)) {
        userList.push(username);
        localStorage.setItem('userList', JSON.stringify(userList));
      }
      const trustedKey = `trustedDevices_${username}`;
      localStorage.setItem(trustedKey, JSON.stringify([deviceId]));
      setUser({ username });
      setLoginError('');
    }
  }; 

  const handleLogout = () => {
    if (user && user.username) {
      // Eliminar este dispositivo de la lista de confianza
      const trustedKey = `trustedDevices_${user.username}`;
      let trusted = [];
      try {
        trusted = JSON.parse(localStorage.getItem(trustedKey)) || [];
      } catch {}
      trusted = trusted.filter(id => id !== deviceId);
      localStorage.setItem(trustedKey, JSON.stringify(trusted));
    }
    localStorage.removeItem('userCredentials');
    localStorage.removeItem('lastLoggedUsername');
    setUser(null);
  };


  useEffect(() => {
    const initializeWeek = () => {
      // No inicializar semanas si no hay usuario
      if (!user || !user.username) return;

      // Inicializar solo si la semana no existe o está vacía
      if (weeksData[currentWeek] && weeksData[currentWeek].length > 0) return;
      
      console.log(`Inicializando semana: ${currentWeek}`);
      
      // Verificar si ya hay actividades para esta semana en localStorage
      const userWeekStorageKey = `week_${user.username}_${currentWeek}`;
      const legacyWeekStorageKey = `week_${currentWeek}`;
      const storedWeekData =
        localStorage.getItem(userWeekStorageKey) ?? localStorage.getItem(legacyWeekStorageKey);
      
      if (storedWeekData) {
        // Si hay datos guardados, usarlos
        try {
          const parsedData = cleanDuplicatedActivities(JSON.parse(storedWeekData));
          setWeeksData(prev => ({
            ...prev,
            [currentWeek]: parsedData
          }));
          // Migrar/asegurar guardado por usuario
          localStorage.setItem(userWeekStorageKey, JSON.stringify(parsedData));
          return;
        } catch (e) {
          console.error('Error al cargar datos de la semana:', e);
        }
      }
      
      // Si no hay datos guardados, desplegar plan activo
      const activePlan = studyPlans.find(p => p.id === activePlanId);
      if (activePlan && activePlan.activities) {
        const planActivities = Object.entries(activePlan.activities).flatMap(([day, acts]) =>
          (Array.isArray(acts) ? acts : []).map(act => ({
            ...act,
            semana: currentWeek,
            dia: day,
            id: `${currentWeek}-${day}-${act.actividad}`.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
            completado: false,
          })).map(normalizeActivity)
        );
        
        localStorage.setItem(userWeekStorageKey, JSON.stringify(planActivities));
        setWeeksData(prev => ({
          ...prev,
          [currentWeek]: planActivities
        }));
      }
    };

    initializeWeek();
  }, [currentWeek, weeksData, setWeeksData, user, studyPlans, activePlanId]);

  // Re-desplegar plan activo cuando cambia activePlanId
  useEffect(() => {
    if (!user || !user.username || !activePlanId || !currentWeek) return;
    const activePlan = studyPlans.find(p => p.id === activePlanId);
    if (!activePlan || !activePlan.activities) return;

    const userWeekStorageKey = `week_${user.username}_${currentWeek}`;
    const planActivities = Object.entries(activePlan.activities).flatMap(([day, acts]) =>
      (Array.isArray(acts) ? acts : []).map(act => ({
        ...act,
        semana: currentWeek,
        dia: day,
        id: `${currentWeek}-${day}-${act.actividad}`.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
        completado: false,
      })).map(normalizeActivity)
    );

    localStorage.setItem(userWeekStorageKey, JSON.stringify(planActivities));
    setWeeksData(prev => ({
      ...prev,
      [currentWeek]: planActivities
    }));
  }, [activePlanId]);

  const currentWeekData = Array.isArray(weeksData[currentWeek]) ? weeksData[currentWeek] : [];

  const allActivities = Object.values(weeksData).flat();

  const cloneWeeksData = (data) => JSON.parse(JSON.stringify(data || {}));

  const persistWeekActivities = (weekKey, activities) => {
    if (!weekKey) return;
    if (user && user.username) {
      localStorage.setItem(`week_${user.username}_${weekKey}`, JSON.stringify(activities || []));
    } else {
      localStorage.setItem(`week_${weekKey}`, JSON.stringify(activities || []));
    }
  };

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
  
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  
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

  // Ordenar actividades dentro de cada día por prioridad de tipo
  const TYPE_PRIORITY = {
    'Algoritmos': 1,
    'Actividad Principal': 2,
    'Principal': 2,
    'Secundaria': 3,
    'Menor Prioridad': 4,
    'Menor prioridad': 4,
    'Conocimiento Pasivo': 5,
    'Conocimiento pasivo': 5
  };

  Object.keys(activitiesByDay).forEach(day => {
    activitiesByDay[day] = (activitiesByDay[day] || []).slice().sort((a, b) => {
      const ba = Boolean(a?.bloqueada);
      const bb = Boolean(b?.bloqueada);
      if (ba !== bb) return ba ? 1 : -1; // bloqueadas siempre al final
      const pa = TYPE_PRIORITY[a?.tipo] ?? 999;
      const pb = TYPE_PRIORITY[b?.tipo] ?? 999;
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
  const [customActivities, setCustomActivities] = useState({});
  const [activeSidebarSection, setActiveSidebarSection] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleSaveNotes = (dayKey, newNotes) => {
    setNotes(prevNotes => ({ ...prevNotes, [dayKey]: newNotes }));
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
    setIsCalendarModalOpen(true);
  };

  const handleCloseCalendar = () => {
    setIsCalendarModalOpen(false);
    setActiveSidebarSection('dashboard');
  };

  const handleOpenFrequency = () => {
    setActiveSidebarSection('activity');
    setIsCalendarModalOpen(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
    setShowFrequencyModal(true);
  };

  const handleCloseFrequency = () => {
    setShowFrequencyModal(false);
    setActiveSidebarSection('dashboard');
  };

  const handleOpenSettings = () => {
    setActiveSidebarSection('settings');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setIsResourcesModalOpen(false);
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
  };

  const handleOpenResources = () => {
    setActiveSidebarSection('resources');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(true);
  };

  const handleCloseResources = () => {
    setIsResourcesModalOpen(false);
    setActiveSidebarSection('dashboard');
  };

  const handleOpenPlanner = () => {
    setActiveSidebarSection('planner');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
  };

  const handleSidebarDashboard = () => {
    setActiveSidebarSection('dashboard');
    setIsCalendarModalOpen(false);
    setShowFrequencyModal(false);
    setShowSettingsModal(false);
    setIsResourcesModalOpen(false);
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
      isContextTagsModalOpen
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
    isContextTagsModalOpen
  ]);

  const updateCompletions = (date, activityId, completed) => {
    setCompletions(prev => {
      const dateStr = date.toISOString().split('T')[0];
      const newCompletions = { ...prev };
      if (!newCompletions[dateStr]) {
        newCompletions[dateStr] = { completed: 0, total: 0 };
      }
      // Update the count based on completion status
      const activityDate = format(date, 'yyyy-MM-dd');
      if (!newCompletions[activityDate]) {
        newCompletions[activityDate] = { completed: 0, total: 0 };
      }
      if (completed) {
        newCompletions[activityDate].completed += 1;
      } else {
        newCompletions[activityDate].completed = Math.max(0, newCompletions[activityDate].completed - 1);
      }
      return newCompletions;
    });
  };

  useEffect(() => {
    const newCompletions = {};
    
    // First, count all activities by date
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
    <div className={`dashboard-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`dashboard-sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
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
            onClick={handleSidebarDashboard}
          >
            <FaThLarge />
            <span>Dashboard</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'planner' ? 'active' : ''}`}
            type="button"
            onClick={handleOpenPlanner}
          >
            <FaClipboardList />
            <span>Planificador</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'activity' ? 'active' : ''}`}
            type="button"
            onClick={handleOpenFrequency}
          >
            <FaChartLine />
            <span>Actividad</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'calendar' ? 'active' : ''}`}
            type="button"
            onClick={handleOpenCalendar}
          >
            <FaCalendarAlt />
            <span>Calendario</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'resources' ? 'active' : ''}`}
            type="button"
            onClick={handleOpenResources}
          >
            <FaBook />
            <span>Recursos</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeSidebarSection === 'settings' ? 'active' : ''}`}
            type="button"
            onClick={handleOpenSettings}
          >
            <FaCog />
            <span>Ajustes</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">Bienvenido, {user.username}</div>
          <button className="sidebar-logout-btn" type="button" onClick={handleLogout}>
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
            onSetActivePlan={setActivePlanId}
            onCreatePlan={handleCreatePlan}
            onDeletePlan={handleDeletePlan}
            onRenamePlan={handleRenamePlan}
            onAddActivity={handleAddActivityToPlan}
            onDeleteActivity={handleDeleteActivityFromPlan}
            onUpdateActivity={handleUpdateActivityInPlan}
            onCopyFromPlan={handleCopyFromPlan}
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
      />

      <ResourcesModal
        isOpen={isResourcesModalOpen}
        onClose={handleCloseResources}
        activities={allActivities}
        onAddActivity={handleAddActivity}
      />
    </div>
  );
}
