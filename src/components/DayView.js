import React from 'react';
import Activity from './Activity';

export const getWeekNumber = (date) => {
  const oneJan = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
};

const DayView = ({ day, activities, onToggle, onDayClick }) => (
  <div className="day-view" onClick={onDayClick}>
    <h3>{day}</h3>
    <div className="activities-container">
      {activities.map(activity => (
        <Activity 
          key={activity.id} 
          activity={activity} 
          onToggle={onToggle} 
        >
          <li>
            <input 
              type="checkbox" 
              checked={activity.completado} 
              onChange={() => onToggle(activity.id)} 
            />
            <div className="activity-content">
              <div className="activity-top">
                {activity.icono && <span className="activity-icon" style={{ fontSize: '1.5em', marginRight: '8px' }}>{activity.icono}</span>}
                <span className="tag">{activity.tipo}</span>
              </div>
              <span className={activity.completado ? 'completed' : ''}>
                {activity.actividad}
              </span>
            </div>
          </li>
        </Activity>
      ))}
    </div>
  </div>
);

export default DayView;
