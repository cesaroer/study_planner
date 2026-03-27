import React from 'react';

const ModalActivity = ({ activity, onToggle }) => {
  const handleClick = (e) => {
    e.stopPropagation();
    onToggle(activity.id);
  };

  return (
    <div 
      className={`modal-activity-tile ${activity.completado ? 'completed' : ''}`}
      onClick={handleClick}
    >
      <div className="modal-activity-checkbox">
        <input 
          type="checkbox"
          checked={activity.completado}
          onChange={handleClick}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {activity.icono && (
        <span className="modal-activity-icon">{activity.icono}</span>
      )}
      <div className="modal-activity-content">
        <span className="modal-activity-title">{activity.actividad}</span>
        <span className="modal-activity-tag">{activity.tipo}</span>
      </div>
    </div>
  );
};

export default ModalActivity;
