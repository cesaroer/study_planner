import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaPlus, FaTrash, FaClipboardList, FaCopy, FaArrowLeft, FaCalendarAlt } from 'react-icons/fa';
import PlannerCell from './PlannerCell';
import PlannerAddModal from './PlannerAddModal';
import './WeeklyPlanner.css';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function WeeklyPlanner({
  plans,
  activePlanId,
  onSetActivePlan,
  onCreatePlan,
  onDeletePlan,
  onRenamePlan,
  onAddActivity,
  onDeleteActivity,
  onUpdateActivity,
  onCopyFromPlan,
}) {
  const [plannerView, setPlannerView] = useState('home');
  const [dragState, setDragState] = useState({ activityId: null, fromDay: null });
  const [dropTargetDay, setDropTargetDay] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalDefaultDay, setAddModalDefaultDay] = useState('Lunes');
  const [showCopyPicker, setShowCopyPicker] = useState(false);
  const [contextMenu, setContextMenu] = useState({ open: false, activityId: null, day: null, x: 0, y: 0 });
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);

  const activePlan = plans.find(p => p.id === activePlanId) || null;
  const copyablePlans = plans.filter(p => p.id !== activePlanId);
  const defaultPlan = plans.find(p => p.id === 'plan_default');
  const allCopyable = defaultPlan && !copyablePlans.some(p => p.id === 'plan_default')
    ? [defaultPlan, ...copyablePlans]
    : [...copyablePlans];

  const handleActivityDragStart = useCallback((activityId, fromDay) => {
    setDragState({ activityId, fromDay });
  }, []);

  const handleActivityDragEnd = useCallback(() => {
    setDragState({ activityId: null, fromDay: null });
    setDropTargetDay(null);
  }, []);

  const handleDragOverDay = useCallback((targetDay, event) => {
    if (!dragState.activityId) return;
    event.preventDefault();
    if (dragState.fromDay === targetDay) return;
    if (dropTargetDay !== targetDay) {
      setDropTargetDay(targetDay);
    }
  }, [dragState.activityId, dragState.fromDay, dropTargetDay]);

  const handleDragLeaveDay = useCallback((targetDay, event) => {
    if (!dragState.activityId) return;
    const related = event.relatedTarget;
    if (related && event.currentTarget.contains(related)) return;
    if (dropTargetDay === targetDay) {
      setDropTargetDay(null);
    }
  }, [dragState.activityId, dropTargetDay]);

  const handleDropOnDay = useCallback((targetDay, event) => {
    if (!dragState.activityId) return;
    event.preventDefault();
    const sourceDay = dragState.fromDay;
    if (sourceDay && sourceDay !== targetDay) {
      const activityToMove = activePlan?.activities[sourceDay]?.find(a => a.id === dragState.activityId);
      if (activityToMove) {
        onDeleteActivity(activePlanId, sourceDay, dragState.activityId);
        const movedActivity = { ...activityToMove, dia: targetDay };
        onAddActivity(activePlanId, movedActivity);
      }
    }
    setDragState({ activityId: null, fromDay: null });
    setDropTargetDay(null);
  }, [dragState, activePlan, activePlanId, onDeleteActivity, onAddActivity]);

  const handleOpenContextMenu = useCallback(({ activityId, day, x, y }) => {
    setContextMenu({ open: true, activityId, day, x, y });
    setShowMovePicker(false);
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ open: false, activityId: null, day: null, x: 0, y: 0 });
    setShowMovePicker(false);
  }, []);

  const contextMenuActivity = contextMenu.activityId && contextMenu.day
    ? activePlan?.activities[contextMenu.day]?.find(a => a.id === contextMenu.activityId) || null
    : null;

  const handleContextEdit = () => {
    if (!contextMenu.activityId || !contextMenu.day) return;
    handleCloseContextMenu();
    const activity = activePlan?.activities[contextMenu.day]?.find(a => a.id === contextMenu.activityId);
    if (!activity) return;

    const idsByDay = {};
    DAYS.forEach(day => {
      const dayActivities = activePlan?.activities[day] || [];
      if (day === contextMenu.day) {
        idsByDay[day] = contextMenu.activityId;
        return;
      }
      const match = dayActivities.find(a =>
        a.actividad === activity.actividad &&
        a.tipo === activity.tipo &&
        a.icono === activity.icono
      );
      if (match?.id) {
        idsByDay[day] = match.id;
      }
    });

    const selectedDays = DAYS.filter(day => Boolean(idsByDay[day]));

    setEditingActivity({
      ...activity,
      selectedDays: selectedDays.length > 0 ? selectedDays : [contextMenu.day],
      idsByDay,
      sourceIds: Object.values(idsByDay).filter(Boolean),
      originalActividad: activity.actividad || '',
      originalTipo: activity.tipo || '',
      originalIcono: activity.icono || '',
    });
    setAddModalDefaultDay(contextMenu.day);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = (updatedActivity) => {
    if (!editingActivity || !onUpdateActivity) return;
    const trimmedName = (updatedActivity.actividad || '').trim();
    if (!trimmedName) return;
    const desiredDays = Array.from(new Set((updatedActivity.selectedDays || [updatedActivity.dia]).filter(Boolean)));
    if (desiredDays.length === 0) return;

    const previousByDay = editingActivity.idsByDay || {};
    const sourceIds = new Set(Array.isArray(editingActivity.sourceIds) ? editingActivity.sourceIds : []);
    const currentByDay = {};

    DAYS.forEach(day => {
      const dayActivities = activePlan?.activities[day] || [];
      const bySourceId = dayActivities.find(a => sourceIds.has(a.id));
      if (bySourceId?.id) {
        currentByDay[day] = bySourceId.id;
        return;
      }

      const fallback = dayActivities.find(a =>
        a.actividad === editingActivity.originalActividad &&
        a.tipo === editingActivity.originalTipo &&
        a.icono === editingActivity.originalIcono
      );
      if (fallback?.id) {
        currentByDay[day] = fallback.id;
      }
    });

    const allKnownByDay = { ...previousByDay, ...currentByDay };
    const updates = [];
    const deleteIds = new Set();

    Object.entries(allKnownByDay).forEach(([day, activityId]) => {
      if (!desiredDays.includes(day)) {
        if (activityId) {
          deleteIds.add(`${day}::${activityId}`);
        }
      }
    });

    desiredDays.forEach(day => {
      const existingId = allKnownByDay[day];
      const dayActivities = activePlan?.activities[day] || [];
      dayActivities.forEach(activity => {
        if (!activity?.id || activity.id === existingId) return;
        const belongsToOriginalGroup =
          sourceIds.has(activity.id) ||
          (
            activity.actividad === editingActivity.originalActividad &&
            activity.tipo === editingActivity.originalTipo &&
            activity.icono === editingActivity.originalIcono
          );
        const belongsToTargetGroup =
          activity.actividad === trimmedName &&
          activity.tipo === updatedActivity.tipo &&
          activity.icono === updatedActivity.icono;

        if (belongsToOriginalGroup || belongsToTargetGroup) {
          deleteIds.add(`${day}::${activity.id}`);
        }
      });

      const nextActivityBase = {
        actividad: trimmedName,
        tipo: updatedActivity.tipo,
        icono: updatedActivity.icono,
        bloqueada: Boolean(updatedActivity.bloqueada),
        dia: day,
      };

      if (existingId) {
        updates.push({
          action: 'update',
          day,
          activityId: existingId,
          activity: nextActivityBase,
        });
      } else {
        updates.push({
          action: 'add',
          day,
          activity: {
            ...nextActivityBase,
            id: `plan-${day}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            completado: false,
            tags: [],
            targetMinutes: 0,
            spentMinutes: 0,
            pomodoroSessions: 0,
          }
        });
      }
    });

    deleteIds.forEach((key) => {
      const [day, activityId] = key.split('::');
      updates.push({ action: 'delete', day, activityId });
    });

    onUpdateActivity(activePlanId, updates);
    setIsEditModalOpen(false);
    setEditingActivity(null);
  };

  const handleContextMoveToDay = (targetDay) => {
    if (!contextMenuActivity || !contextMenu.day) return;
    const sourceDay = contextMenu.day;
    if (sourceDay === targetDay) return;
    onDeleteActivity(activePlanId, sourceDay, contextMenu.activityId);
    const movedActivity = { ...contextMenuActivity, dia: targetDay };
    onAddActivity(activePlanId, movedActivity);
    handleCloseContextMenu();
  };

  const handleContextDelete = () => {
    if (!contextMenuActivity || !contextMenu.day) return;
    const confirmed = window.confirm(`¿Eliminar "${contextMenuActivity.actividad}" de ${contextMenu.day}?`);
    if (confirmed) {
      onDeleteActivity(activePlanId, contextMenu.day, contextMenu.activityId);
    }
    handleCloseContextMenu();
  };

  const handleContextFreeze = () => {
    if (!contextMenuActivity || !contextMenu.day) return;
    onDeleteActivity(activePlanId, contextMenu.day, contextMenu.activityId);
    const updatedActivity = { ...contextMenuActivity, bloqueada: !Boolean(contextMenuActivity.bloqueada), dia: contextMenu.day };
    onAddActivity(activePlanId, updatedActivity);
    handleCloseContextMenu();
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.open) {
        handleCloseContextMenu();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.open, handleCloseContextMenu]);

  const handleAddClick = (day) => {
    setAddModalDefaultDay(day);
    setIsAddModalOpen(true);
  };

  const handleAddActivity = (activity) => {
    onAddActivity(activePlanId, activity);
  };

  const handleCreatePlan = () => {
    const newId = `plan_${Date.now()}`;
    const name = `Plan de estudios ${plans.length + 1}`;
    onCreatePlan(newId, name);
  };

  const handleCreateAndOpen = () => {
    const newId = `plan_${Date.now()}`;
    const name = `Plan de estudios ${plans.length + 1}`;
    onCreatePlan(newId, name);
    setPlannerView('editor');
  };

  const handleOpenPlan = (planId) => {
    onSetActivePlan(planId);
    setPlannerView('editor');
  };

  const handleCopyPlan = (sourcePlanId) => {
    if (onCopyFromPlan) {
      onCopyFromPlan(activePlanId, sourcePlanId);
    }
    setShowCopyPicker(false);
  };

  const getPlanActivityCount = (plan) => {
    return Object.values(plan.activities).reduce((sum, arr) => sum + (arr?.length || 0), 0);
  };

  if (plannerView === 'home') {
    return (
      <div className="planner-view">
        <div className="planner-home">
          <div className="planner-home-header">
            <h2 className="planner-home-title">Mis Planes</h2>
            <button className="planner-btn primary" type="button" onClick={handleCreateAndOpen}>
              <FaPlus /> Nuevo plan
            </button>
          </div>

          {plans.length === 0 ? (
            <div className="planner-empty-state">
              <span className="planner-empty-icon"><FaClipboardList /></span>
              <p>No hay planes de estudio</p>
              <button className="planner-btn primary" type="button" onClick={handleCreateAndOpen}>
                <FaPlus /> Crear plan de estudios
              </button>
            </div>
          ) : (
            <div className="planner-plans-grid">
              {plans.map(plan => {
                const isActive = plan.id === activePlanId;
                return (
                  <div
                    key={plan.id}
                    className={`planner-plan-card ${isActive ? 'active' : ''}`}
                    onClick={() => handleOpenPlan(plan.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleOpenPlan(plan.id)}
                  >
                    <div className="planner-plan-card-icon">
                      <FaCalendarAlt />
                    </div>
                    <div className="planner-plan-card-info">
                      <span className="planner-plan-card-name">{plan.name}</span>
                      <span className="planner-plan-card-count">
                        {getPlanActivityCount(plan)} actividades
                      </span>
                    </div>
                    <button
                      className={`planner-plan-switch ${isActive ? 'on' : ''}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetActivePlan(plan.id);
                      }}
                      title={isActive ? 'Desactivar' : 'Activar'}
                    >
                      <span className="planner-plan-switch-knob" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!activePlan) {
    setPlannerView('home');
    return null;
  }

  return (
    <div className="planner-view">
      <div className="planner-header">
        <div className="planner-header-left">
          <button
            className="planner-back-btn"
            type="button"
            onClick={() => setPlannerView('home')}
          >
            <FaArrowLeft />
          </button>
          <input
            className="planner-title-input"
            type="text"
            value={activePlan.name}
            onChange={(e) => onRenamePlan(activePlanId, e.target.value)}
          />
          {plans.length > 1 && (
            <select
              className="planner-plan-selector"
              value={activePlanId}
              onChange={(e) => onSetActivePlan(e.target.value)}
            >
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="planner-header-actions">
          <button className="planner-btn" type="button" onClick={handleCreatePlan}>
            <FaPlus /> Nuevo
          </button>
          {plans.length > 1 && activePlanId !== 'plan_default' && (
            <button
              className="planner-btn danger"
              type="button"
              onClick={() => onDeletePlan(activePlanId)}
            >
              <FaTrash /> Eliminar
            </button>
          )}
        </div>
      </div>

      <div className="planner-grid">
        {DAYS.map(day => (
          <PlannerCell
            key={day}
            day={day}
            activities={activePlan.activities[day] || []}
            onAddClick={handleAddClick}
            onDeleteActivity={(d, actId) => onDeleteActivity(activePlanId, d, actId)}
            onOpenContextMenu={handleOpenContextMenu}
            onDragStartActivity={handleActivityDragStart}
            onDragEndActivity={handleActivityDragEnd}
            onDropOnDay={handleDropOnDay}
            onDragOverDay={handleDragOverDay}
            onDragLeaveDay={handleDragLeaveDay}
            draggedActivityId={dragState.activityId}
            isDropTarget={dropTargetDay === day}
            isDragSource={dragState.fromDay === day}
          />
        ))}
      </div>

      {contextMenu.open && contextMenuActivity && typeof document !== 'undefined' && createPortal(
        <div
          className="activity-context-menu"
          role="menu"
          aria-label={`Acciones para ${contextMenuActivity.actividad}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleContextEdit}
          >
            Editar actividad
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (!contextMenu.day) return;
              const dayIndex = DAYS.indexOf(contextMenu.day);
              if (dayIndex < DAYS.length - 1) {
                handleContextMoveToDay(DAYS[dayIndex + 1]);
              }
            }}
            disabled={!contextMenu.day || DAYS.indexOf(contextMenu.day) === DAYS.length - 1}
          >
            Mover a mañana
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setShowMovePicker(prev => !prev)}
          >
            Mover a...
          </button>
          {showMovePicker && (
            <div className="activity-context-days" role="group" aria-label="Seleccionar día">
              {DAYS.map(d => (
                <button
                  key={d}
                  type="button"
                  className={`activity-context-day ${contextMenu.day === d ? 'is-current' : ''}`}
                  disabled={contextMenu.day === d}
                  onClick={() => handleContextMoveToDay(d)}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleContextFreeze}
          >
            {contextMenuActivity.bloqueada ? 'Descongelar actividad' : '❄️ Congelar por hoy'}
          </button>
          <div className="activity-context-divider" />
          <button
            type="button"
            role="menuitem"
            className="activity-context-danger"
            onClick={handleContextDelete}
          >
            Eliminar
          </button>
        </div>,
        document.body
      )}

      <div className="planner-footer">
        {allCopyable.length > 0 && (
          <div className="planner-copy-section">
            <button
              className="planner-btn"
              type="button"
              onClick={() => setShowCopyPicker(prev => !prev)}
            >
              <FaCopy /> Tomar existente
            </button>
            {showCopyPicker && (
              <div className="planner-copy-picker">
                <p className="planner-copy-picker-title">Copiar actividades de:</p>
                {allCopyable.map(plan => {
                  const totalActs = getPlanActivityCount(plan);
                  return (
                    <button
                      key={plan.id}
                      className="planner-copy-option"
                      type="button"
                      onClick={() => handleCopyPlan(plan.id)}
                    >
                      <span className="planner-copy-option-name">{plan.name}</span>
                      <span className="planner-copy-option-count">{totalActs} actividades</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <PlannerAddModal
          defaultDay={addModalDefaultDay}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddActivity}
        />
      )}

      {isEditModalOpen && editingActivity && (
        <PlannerAddModal
          isEditing
          editingActivity={editingActivity}
          defaultDay={addModalDefaultDay}
          activePlan={activePlan}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingActivity(null);
          }}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
