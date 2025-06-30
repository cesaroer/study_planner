import React, { useState, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import WeekNavigation from './components/WeekNavigation';
import DayView from './components/DayView';
import DayDetailModal from './components/DayDetailModal'; 
import { defaultActivities } from './data/defaultActivities';
import ProgressBar from './components/ProgressBar';

export default function App() {
  const [currentWeek, setCurrentWeek] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    return monday.toISOString().split('T')[0];
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
    const date = new Date(currentWeek);
    date.setDate(date.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeek(date.toISOString().split('T')[0]);
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
              activities={activitiesByDay[day]} 
              onToggle={handleToggleActivity} 
              onDayClick={() => handleDayClick(day)} 
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
