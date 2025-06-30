import React from 'react';
import ModalActivity from './ModalActivity';

const DayDetailModal = ({ day, activities, notes, onToggleActivity, onSaveNotes, onClose, onCheckAll, onUncheckAll }) => {
  const [currentNotes, setCurrentNotes] = React.useState(notes);

  const handleSave = () => {
    onSaveNotes(day, currentNotes);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>×</button>
        <h2>Actividades para {day}</h2>
        <div className="modal-actions">
          <button className="modal-action-button" onClick={() => onCheckAll(day)}>Marcar todas</button>
          <button className="modal-action-button" onClick={() => onUncheckAll(day)}>Desmarcar todas</button>
        </div>
        <div className="modal-activities-container">
          {activities.length > 0 ? (
            activities.map(activity => (
              <ModalActivity
                key={activity.id}
                activity={activity}
                onToggle={onToggleActivity}
              />
            ))
          ) : (
            <p>No hay actividades para este día.</p>
          )}
        </div>
        <h3>Notas:</h3>
        <textarea
          className="modal-notes-textarea"
          value={currentNotes}
          onChange={(e) => setCurrentNotes(e.target.value)}
          placeholder="Añade tus notas aquí..."
        />
        <button className="modal-save-button" onClick={handleSave}>Guardar y Cerrar</button>
      </div>
    </div>
  );
};

export default DayDetailModal;
