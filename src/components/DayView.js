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

const DayView = ({ day, dayNumber, activities, onToggle, onDayClick, isToday = false, isPast = false }) => {
  const handleDayClick = (e) => {
    // Only trigger day click if the click is on the day header or empty space
    if (e.target.closest('.day-view > h3') || e.target === e.currentTarget) {
      onDayClick();
    }
  };

  return (
    <div 
      className={`day-view ${isToday ? 'today' : ''} ${isPast ? 'past-day' : ''}`} 
      onClick={handleDayClick}
    >
      <h3>{day} <span className="day-number">{dayNumber}</span></h3>
      <div className="activities-container" onClick={(e) => e.stopPropagation()}>
        {activities.map(activity => (
          <Activity 
            key={activity.id} 
            activity={activity} 
            onToggle={onToggle} 
          />
        ))}
      </div>
    </div>
  );
};

export default DayView;
