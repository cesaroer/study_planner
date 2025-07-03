import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FaTimes, FaPlus, FaSave, FaSmile } from 'react-icons/fa';
import EmojiPicker from 'emoji-picker-react';
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

// Available activity types for the dropdown
const ACTIVITY_TYPES = [
  'Algoritmos',
  'Actividad Principal',
  'Secundaria',
  'Menor Prioridad',
  'Conocimiento Pasivo'
];

// Available emoji icons for activities
const EMOJI_ICONS = ['📱', '💻', '🌐', '⚡', '🤖', '🔄', '☁️', '⚙️', '📚', '🔧', '📊', '🌱'];

export default function SettingsModal({ isOpen, onClose, onLogout, onAddActivity, currentWeekActivities = [] }) {
  const [activitiesByType, setActivitiesByType] = useState({});
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const [newActivity, setNewActivity] = useState({
    actividad: '',
    tipo: 'Algoritmos',
    icono: '📱',
    dias: []
  });
  
  // Combine default activities with current week's activities
  const allActivities = useMemo(() => {
    const combined = { ...defaultActivities };
    
    // Add current week's activities
    currentWeekActivities.forEach(activity => {
      if (activity.dia && activity.actividad) {
        if (!combined[activity.dia]) {
          combined[activity.dia] = [];
        }
        // Only add if not already in the array (to avoid duplicates)
        if (!combined[activity.dia].some(a => a.id === activity.id)) {
          combined[activity.dia].push(activity);
        }
      }
    });
    
    return combined;
  }, [currentWeekActivities]);

  // Cerrar el selector de emojis al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setActivitiesByType(groupActivitiesByType(allActivities));
  }, [allActivities]);
  
  const handleEmojiClick = (emojiData) => {
    setNewActivity(prev => ({
      ...prev,
      icono: emojiData.emoji
    }));
    setShowEmojiPicker(false);
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewActivity(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleAddNewActivity = (e) => {
    e.preventDefault();
    if (newActivity.actividad.trim() && newActivity.dias.length > 0) {
      // Create the activity for each selected day
      const activitiesToAdd = [];
      
      newActivity.dias.forEach(day => {
        const activityToAdd = {
          ...newActivity,
          id: `custom-${day.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          completado: false
        };
        activitiesToAdd.push({ activity: activityToAdd, day });
      });
      
      // Add each activity and wait for state updates
      const addActivities = async () => {
        for (const { activity, day } of activitiesToAdd) {
          await new Promise(resolve => {
            if (onAddActivity) {
              onAddActivity(activity, day);
              // Small delay to ensure state updates
              setTimeout(resolve, 50);
            } else {
              resolve();
            }
          });
        }
        
        // Reset form after all activities are added
        setNewActivity({
          actividad: '',
          tipo: 'Algoritmos',
          icono: '📱',
          dias: []
        });
        setIsAddingActivity(false);
      };
      
      addActivities();
    }
  };
  
  const toggleDay = (day) => {
    setNewActivity(prev => {
      const dias = [...prev.dias];
      const index = dias.indexOf(day);
      
      if (index > -1) {
        dias.splice(index, 1);
      } else {
        dias.push(day);
      }
      
      return { ...prev, dias };
    });
  };
  
  const isDaySelected = (day) => {
    return newActivity.dias.includes(day);
  };
  
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
          <div className="settings-actions">
            {!isAddingActivity ? (
              <button 
                className="add-activity-button"
                onClick={() => setIsAddingActivity(true)}
              >
                <FaPlus /> Agregar Actividad
              </button>
            ) : (
              <div className="add-activity-form">
                <form onSubmit={handleAddNewActivity}>
                  <div className="form-group">
                    <input
                      type="text"
                      name="actividad"
                      value={newActivity.actividad}
                      onChange={handleInputChange}
                      placeholder="Nombre de la actividad"
                      className="activity-input"
                      autoFocus
                    />
                    
                    <select
                      name="tipo"
                      value={newActivity.tipo}
                      onChange={handleInputChange}
                      className="activity-select"
                    >
                      {ACTIVITY_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                    
                    <div className="icon-input-container" ref={emojiPickerRef}>
                      <div 
                        className="emoji-picker-trigger"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      >
                        <span className="icon-preview">{newActivity.icono}</span>
                        <FaSmile className="emoji-icon" />
                      </div>
                      
                      {showEmojiPicker && (
                        <div className="emoji-picker-container">
                          <EmojiPicker
                            onEmojiClick={handleEmojiClick}
                            autoFocusSearch={false}
                            width="100%"
                            height={300}
                            searchPlaceholder="Buscar emoji..."
                            skinTonesDisabled
                            previewConfig={{
                              showPreview: false
                            }}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="days-selection">
                      <label>Días de la semana:</label>
                      <div className="days-grid">
                        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => (
                          <button
                            key={day}
                            type="button"
                            className={`day-button ${isDaySelected(day) ? 'selected' : ''}`}
                            onClick={() => toggleDay(day)}
                          >
                            {day.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="form-actions">
                      <button 
                        type="submit" 
                        className="save-button"
                        disabled={!newActivity.actividad.trim() || newActivity.dias.length === 0}
                        title={newActivity.dias.length === 0 ? 'Selecciona al menos un día' : 'Guardar actividad'}
                      >
                        <FaSave /> Guardar
                      </button>
                      <button 
                        className="cancel-button"
                        onClick={() => setIsAddingActivity(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
          
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
