import React, { useState, useEffect } from 'react';
import { FaCalendarAlt, FaChartBar, FaCog, FaChevronLeft, FaChevronRight, FaBook } from 'react-icons/fa';
import { format, startOfWeek, addDays, parseISO, isToday } from 'date-fns';
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

const WeekNavigation = ({ onPrev, onNext, currentWeek, onOpenCalendar, onOpenFrequency, onOpenSettings, onOpenResources, onSelectDate, selectedDate }) => {
  const weekNumber = getWeekNumber(parseISO(currentWeek));
  const { start, end } = getWeekRange(currentWeek);
  const weekRangeString = `${formatDate(start)} - ${formatDate(end)}`;
  const [localSelectedDate, setLocalSelectedDate] = useState(selectedDate || new Date());

  // Sincronizar con la fecha seleccionada desde las props
  useEffect(() => {
    if (selectedDate) {
      setLocalSelectedDate(selectedDate);
    }
  }, [selectedDate]);

  const handleDateSelect = (date) => {
    setLocalSelectedDate(date);
    if (onSelectDate) onSelectDate(date);
  };

  return (
    <div className="week-navigation">
      {/* Primera fila: Botones de acción */}
      <div className="action-buttons">
        <button 
          className="icon-button" 
          onClick={onOpenFrequency}
          title="Ver frecuencias"
          aria-label="Ver frecuencias"
        >
          <FaChartBar />
        </button>
        <button 
          className="icon-button" 
          onClick={onOpenCalendar}
          title="Ver calendario"
          aria-label="Ver calendario"
        >
          <FaCalendarAlt />
        </button>
        <button
          className="icon-button"
          onClick={onOpenResources}
          title="Recursos"
          aria-label="Recursos"
        >
          <FaBook />
        </button>
        <button
          className="icon-button"
          onClick={onOpenSettings}
          title="Ajustes"
          aria-label="Ajustes"
        >
          <FaCog />
        </button>
      </div>

      {/* Segunda fila: Navegación de semana */}
      <div className="week-header">
        <button className="nav-button" onClick={onPrev} aria-label="Semana anterior">
          <FaChevronLeft />
        </button>
        <div className="week-title">
          <h2>
            <span className="week-number">Semana {weekNumber}</span>
            <span className="week-range">{weekRangeString}</span>
          </h2>
        </div>
        <button className="nav-button" onClick={onNext} aria-label="Semana siguiente">
          <FaChevronRight />
        </button>
      </div>

      {/* Tercera fila: Pestañas de días */}
      <div className="week-tabs-container">
        <WeekTabs 
          currentWeek={currentWeek} 
          selectedDate={localSelectedDate}
          onSelectDate={handleDateSelect}
        />
      </div>
    </div>
  );
};

export default WeekNavigation;
