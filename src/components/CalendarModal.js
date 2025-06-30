import React, { useState } from 'react';
import CalendarHeatmap from 'react-calendar-heatmap';
import { Tooltip } from 'react-tooltip';
import { format } from 'date-fns';
import 'react-calendar-heatmap/dist/styles.css';
import './CalendarModal.css';

export default function CalendarModal({ isOpen, onClose, completions }) {
  const [viewMode, setViewMode] = useState('year'); // 'year', 'month', 'week'
  
  if (!isOpen) return null;
  
  // Calculate start dates for each view mode
  const now = new Date();
  
  const startDateYear = new Date();
  startDateYear.setFullYear(startDateYear.getFullYear() - 1);
  
  const startDateMonth = new Date();
  startDateMonth.setMonth(startDateMonth.getMonth() - 1);
  
  const startDateWeek = new Date();
  startDateWeek.setDate(startDateWeek.getDate() - 7);
  
  // Convert completions to heatmap data
  const heatmapData = Object.entries(completions).map(([date, obj]) => ({
    date,
    completed: obj.completed,
    total: obj.total,
  }));
  
  // Fixed cell sizes for each view
  const yearCellSize = 22;
  const yearGutterSize = 6;
  
  const monthCellSize = Math.round(yearCellSize * 0.5); // 50% smaller
  const monthGutterSize = 3;
  
  const weekCellSize = Math.round(yearCellSize * 0.3); // 70% smaller
  const weekGutterSize = 1;

  // Factor to scale entire heatmap based on view mode
  const zoomFactor = viewMode === 'year' ? 1 : viewMode === 'month' ? 0.5 : 0.3;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="calendar-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tu progreso</h2>
          <div className="view-buttons">
            <button 
              className={`view-button ${viewMode === 'year' ? 'active' : ''}`}
              onClick={() => setViewMode('year')}
            >
              Año
            </button>
            <button 
              className={`view-button ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
            >
              Mes
            </button>
            <button 
              className={`view-button ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              Semana
            </button>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="calendar-container" style={{ zoom: zoomFactor }}>
          {viewMode === 'year' && (
            <CalendarHeatmap
              startDate={startDateYear}
              endDate={now}
              values={heatmapData}
              classForValue={(value) => {
                if (!value || !value.completed) return 'color-empty';
                const c = value.completed;
                let level = 0;
                if (c >= 6) level = 4;
                else if (c >= 4) level = 3;
                else if (c >= 2) level = 2;
                else if (c === 1) level = 1;
                return `color-scale-${level}`;
              }}
              tooltipDataAttrs={(value) => {
                if (!value || !value.date) return {};
                const dateObj = new Date(value.date);
                const dateStr = format(dateObj, 'dd-MM');
                return {
                  'data-tooltip-id': 'calendar-tooltip',
                  'data-tooltip-content': `${dateStr} Actividades: ${value.completed} de ${value.total}`,
                };
              }}
              showWeekdayLabels={true}
              horizontal={true}
              weekdayLabels={['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']}
              gutterSize={yearGutterSize}
              
            />
          )}
          {viewMode === 'month' && (
            <CalendarHeatmap
              startDate={startDateMonth}
              endDate={now}
              values={heatmapData}
              classForValue={(value) => {
                if (!value || !value.completed) return 'color-empty';
                const c = value.completed;
                let level = 0;
                if (c >= 6) level = 4;
                else if (c >= 4) level = 3;
                else if (c >= 2) level = 2;
                else if (c === 1) level = 1;
                return `color-scale-${level}`;
              }}
              tooltipDataAttrs={(value) => {
                if (!value || !value.date) return {};
                const dateObj = new Date(value.date);
                const dateStr = format(dateObj, 'dd-MM');
                return {
                  'data-tooltip-id': 'calendar-tooltip',
                  'data-tooltip-content': `${dateStr} Actividades: ${value.completed} de ${value.total}`,
                };
              }}
              showWeekdayLabels={true}
              horizontal={true}
              weekdayLabels={['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']}
              gutterSize={monthGutterSize}
              
            />
          )}
          {viewMode === 'week' && (
            <CalendarHeatmap
              startDate={startDateWeek}
              endDate={now}
              values={heatmapData}
              classForValue={(value) => {
                if (!value || !value.completed) return 'color-empty';
                const c = value.completed;
                let level = 0;
                if (c >= 6) level = 4;
                else if (c >= 4) level = 3;
                else if (c >= 2) level = 2;
                else if (c === 1) level = 1;
                return `color-scale-${level}`;
              }}
              tooltipDataAttrs={(value) => {
                if (!value || !value.date) return {};
                const dateObj = new Date(value.date);
                const dateStr = format(dateObj, 'dd-MM');
                return {
                  'data-tooltip-id': 'calendar-tooltip',
                  'data-tooltip-content': `${dateStr} Actividades: ${value.completed} de ${value.total}`,
                };
              }}
              showWeekdayLabels={true}
              horizontal={true}
              weekdayLabels={['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']}
              gutterSize={weekGutterSize}
              
            />
          )}
          <Tooltip id="calendar-tooltip" />
        </div>
      </div>
    </div>
  );
}
