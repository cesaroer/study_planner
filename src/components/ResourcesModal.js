import React from 'react';
import { FaTimes } from 'react-icons/fa';
import ActivityResourceItem from './ActivityResourceItem';
import './ResourcesModal.css';

const ResourcesModal = ({ isOpen, onClose, activities, onAddActivity, theme }) => {
  if (!isOpen) return null;

  // Filtrar actividades para que sean únicas por nombre
  const uniqueActivities = activities.reduce((acc, current) => {
    if (!acc.some(item => item.actividad === current.actividad)) {
      acc.push(current);
    }
    return acc;
  }, []);

  return (
    <div className="modal-overlay">
      <div className={`modal-content ${theme === 'dark' ? 'dark-mode' : ''}`}>
        <button className="close-button" onClick={onClose}>
          <FaTimes />
        </button>
        <h2>Todos los Recursos</h2>
        <div className="activities-grid">
          {uniqueActivities.map(activity => (
            <ActivityResourceItem
              key={activity.id} 
              activity={activity}
            />
          ))}
        </div>
        <div className="add-activity-button-container">
            <button onClick={() => onAddActivity()}>Agregar Nueva Actividad</button>
        </div>
      </div>
    </div>
  );
};

export default ResourcesModal;
