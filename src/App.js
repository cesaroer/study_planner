import React, { useState, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import WeekNavigation from './components/WeekNavigation';
import DayView from './components/DayView';
import DayDetailModal from './components/DayDetailModal'; 
import { defaultActivities } from './data/defaultActivities';
import ProgressBar from './components/ProgressBar';
import { format, startOfWeek, addDays, parseISO, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import CalendarModal from './components/CalendarModal';
import FrequencyModal from './components/FrequencyModal';
import SettingsModal from './components/SettingsModal';
import { encryptData, decryptData } from './auth/cryptoUtils';

// Utilidad simple para generar UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
  
  // Hook para datos de usuario actual (clave depende del usuario)
  const [weeksData, setWeeksData] = useState({});

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
      setWeeksData(stored ? JSON.parse(stored) : {});
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
    // Only initialize if the week doesn't exist or is empty
    if (!weeksData[currentWeek] || weeksData[currentWeek].length === 0) {
      console.log(`Initializing week: ${currentWeek}`);
      const newWeekActivities = Object.entries(defaultActivities).flatMap(([day, acts]) =>
        acts.map(act => ({
          ...act,
          semana: currentWeek,
          dia: day,
          id: `${currentWeek}-${day}-${act.actividad}-${Date.now()}`,
          completado: false
        }))
      );
      
      setWeeksData(prev => {
        // Only set if it's still not initialized to avoid race conditions
        if (!prev[currentWeek] || prev[currentWeek].length === 0) {
          return {
            ...prev,
            [currentWeek]: newWeekActivities,
          };
        }
        return prev;
      });
    }
  }, [currentWeek, weeksData, setWeeksData]);

  const currentWeekData = Array.isArray(weeksData[currentWeek]) ? weeksData[currentWeek] : [];

  const allActivities = Object.values(weeksData).flat();

  const handleToggleActivity = (id) => {
    setWeeksData(prev => ({
      ...prev,
      [currentWeek]: prev[currentWeek].map(act =>
        act.id === id ? { ...act, completado: !act.completado } : act
      ),
    }));
  };
  
  const navigateWeek = (direction) => {
    const currentMonday = parseISO(currentWeek);
    const newMonday = addDays(currentMonday, direction === 'next' ? 7 : -7);
    setCurrentWeek(format(newMonday, 'yyyy-MM-dd'));
  };
  
  const completedCount = currentWeekData.filter(a => a.completado).length;
  const totalCount = currentWeekData.length;
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
  
  // Ensure all days exist in the object, even if empty
  days.forEach(day => {
    if (!activitiesByDay[day]) {
      activitiesByDay[day] = [];
    }
  });
  
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [notes, setNotes] = useState({}); 
  const [completions, setCompletions] = useState({});
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customActivities, setCustomActivities] = useState({});

  const handleSaveNotes = (dayKey, newNotes) => {
    setNotes(prevNotes => ({ ...prevNotes, [dayKey]: newNotes }));
  };

  const handleCheckAll = (dayKey) => {
    setWeeksData(prevWeeksData => {
      const newWeeksData = { ...prevWeeksData };
      newWeeksData[currentWeek] = newWeeksData[currentWeek].map(activity =>
        activity.dia === dayKey ? { ...activity, completado: true } : activity
      );
      return newWeeksData;
    });
  };

  const handleUncheckAll = (dayKey) => {
    setWeeksData(prevWeeksData => {
      const newWeeksData = { ...prevWeeksData };
      newWeeksData[currentWeek] = newWeeksData[currentWeek].map(activity =>
        activity.dia === dayKey ? { ...activity, completado: false } : activity
      );
      return newWeeksData;
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
    setIsCalendarModalOpen(true);
  };

  const handleCloseCalendar = () => {
    setIsCalendarModalOpen(false);
  };

  const handleOpenFrequency = () => {
    setShowFrequencyModal(true);
  };

  const handleOpenSettings = () => {
    setShowSettingsModal(true);
  };

  const handleAddActivity = (newActivity, day) => {
    setWeeksData(prevWeeksData => {
      const newWeeksData = { ...prevWeeksData };
      const weekKey = currentWeek; // Use the current week from state
      
      // Initialize the week if it doesn't exist
      if (!newWeeksData[weekKey]) {
        newWeeksData[weekKey] = [];
      }
      
      // Add the new activity with the correct structure
      const activityToAdd = {
        ...newActivity,
        semana: weekKey,
        dia: day,
        id: `${weekKey}-${day}-${newActivity.actividad}-${Date.now()}`
      };
      
      // Check if activity with same ID already exists
      const existingIndex = newWeeksData[weekKey].findIndex(
        act => act.id === activityToAdd.id
      );
      
      if (existingIndex >= 0) {
        // Update existing activity
        newWeeksData[weekKey][existingIndex] = activityToAdd;
      } else {
        // Add new activity
        newWeeksData[weekKey] = [
          ...(newWeeksData[weekKey] || []),
          activityToAdd
        ];
      }
      
      // Save to localStorage
      localStorage.setItem('weeksData', JSON.stringify(newWeeksData));
      
      return newWeeksData;
    });
  };

  const handleCloseSettings = () => {
    setShowSettingsModal(false);
  };

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
        <div className="login-card">
          <div className="login-logo">
            <span className="logo-circle">🟦</span>
          </div>
          <h2 className="login-title">{authMode === 'login' ? 'Welcome Back' : 'Crea tu cuenta'}</h2>
          <p className="login-sub">
            {authMode === 'login'
              ? 'Ingresa tu usuario y contraseña para acceder'
              : 'Elige tu usuario y contraseña para crear tu cuenta'}
          </p>
          {loginError && <p className="login-error">{loginError}</p>}
          <form className="login-form" onSubmit={handleForm}>
            <div className="login-field">
              <input type="text" name="username" placeholder="Nombre de usuario" autoComplete="username" required defaultValue={pendingUsername} />
            </div>
            <button className="login-btn" type="submit">{authMode === 'login' ? 'Login' : 'Crear cuenta'}</button>
          </form>
          {authMode === 'register' && (
            <div style={{textAlign:'center',marginTop:10}}>
              <button className="login-link" style={{background:'none',border:'none',color:'#69f',cursor:'pointer'}} onClick={()=>{setAuthMode('login');setLoginError('');}}>Volver a inicio de sesión</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="user-bar">
        <span>Bienvenido, {user.username}</span>
        <button onClick={handleLogout}>Salir</button>
      </div>
      
      <h1 className="app-title">Agenda de Estudio</h1>
      
      <WeekNavigation 
        onPrev={() => navigateWeek('prev')} 
        onNext={() => navigateWeek('next')} 
        currentWeek={currentWeek} 
        onOpenCalendar={handleOpenCalendar}
        onOpenFrequency={handleOpenFrequency}
        onOpenSettings={handleOpenSettings}
      />
      
      <div className="progress-summary">
        <p>{progressText}</p>
        <ProgressBar progress={progress} />
      </div>
      
      <div className="week-view">
        {days.map((day, index) => {
          const dayDate = addDays(parseISO(currentWeek), index);
          const isPast = isBefore(startOfDay(dayDate), today);
          return (
            activitiesByDay[day] && (
              <DayView 
                key={day} 
                day={day} 
                dayNumber={getDayNumber(day)}
                activities={activitiesByDay[day]} 
                onToggle={handleToggleActivity} 
                onDayClick={() => handleDayClick(day)}
                isToday={isCurrentDay(day)}
                isPast={isPast}
              />
            )
          );
        })}
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
          onClose={() => setShowFrequencyModal(false)}
          activities={allActivities}
          currentWeek={currentWeek}
        />
      )}
      
      <SettingsModal 
        isOpen={showSettingsModal} 
        onClose={handleCloseSettings} 
        onLogout={handleLogout}
        onAddActivity={handleAddActivity}
        currentWeekActivities={currentWeekData}
      />
    </div>
  );
}
