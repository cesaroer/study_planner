import React from 'react';

const Activity = ({
  activity,
  onToggle,
  onOpenContextMenu,
  onDragStartActivity,
  onDragEndActivity,
  isDragged = false
}) => {
  const isBlocked = Boolean(activity?.bloqueada);
  const triggerRef = React.useRef(null);

  const handleContainerClick = (e) => {
    if (isBlocked) return;
    if (e.target.closest('.activity-menu-trigger')) return;
    if (e.target.closest('.activity-check')) return;
    onToggle(activity.id);
  };

  const handleCheckToggle = (e) => {
    if (isBlocked) return;
    e.stopPropagation();
    onToggle(activity.id);
  };

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
      onClick={handleContainerClick}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === ' ' && handleContainerClick(e)}
      draggable={!isBlocked}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="activity-checkbox">
        <button
          type="button"
          className={`activity-check ${activity.completado ? 'is-checked' : ''}`}
          role="checkbox"
          aria-checked={Boolean(activity.completado)}
          disabled={isBlocked}
          onClick={handleCheckToggle}
          aria-label={
            isBlocked
              ? `"${activity.actividad}" está bloqueada`
              : `Marcar "${activity.actividad}" como ${activity.completado ? 'no completada' : 'completada'}`
          }
        >
          <span className="activity-check-icon" aria-hidden="true">✓</span>
        </button>
      </div>
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
        ref={triggerRef}
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

export default Activity;
