import React, { useMemo } from 'react';
import { FaTimes } from 'react-icons/fa';
import './SettingsModal.css';
import { defaultActivities } from '../data/defaultActivities';

// Group activities by their type
const groupActivitiesByType = (activities) => {
  const grouped = {};
  
  // Process each day's activities
  Object.values(activities).forEach(dayActivities => {
    dayActivities.forEach(activity => {
      if (!grouped[activity.tipo]) {
        grouped[activity.tipo] = [];
      }
      // Only add if not already in the array (to avoid duplicates)
      if (!grouped[activity.tipo].some(a => a.actividad === activity.actividad)) {
        grouped[activity.tipo].push(activity);
      }
    });
  });
  
  return grouped;
};

export default function SettingsModal({ isOpen, onClose, onLogout }) {
  const activitiesByType = useMemo(() => groupActivitiesByType(defaultActivities), []);
  
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configuración</h2>
          <button className="modal-close-button" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        
        <div className="settings-content">
          {Object.entries(activitiesByType).map(([type, activities]) => (
            <div key={type} className="activity-type-section">
              <h3 className="activity-type-title">{type}</h3>
              <div className="activity-grid">
                {activities.map(activity => (
                  <div key={activity.id} className="activity-card">
                    <span className="activity-icon">{activity.icono}</span>
                    <span className="activity-name">{activity.actividad}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
