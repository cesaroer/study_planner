import React from 'react';

const ESTIMATED_TIMES = {
  'Actividad Principal': '60-90 min',
  'Secundaria': '40-45 min',
  'Menor Prioridad': '20-25 min',
  'Algoritmos': '15-20 min',
  'Conocimiento Pasivo': '10-15 min',
};

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
      {ESTIMATED_TIMES[activity.tipo] && (
        <span className="modal-activity-time">{ESTIMATED_TIMES[activity.tipo]}</span>
      )}
    </div>
  );
};

export default ModalActivity;
