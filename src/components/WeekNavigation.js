import React from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { format, startOfWeek, addDays, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getWeekNumber } from './DayView';
import WeekTabs from './WeekTabs';

const getWeekRange = (date) => {
  const start = startOfWeek(parseISO(date), { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return { start, end };
};

const formatDate = (date) => {
  return format(date, 'd MMM', { locale: es });
};

const WeekNavigation = ({
  onPrev,
  onNext,
  currentWeek,
  onSelectDate,
  selectedDate,
  activitiesByDay
}) => {
  const weekNumber = getWeekNumber(parseISO(currentWeek));
  const { start, end } = getWeekRange(currentWeek);
  const weekRangeString = `${formatDate(start)} - ${formatDate(end)}`;
  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const weekStart = startOfDay(parseISO(currentWeek));
  const selectedOffsetRaw = differenceInCalendarDays(startOfDay(selectedDate), weekStart);
  const selectedOffset = Math.min(6, Math.max(0, selectedOffsetRaw));
  const selectedDayName = dayNames[selectedOffset];

  const selectedActivities = Array.isArray(activitiesByDay?.[selectedDayName])
    ? activitiesByDay[selectedDayName]
    : [];
  const selectedTotal = selectedActivities.filter(activity => activity && !activity.bloqueada).length;
  const selectedCompleted = selectedActivities.filter(
    activity => activity && !activity.bloqueada && activity.completado
  ).length;
  const selectedProgress = selectedTotal > 0 ? Math.round((selectedCompleted / selectedTotal) * 100) : 0;

  return (
    <section className="week-hero" aria-label="Navegación semanal">
      <div className="week-hero-top">
        <div className="week-hero-copy">
          <h2 className="week-hero-day">{selectedDayName}</h2>
          <p className="week-hero-day-progress">{selectedProgress}% completado</p>
          <p className="week-hero-week-meta">Semana {weekNumber} · {weekRangeString}</p>
        </div>
        <div className="week-hero-controls">
          <button className="week-hero-arrow" onClick={onPrev} aria-label="Semana anterior">
            <FaChevronLeft />
          </button>
          <button className="week-hero-arrow" onClick={onNext} aria-label="Semana siguiente">
            <FaChevronRight />
          </button>
        </div>
      </div>

      <WeekTabs
        currentWeek={currentWeek}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        activitiesByDay={activitiesByDay}
      />
    </section>
  );
};

export default WeekNavigation;
