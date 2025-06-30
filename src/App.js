import React, { useState, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import WeekNavigation from './components/WeekNavigation';
import DayView from './components/DayView';
import DayDetailModal from './components/DayDetailModal'; 
import { defaultActivities } from './data/defaultActivities';
import ProgressBar from './components/ProgressBar';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export default function App() {
  const [currentWeek, setCurrentWeek] = useState(() => {
    // Get current date
    const today = new Date();
    // Get the start of the current week (Monday)
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    // Format as YYYY-MM-DD
    return format(monday, 'yyyy-MM-dd');
  });
  
  const [weeksData, setWeeksData] = useLocalStorage('studyPlannerData', {});

  // Initialize week if it doesn't exist OR if the data is not an array (old format)
  useEffect(() => {
    if (!weeksData[currentWeek] || !Array.isArray(weeksData[currentWeek])) {
      console.log(`Initializing week: ${currentWeek}`);
      const newWeekActivities = Object.entries(defaultActivities).flatMap(([day, acts]) =>
        acts.map(act => ({ ...act, semana: currentWeek, dia: day, id: `${currentWeek}-${day}-${act.actividad}` }))
      );
      
      setWeeksData(prev => ({
        ...prev,
        [currentWeek]: newWeekActivities,
      }));
    }
  }, [currentWeek, weeksData, setWeeksData]);

  // Ensure currentWeekData is always an array to prevent crashes.
  const currentWeekData = Array.isArray(weeksData[currentWeek]) ? weeksData[currentWeek] : [];

  // Debugging logs
  console.log("weeksData:", weeksData);
  console.log("currentWeek:", currentWeek);
  console.log("currentWeekData:", currentWeekData);

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
  
  // Calculate progress
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
  
  // Group activities by day
  const activitiesByDay = currentWeekData.reduce((acc, activity) => {
    if (!acc[activity.dia]) acc[activity.dia] = [];
    acc[activity.dia].push(activity);
    return acc;
  }, {});
  
  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  
  // Function to get day number from day name and current week
  const getDayNumber = (dayName) => {
    const dayIndex = days.indexOf(dayName);
    if (dayIndex === -1) return '';
    
    const weekStart = parseISO(currentWeek);
    const dayDate = addDays(weekStart, dayIndex);
    return format(dayDate, 'd');
  };
  
  // Get today's date
  const today = new Date();
  const todayFormatted = format(today, 'yyyy-MM-dd');
  const todayDayName = days[today.getDay() === 0 ? 6 : today.getDay() - 1]; // Convert JS day to our day index
  
  // Function to check if a day is today
  const isCurrentDay = (dayName) => {
    // Get the date for the current week's Monday
    const weekStart = parseISO(currentWeek);
    const dayIndex = days.indexOf(dayName);
    const dayDate = addDays(weekStart, dayIndex);
    
    // Format the day's date as YYYY-MM-DD
    const dayFormatted = format(dayDate, 'yyyy-MM-dd');
    
    return dayFormatted === todayFormatted;
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [notes, setNotes] = useState({}); // State to store notes for each day

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

  return (
    <div className="app">
      <h1 className="app-title">Agenda de Estudio</h1>
      
      <WeekNavigation 
        onPrev={() => navigateWeek('prev')} 
        onNext={() => navigateWeek('next')} 
        currentWeek={currentWeek} 
      />
      
      <div className="progress-summary">
        <p>{progressText}</p>
        <ProgressBar progress={progress} />
      </div>
      
      <div className="week-view">
        {days.map(day => (
          activitiesByDay[day] && (
            <DayView 
              key={day} 
              day={day} 
              dayNumber={getDayNumber(day)}
              activities={activitiesByDay[day]} 
              onToggle={handleToggleActivity} 
              onDayClick={() => handleDayClick(day)}
              isToday={isCurrentDay(day)}
            />
          )
        ))}
      </div>

      {isModalOpen && selectedDay && (
        <DayDetailModal
          day={selectedDay} // Pass selected day
          activities={activitiesByDay[selectedDay] || []}
          notes={notes[selectedDay] || ''}
          onToggleActivity={handleToggleActivity}
          onSaveNotes={handleSaveNotes}
          onClose={handleCloseModal}
          onCheckAll={handleCheckAll}
          onUncheckAll={handleUncheckAll}
        />
      )}
    </div>
  );
}
