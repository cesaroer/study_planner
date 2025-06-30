import React from 'react';
import { getWeekNumber } from './DayView';

const getWeekRange = (date) => {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1)); // Monday
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Sunday
  return { start, end };
};

const formatDate = (date) => {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

const WeekNavigation = ({ onPrev, onNext, currentWeek }) => {
  const date = new Date(currentWeek);
  const weekNumber = getWeekNumber(date);
  const { start, end } = getWeekRange(date);
  const weekRangeString = `${formatDate(start)} - ${formatDate(end)}`;

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
    </div>
  );
};

export default WeekNavigation;
