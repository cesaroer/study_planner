import React from 'react';

const PlannerActivityItem = ({
  activity,
  onOpenContextMenu,
  onDragStartActivity,
  onDragEndActivity,
  isDragged = false
}) => {
  const isBlocked = Boolean(activity?.bloqueada);

  const handleContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onOpenContextMenu) return;
    onOpenContextMenu({
      activityId: activity.id,
      day: activity.dia,
      x: event.clientX,
      y: event.clientY
    });
  };

  const handleMenuTrigger = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onOpenContextMenu) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenContextMenu({
      activityId: activity.id,
      day: activity.dia,
      x: rect.left,
      y: rect.bottom + 8
    });
  };

  const handleDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', activity.id);
    if (onDragStartActivity) {
      onDragStartActivity(activity.id, activity.dia);
    }
  };

  const handleDragEnd = () => {
    if (onDragEndActivity) {
      onDragEndActivity();
    }
  };

  return (
    <div
      className={`activity ${isBlocked ? 'blocked' : ''} ${activity.completado ? 'completed' : ''} ${isDragged ? 'dragging' : ''}`}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      draggable={!isBlocked}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {activity.icono && (
        <div className="activity-icon">
          {activity.icono}
        </div>
      )}
      <div className="activity-info">
        <span className={`activity-text ${activity.completado ? 'completed' : ''}`}>
          {activity.actividad}
        </span>
        {!isBlocked && <span className="activity-type">{activity.tipo}</span>}
      </div>
      <button
        type="button"
        className="activity-menu-trigger"
        aria-label="Acciones de la actividad"
        onClick={handleMenuTrigger}
      >
        ⋯
      </button>
    </div>
  );
};

export default PlannerActivityItem;
