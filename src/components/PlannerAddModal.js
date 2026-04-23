import React, { useState, useRef, useEffect } from 'react';
import EmojiPicker from 'emoji-picker-react';

const TYPE_ICON_MAP = {
  'Algoritmos': '🧠',
  'Actividad Principal': '📌',
  'Secundaria': '🧩',
  'Menor Prioridad': '🪶',
  'Conocimiento Pasivo': '📘',
};
const ACTIVITY_TYPES = Object.keys(TYPE_ICON_MAP);
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function PlannerAddModal({ onClose, onAdd, defaultDay, isEditing, editingActivity, onSave, activePlan }) {
  const [form, setForm] = useState({
    actividad: '',
    tipo: ACTIVITY_TYPES[0],
    icono: TYPE_ICON_MAP[ACTIVITY_TYPES[0]],
    selectedDays: defaultDay ? [defaultDay] : ['Lunes'],
  });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiRef = useRef(null);

  useEffect(() => {
    if (isEditing && editingActivity) {
      const allDays = DAYS.filter(d =>
        activePlan?.activities[d]?.some(a =>
          a.actividad === editingActivity.actividad &&
          a.tipo === editingActivity.tipo &&
          a.icono === editingActivity.icono
        )
      );
      setForm({
        actividad: editingActivity.actividad || '',
        tipo: editingActivity.tipo || ACTIVITY_TYPES[0],
        icono: editingActivity.icono || '📝',
        selectedDays: allDays.length > 0 ? allDays : [editingActivity.dia],
      });
    } else if (!isEditing) {
      setForm({
        actividad: '',
        tipo: ACTIVITY_TYPES[0],
        icono: TYPE_ICON_MAP[ACTIVITY_TYPES[0]],
        selectedDays: defaultDay ? [defaultDay] : ['Lunes'],
      });
    }
  }, [isEditing, editingActivity, defaultDay, activePlan]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.actividad.trim()) return;

    if (isEditing && editingActivity) {
      onSave({
        ...editingActivity,
        actividad: form.actividad.trim(),
        tipo: form.tipo,
        icono: form.icono,
        selectedDays: form.selectedDays,
        dia: form.selectedDays[0] || editingActivity.dia,
      });
      onClose();
      return;
    }

    form.selectedDays.forEach(day => {
      onAdd({
        id: `plan-${day}-${form.actividad.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        actividad: form.actividad.trim(),
        tipo: form.tipo,
        icono: form.icono,
        dia: day,
        completado: false,
        bloqueada: false,
        tags: [],
        targetMinutes: 0,
        spentMinutes: 0,
        pomodoroSessions: 0,
      });
    });

    onClose();
  };

  const toggleDay = (day) => {
    setForm(prev => ({
      ...prev,
      selectedDays: prev.selectedDays.includes(day)
        ? prev.selectedDays.filter(d => d !== day)
        : [...prev.selectedDays, day],
    }));
  };

  return (
    <div className="planner-add-overlay" onClick={onClose}>
      <div className="planner-add-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isEditing ? 'Editar actividad' : 'Agregar actividad'}</h3>

        <form onSubmit={handleSubmit}>
          <div className="planner-form-group">
            <label className="planner-form-label">Nombre</label>
            <input
              className="planner-form-input"
              type="text"
              value={form.actividad}
              onChange={(e) => setForm(prev => ({ ...prev, actividad: e.target.value }))}
              placeholder="Ej: LeetCode - Python"
              autoFocus
            />
          </div>

          <div className="planner-form-group">
            <label className="planner-form-label">Tipo</label>
            <select
              className="planner-form-select"
              value={form.tipo}
              onChange={(e) => setForm(prev => ({
                ...prev,
                tipo: e.target.value,
                ...(isEditing ? {} : { icono: TYPE_ICON_MAP[e.target.value] || prev.icono }),
              }))}
            >
              {ACTIVITY_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="planner-form-group" ref={emojiRef}>
            <label className="planner-form-label">Icono</label>
            <button
              type="button"
              className="planner-emoji-trigger"
              onClick={() => setShowEmojiPicker(prev => !prev)}
            >
              <span className="planner-emoji-trigger-icon">{form.icono}</span>
              <span className="planner-emoji-trigger-label">Seleccionar icono</span>
            </button>
            {showEmojiPicker && (
              <div className="planner-emoji-picker-wrapper">
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    setForm(prev => ({ ...prev, icono: emojiData.emoji }));
                    setShowEmojiPicker(false);
                  }}
                  width="100%"
                  height={300}
                  searchDisabled={false}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis
                />
              </div>
            )}
          </div>

          <div className="planner-form-group">
            <label className="planner-form-label">Días</label>
            <div className="planner-days-checkboxes">
              {DAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  className={`planner-day-checkbox ${form.selectedDays.includes(day) ? 'selected' : ''}`}
                  onClick={() => toggleDay(day)}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="planner-form-actions">
            <button type="button" className="planner-btn" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="planner-btn primary"
              disabled={!form.actividad.trim() || form.selectedDays.length === 0}
            >
              {isEditing ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
