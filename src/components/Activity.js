import React from 'react';

const Activity = ({ activity, onToggle }) => {
  const handleContainerClick = (e) => {
    // Only toggle if the click is not on the checkbox or its label
    if (!e.target.matches('input[type="checkbox"]')) {
      onToggle(activity.id);
    }
  };

  const handleCheckboxChange = (e) => {
    e.stopPropagation();
    onToggle(activity.id);
  };

  return (
    <div 
      className="activity" 
      onClick={handleContainerClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === ' ' && handleContainerClick(e)}
    >
      <div className="activity-checkbox">
        <input 
          type="checkbox"
          checked={activity.completado}
          onChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Marcar "${activity.actividad}" como ${activity.completado ? 'no completada' : 'completada'}`}
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
        <span className="activity-type">{activity.tipo}</span>
      </div>
    </div>
  );
};

export default Activity;
