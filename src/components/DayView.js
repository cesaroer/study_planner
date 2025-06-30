import React from 'react';
import Activity from './Activity';

// Returns the ISO 8601 week number for the given date
// Based on https://weeknumber.com/how-to/javascript
export const getWeekNumber = (date) => {
  // Create a copy of the date to avoid modifying the original
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to the nearest Thursday (current date + 4 - current day number)
  // Make Sunday's day number 7 instead of 0
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  // Get the first day of the year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate the week number: 1 + (days since year start / 7)
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};

const DayView = ({ day, dayNumber, activities, onToggle, onDayClick, isToday = false }) => (
  <div className={`day-view ${isToday ? 'today' : ''}`} onClick={onDayClick}>
    <h3>{day} <span className="day-number">{dayNumber}</span></h3>
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
