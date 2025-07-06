import React from 'react';
import { format, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

const WeekTabs = ({ currentWeek, selectedDate, onSelectDate }) => {
  const startDate = parseISO(currentWeek);
  
  const days = Array.from({ length: 7 }, (_, i) => {
    const dayDate = addDays(startDate, i);
    const dayName = format(dayDate, 'EEE', { locale: es });
    const dayNumber = format(dayDate, 'd');
    const isSelected = format(dayDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
    const isToday = format(dayDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    
    return {
      date: dayDate,
      dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase(),
      dayNumber,
      isSelected,
      isToday,
    };
  });

  return (
    <div className="week-tabs">
      {days.map((day, index) => (
        <button
          key={index}
          className={`day-tab ${day.isSelected ? 'selected' : ''} ${day.isToday ? 'today' : ''}`}
          onClick={() => onSelectDate(day.date)}
        >
          <span className="day-name">{day.dayName}</span>
          <span className="day-number">{day.dayNumber}</span>
        </button>
      ))}
    </div>
  );
};

export default WeekTabs;
