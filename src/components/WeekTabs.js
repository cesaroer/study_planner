import React from 'react';
import { format, parseISO, addDays, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

const shortDayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const fullDayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const WeekTabs = ({ currentWeek, selectedDate, onSelectDate, activitiesByDay }) => {
  const startDate = parseISO(currentWeek);
  const today = startOfDay(new Date());
  
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayDate = addDays(startDate, i);
    const dayName = format(dayDate, 'EEE', { locale: es });
    const dayNumber = format(dayDate, 'd');
    const isSelected = format(dayDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
    const isToday = format(dayDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    const isPast = isBefore(startOfDay(dayDate), today);
    const temporalState = isToday ? 'today' : isPast ? 'past' : 'future';
    const activities = Array.isArray(activitiesByDay?.[fullDayNames[i]])
      ? activitiesByDay[fullDayNames[i]]
      : [];

    const total = activities.filter(activity => activity && !activity.bloqueada).length;
    const completed = activities.filter(
      activity => activity && !activity.bloqueada && activity.completado
    ).length;
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return {
      date: dayDate,
      dayName: shortDayNames[i] || dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase(),
      dayNumber,
      isSelected,
      isToday,
      isPast,
      completion,
      temporalState,
    };
  });

  return (
    <div className="week-segmented" role="tablist" aria-label="Días de la semana">
      {days.map((day, index) => (
        <button
          key={index}
          className={`week-segment ${day.temporalState} ${day.isSelected ? 'is-selected' : ''}`}
          onClick={() => onSelectDate(day.date)}
          role="tab"
          aria-selected={day.isSelected}
          aria-label={`${day.dayName} ${day.dayNumber}, ${day.completion}% completado`}
        >
          <span className="week-segment-name">{day.dayName}</span>
          <span className="week-segment-date">{day.dayNumber}</span>
          <svg className="week-segment-arc" viewBox="0 0 44 24" aria-hidden="true">
            <path
              className="week-segment-arc-track"
              d="M4 20 A18 18 0 0 1 40 20"
              pathLength="100"
            />
            <path
              className="week-segment-arc-value"
              d="M4 20 A18 18 0 0 1 40 20"
              pathLength="100"
              style={{ strokeDasharray: `${day.completion} 100` }}
            />
          </svg>
        </button>
      ))}
    </div>
  );
};

export default WeekTabs;
