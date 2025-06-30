import React from 'react';

const ModalActivity = ({ activity, onToggle }) => {
  const handleClick = (e) => {
    e.stopPropagation(); // Prevent modal from closing if this is inside a modal
    onToggle(activity.id);
  };

  return (
    <div className={`modal-activity-tile ${activity.completado ? 'completed' : ''}`} onClick={handleClick}>
      <div className="modal-activity-content">
        {activity.icono && <span className="modal-activity-icon">{activity.icono}</span>}
        <h4 className="modal-activity-title">{activity.actividad}</h4>
        <span className="modal-activity-tag">{activity.tipo}</span>
      </div>
      {activity.completado && (
        <div className="modal-checkmark-overlay">
          <span role="img" aria-label="completed">✅</span>
        </div>
      )}
    </div>
  );
};

export default ModalActivity;
