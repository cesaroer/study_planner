import React from 'react';

const Activity = ({ activity, onToggle }) => {
  const isBlocked = Boolean(activity?.bloqueada);

  const handleContainerClick = (e) => {
    if (isBlocked) return;
    // Only toggle if the click is not on the checkbox or its label
    if (!e.target.matches('input[type="checkbox"]')) {
      onToggle(activity.id);
    }
  };

  const handleCheckboxChange = (e) => {
    if (isBlocked) return;
    e.stopPropagation();
    onToggle(activity.id);
  };

  return (
    <div 
      className={`activity ${isBlocked ? 'blocked' : ''}`} 
      onClick={handleContainerClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === ' ' && handleContainerClick(e)}
    >
      <div className="activity-checkbox">
        <input 
          type="checkbox"
          checked={activity.completado}
          disabled={isBlocked}
          onChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
          aria-label={
            isBlocked
              ? `"${activity.actividad}" está bloqueada`
              : `Marcar "${activity.actividad}" como ${activity.completado ? 'no completada' : 'completada'}`
          }
        />
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
    </div>
  );
};

export default Activity;
