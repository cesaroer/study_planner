import React from 'react';
import PlannerActivityItem from './PlannerActivityItem';

const DAYS_SHORT = {
  'Lunes': 'LUN',
  'Martes': 'MAR',
  'Miércoles': 'MIÉ',
  'Jueves': 'JUE',
  'Viernes': 'VIE',
  'Sábado': 'SÁB',
  'Domingo': 'DOM',
};

const TYPE_PRIORITY = {
  'Algoritmos': 1,
  'Actividad Principal': 2,
  'Principal': 2,
  'Secundaria': 3,
  'Menor Prioridad': 4,
  'Menor prioridad': 4,
  'Conocimiento Pasivo': 5,
  'Conocimiento pasivo': 5
};

const sortActivities = (activities) => {
  if (!activities || !Array.isArray(activities)) return [];
  return activities.slice().sort((a, b) => {
    const ba = Boolean(a?.bloqueada);
    const bb = Boolean(b?.bloqueada);
    if (ba !== bb) return ba ? 1 : -1;
    const pa = TYPE_PRIORITY[a?.tipo] ?? 999;
    const pb = TYPE_PRIORITY[b?.tipo] ?? 999;
    if (pa !== pb) return pa - pb;
    const na = (a?.actividad || '').toString();
    const nb = (b?.actividad || '').toString();
    return na.localeCompare(nb);
  });
};

export default function PlannerCell({
  day,
  activities,
  onAddClick,
  onDeleteActivity,
  onOpenContextMenu,
  onDragStartActivity,
  onDragEndActivity,
  onDropOnDay,
  onDragOverDay,
  onDragLeaveDay,
  draggedActivityId,
  isDropTarget,
  isDragSource
}) {
  const sortedActivities = sortActivities(activities);
  const hasActivities = sortedActivities.length > 0;

  const handleDragOver = (event) => {
    if (!onDragOverDay) return;
    onDragOverDay(day, event);
  };

  const handleDrop = (event) => {
    if (!onDropOnDay) return;
    onDropOnDay(day, event);
  };

  const handleDragLeave = (event) => {
    if (!onDragLeaveDay) return;
    onDragLeaveDay(day, event);
  };

  const handleContextMenu = (event, activity) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onOpenContextMenu) return;
    onOpenContextMenu({
      activityId: activity.id,
      day: day,
      x: event.clientX,
      y: event.clientY
    });
  };

  return (
    <div
      className={`planner-cell ${isDropTarget ? 'drop-target' : ''} ${isDragSource ? 'drag-source' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <div className="planner-cell-header">
        <span className="planner-cell-day-name">{DAYS_SHORT[day] || day}</span>
        {hasActivities && (
          <span className="planner-cell-count">{sortedActivities.length}</span>
        )}
      </div>

      {hasActivities ? (
        <div className="planner-cell-activities">
          {sortedActivities.map(activity => (
            <div
              key={activity.id}
              onContextMenu={(e) => handleContextMenu(e, activity)}
            >
              <PlannerActivityItem
                activity={activity}
                onOpenContextMenu={(data) => {
                  if (onOpenContextMenu) {
                    onOpenContextMenu({ ...data, day });
                  }
                }}
                onDragStartActivity={onDragStartActivity}
                onDragEndActivity={onDragEndActivity}
                isDragged={draggedActivityId === activity.id}
              />
            </div>
          ))}
          <button
            className="planner-add-placeholder"
            type="button"
            onClick={() => onAddClick(day)}
          >
            + Agregar
          </button>
        </div>
      ) : (
        <div className="planner-cell-placeholder">
          <button
            className="planner-add-placeholder"
            type="button"
            onClick={() => onAddClick(day)}
          >
            + Agregar
          </button>
        </div>
      )}
    </div>
  );
}
