import React from 'react';

const Activity = ({ activity, onToggle }) => (
  <div className="activity" onClick={(e) => e.stopPropagation()}>
    <input 
      type="checkbox" 
      checked={activity.completado} 
      onChange={(e) => {
        e.stopPropagation();
        onToggle(activity.id);
      }}
    />
    <div className="activity-info">
    <span className="activity-type"  style={{marginBottom: '10px'}}>{activity.tipo}</span>
      <span className={`activity-text ${activity.completado ? 'completed' : ''}`}>
        {activity.icono && <span style={{marginRight: '8px'}}>{activity.icono}</span>}
        {activity.actividad}
      </span>
    </div>
  </div>
);

export default Activity;
