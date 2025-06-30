import React from 'react';
import { FaCalendarAlt } from 'react-icons/fa';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getWeekNumber } from './DayView';

const getWeekRange = (date) => {
  const start = startOfWeek(parseISO(date), { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return { start, end };
};

const formatDate = (date) => {
  return format(date, 'd MMM', { locale: es });
};

const WeekNavigation = ({ onPrev, onNext, currentWeek, onOpenCalendar }) => {
  const weekNumber = getWeekNumber(parseISO(currentWeek));
  const { start, end } = getWeekRange(currentWeek);
  const weekRangeString = `${formatDate(start)} - ${formatDate(end)}`;
  const currentWeekString = `Semana ${weekNumber}: ${weekRangeString}`;

  return (
    <div className="week-navigation">
      <button onClick={onPrev}>← Semana anterior</button>
      <div className="week-title">
        <h2>
          <span className="week-number">Semana {weekNumber}</span>
          <span className="week-range">: {weekRangeString}</span>
        </h2>
      </div>
      <button onClick={onNext}>Semana siguiente →</button>
      <button 
        className="calendar-button" 
        onClick={onOpenCalendar}
        title="Ver calendario"
      >
        <FaCalendarAlt />
      </button>
    </div>
  );
};

export default WeekNavigation;
