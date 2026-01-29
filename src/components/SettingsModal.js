import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FaTimes, FaPlus, FaSave, FaSmile, FaTrash, FaEdit } from 'react-icons/fa';
import EmojiPicker from 'emoji-picker-react';
import './SettingsModal.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Group activities by their type and collect days/ids
const groupActivitiesByType = (activities) => {
  const grouped = {};
  const groupMap = new Map();

  activities.forEach(activity => {
    if (!activity || !activity.tipo || !activity.actividad) return;
    const uniqueKey = `${activity.tipo}::${activity.actividad}::${activity.icono || ''}`;
    if (!groupMap.has(uniqueKey)) {
      groupMap.set(uniqueKey, {
        key: uniqueKey,
        actividad: activity.actividad,
        tipo: activity.tipo,
        icono: activity.icono || '📱',
        bloqueada: false,
        dias: new Set(),
        idsByDay: {},
        blockedByDay: {}
      });
    }
    const group = groupMap.get(uniqueKey);
    if (activity.dia) {
      group.dias.add(activity.dia);
      if (activity.id) {
        group.idsByDay[activity.dia] = activity.id;
      }
      const isBlocked = Boolean(activity.bloqueada);
      group.blockedByDay[activity.dia] = isBlocked;
      if (isBlocked) group.bloqueada = true;
    }
  });

  groupMap.forEach(group => {
    const orderedDays = DAYS.filter(day => group.dias.has(day));
    const entry = {
      ...group,
      dias: orderedDays
    };
    if (!grouped[group.tipo]) {
      grouped[group.tipo] = [];
    }
    grouped[group.tipo].push(entry);
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

export default function SettingsModal({ isOpen, onClose, onLogout, onAddActivity, onUpdateActivity, onDeleteActivity, currentWeekActivities = [] }) {
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  const editEmojiPickerRef = useRef(null);
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [editEmojiPickerId, setEditEmojiPickerId] = useState(null);
  const [newActivity, setNewActivity] = useState({
    actividad: '',
    tipo: 'Algoritmos',
    icono: '📱',
    dias: []
  });
  
  const activitiesByType = useMemo(() => {
    return groupActivitiesByType(currentWeekActivities);
  }, [currentWeekActivities]);

  // Cerrar el selector de emojis al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
      if (editEmojiPickerRef.current && !editEmojiPickerRef.current.contains(event.target)) {
        setEditEmojiPickerId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    setEditingActivity(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEditEmojiClick = (emojiData) => {
    setEditingActivity(prev => ({
      ...prev,
      icono: emojiData.emoji
    }));
    setEditEmojiPickerId(null);
  };

  const handleEditBlockedToggle = (e) => {
    const checked = e.target.checked;
    setEditingActivity(prev => ({
      ...prev,
      bloqueada: checked
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

  const handleStartEdit = (activity) => {
    setEditingActivityId(activity.key);
    setEditingActivity({
      key: activity.key,
      actividad: activity.actividad || '',
      tipo: activity.tipo || 'Algoritmos',
      icono: activity.icono || '📱',
      dias: Array.isArray(activity.dias) ? activity.dias : [],
      idsByDay: activity.idsByDay || {},
      bloqueada: Boolean(activity.bloqueada)
    });
  };

  const handleCancelEdit = () => {
    setEditingActivityId(null);
    setEditingActivity(null);
    setEditEmojiPickerId(null);
  };

  const handleSaveEdit = () => {
    if (!editingActivity || !editingActivity.actividad.trim()) return;
    const desiredDays = editingActivity.dias || [];
    if (desiredDays.length === 0) return;

    const updates = {
      actividad: editingActivity.actividad.trim(),
      tipo: editingActivity.tipo,
      icono: editingActivity.icono,
      bloqueada: Boolean(editingActivity.bloqueada)
    };

    const existingByDay = editingActivity.idsByDay || {};
    const existingDays = Object.keys(existingByDay);

    if (onUpdateActivity) {
      desiredDays.forEach(day => {
        const existingId = existingByDay[day];
        if (existingId) {
          onUpdateActivity(existingId, { ...updates, dia: day });
        } else if (onAddActivity) {
          onAddActivity({ ...updates, completado: false }, day);
        }
      });
    }

    if (onDeleteActivity) {
      existingDays.forEach(day => {
        if (!desiredDays.includes(day)) {
          onDeleteActivity(existingByDay[day]);
        }
      });
    }

    handleCancelEdit();
  };

  const handleDeleteActivity = (activityGroup) => {
    if (!onDeleteActivity) return;
    const confirmed = window.confirm('¿Seguro que quieres eliminar esta actividad?');
    if (confirmed) {
      const idsToDelete = activityGroup?.idsByDay ? Object.values(activityGroup.idsByDay) : [];
      idsToDelete.forEach(id => onDeleteActivity(id));
      if (editingActivityId === activityGroup?.key) {
        handleCancelEdit();
      }
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

  const toggleEditDay = (day) => {
    setEditingActivity(prev => {
      if (!prev) return prev;
      const dias = Array.isArray(prev.dias) ? [...prev.dias] : [];
      const index = dias.indexOf(day);
      if (index > -1) {
        dias.splice(index, 1);
      } else {
        dias.push(day);
      }
      return { ...prev, dias };
    });
  };

  const isEditDaySelected = (day) => {
    return editingActivity?.dias?.includes(day);
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
                        {DAYS.map(day => (
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
                {activities.map(activity => {
                  const isEditing = editingActivityId === activity.key;
                  return (
                    <div key={activity.key} className={`activity-card ${isEditing ? 'is-editing' : ''}`}>
                      {isEditing ? (
                        <div className="activity-edit-form">
                          <input
                            type="text"
                            name="actividad"
                            value={editingActivity?.actividad || ''}
                            onChange={handleEditInputChange}
                            className="activity-input"
                            placeholder="Nombre de la actividad"
                          />
                          <select
                            name="tipo"
                            value={editingActivity?.tipo || 'Algoritmos'}
                            onChange={handleEditInputChange}
                            className="activity-select"
                          >
                            {ACTIVITY_TYPES.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                          <div className="days-selection">
                            <label>Días de la semana:</label>
                            <div className="days-grid">
                              {DAYS.map(day => (
                                <button
                                  key={day}
                                  type="button"
                                  className={`day-button ${isEditDaySelected(day) ? 'selected' : ''}`}
                                  onClick={() => toggleEditDay(day)}
                                >
                                  {day.substring(0, 3)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <label className="block-toggle">
                            <input
                              type="checkbox"
                              checked={Boolean(editingActivity?.bloqueada)}
                              onChange={handleEditBlockedToggle}
                            />
                            <span>Bloquear (no cuenta)</span>
                          </label>
                          <div className="icon-input-container" ref={editEmojiPickerRef}>
                            <div
                              className="emoji-picker-trigger"
                              onClick={() => setEditEmojiPickerId(activity.key)}
                            >
                              <span className="icon-preview">{editingActivity?.icono || '📱'}</span>
                              <FaSmile className="emoji-icon" />
                            </div>
                            {editEmojiPickerId === activity.key && (
                              <div className="emoji-picker-container">
                                <EmojiPicker
                                  onEmojiClick={handleEditEmojiClick}
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
                          <div className="activity-actions edit-actions">
                            <button
                              className="activity-action-button save"
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={!editingActivity?.actividad?.trim() || !editingActivity?.dias?.length}
                            >
                              <FaSave />
                            </button>
                            <button
                              className="activity-action-button cancel"
                              type="button"
                              onClick={handleCancelEdit}
                            >
                              <FaTimes />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="activity-icon">{activity.icono}</span>
                          <span className="activity-name">{activity.actividad}</span>
                          <div className="activity-actions">
                            <button
                              className="activity-action-button edit"
                              type="button"
                              onClick={() => handleStartEdit(activity)}
                              title="Editar actividad"
                            >
                              <FaEdit />
                            </button>
                            <button
                              className="activity-action-button delete"
                              type="button"
                              onClick={() => handleDeleteActivity(activity)}
                              title="Eliminar actividad"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
