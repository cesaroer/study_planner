import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FaCalendarAlt,
  FaCheck,
  FaPlus,
  FaTimes
} from 'react-icons/fa';
import './TodoListView.css';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' }
];

const KANBAN_SORT_OPTIONS = [
  { value: 'manual', label: 'Orden manual' },
  { value: 'updatedAt', label: 'Última actualización' },
  { value: 'createdAt', label: 'Fecha de creación' },
  { value: 'dueDate', label: 'Fecha límite' },
  { value: 'priority', label: 'Prioridad' }
];

const EMPTY_DROP_HINT = { status: null, cardId: null };

const formatDueDate = (rawDate) => {
  if (!rawDate) return '';
  const parsedDate = new Date(rawDate);
  if (Number.isNaN(parsedDate.getTime())) return '';
  return parsedDate.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short'
  });
};

function TodoListView({
  todos = [],
  todoInput = '',
  onTodoInputChange,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  remainingCount = 0,
  totalCount = 0,
  quote = '',
  todoViewMode = 'list',
  onTodoViewModeChange,
  kanbanFilter = { query: '', status: 'all', priority: 'all', tag: '' },
  onKanbanFilterChange,
  kanbanSort = 'manual',
  onKanbanSortChange,
  kanbanStatuses = [],
  kanbanColumns = {},
  kanbanContextNotice = '',
  onCreateKanbanTodo,
  onMoveKanbanTodo,
  onOpenKanbanEdit,
  isKanbanEditOpen = false,
  selectedKanbanTodoId = null,
  kanbanEditDraft = {
    text: '',
    description: '',
    priority: 'medium',
    tagsInput: '',
    dueDate: '',
    status: 'todo'
  },
  onKanbanEditDraftChange,
  onKanbanEditTagsChange,
  onSaveKanbanEdit,
  onCloseKanbanEdit,
  onDeleteKanbanTodo
}) {
  const [draggedCard, setDraggedCard] = useState(null);
  const [dropHint, setDropHint] = useState(EMPTY_DROP_HINT);
  const [kanbanContextMenu, setKanbanContextMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    card: null
  });

  const closeKanbanContextMenu = useCallback(() => {
    setKanbanContextMenu({
      open: false,
      x: 0,
      y: 0,
      card: null
    });
  }, []);

  const availableTags = useMemo(() => {
    const tags = new Set();
    Object.values(kanbanColumns || {}).flat().forEach(card => {
      if (!Array.isArray(card?.tags)) return;
      card.tags.forEach(tag => {
        const normalizedTag = String(tag || '').trim();
        if (normalizedTag) tags.add(normalizedTag);
      });
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [kanbanColumns]);

  useEffect(() => {
    if (!isKanbanEditOpen) return undefined;

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        onCloseKanbanEdit?.();
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isKanbanEditOpen, onCloseKanbanEdit]);

  useEffect(() => {
    if (!kanbanContextMenu.open) return undefined;

    const onPointerDown = () => {
      closeKanbanContextMenu();
    };
    const onEscape = (event) => {
      if (event.key === 'Escape') {
        closeKanbanContextMenu();
      }
    };
    const onScroll = () => {
      closeKanbanContextMenu();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [kanbanContextMenu.open, closeKanbanContextMenu]);

  const updateKanbanDraft = (event) => {
    onKanbanEditDraftChange?.({
      name: event.target.name,
      value: event.target.value
    });
  };

  const clearKanbanFilters = () => {
    onKanbanFilterChange?.({
      query: '',
      status: 'all',
      priority: 'all',
      tag: ''
    });
  };

  const resetDragState = () => {
    setDraggedCard(null);
    setDropHint(EMPTY_DROP_HINT);
  };

  const openKanbanContextMenu = (event, card) => {
    event.preventDefault();
    event.stopPropagation();
    if (!card) return;

    const menuWidth = 228;
    const menuHeight = 280;
    const padding = 10;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const clampedX = Math.min(
      Math.max(padding, event.clientX),
      Math.max(padding, viewportWidth - menuWidth - padding)
    );
    const clampedY = Math.min(
      Math.max(padding, event.clientY),
      Math.max(padding, viewportHeight - menuHeight - padding)
    );

    setKanbanContextMenu({
      open: true,
      x: clampedX,
      y: clampedY,
      card
    });
  };

  const handleCardDragStart = (event, card) => {
    closeKanbanContextMenu();
    setDraggedCard({
      id: card.id,
      source: card.source,
      sourceId: card.sourceId
    });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(card.id));
  };

  const handleColumnDragOver = (event, statusKey) => {
    if (!draggedCard) return;
    event.preventDefault();
    if (dropHint.status !== statusKey || dropHint.cardId !== null) {
      setDropHint({ status: statusKey, cardId: null });
    }
  };

  const handleCardDragOver = (event, statusKey, targetCardId) => {
    if (!draggedCard || draggedCard.id === targetCardId) return;
    event.preventDefault();
    if (dropHint.status !== statusKey || dropHint.cardId !== targetCardId) {
      setDropHint({ status: statusKey, cardId: targetCardId });
    }
  };

  const handleDropOnColumn = (event, statusKey) => {
    if (!draggedCard) return;
    event.preventDefault();
    onMoveKanbanTodo?.({
      source: draggedCard.source,
      sourceId: draggedCard.sourceId,
      targetStatus: statusKey,
      targetCardId: null
    });
    resetDragState();
  };

  const handleDropOnCard = (event, statusKey, targetCardId) => {
    if (!draggedCard || draggedCard.id === targetCardId) return;
    event.preventDefault();
    onMoveKanbanTodo?.({
      source: draggedCard.source,
      sourceId: draggedCard.sourceId,
      targetStatus: statusKey,
      targetCardId
    });
    resetDragState();
  };

  const contextMenuCard = kanbanContextMenu.card;
  const isContextGlobalCard = contextMenuCard?.source === 'global';
  const contextMoveOptions = contextMenuCard
    ? kanbanStatuses.filter(status => status.key !== contextMenuCard.status)
    : [];

  const handleContextMove = (targetStatus) => {
    if (!contextMenuCard) return;
    onMoveKanbanTodo?.({
      source: contextMenuCard.source,
      sourceId: contextMenuCard.sourceId,
      targetStatus,
      targetCardId: null
    });
    closeKanbanContextMenu();
  };

  const handleContextEdit = () => {
    if (!contextMenuCard || contextMenuCard.source !== 'global') return;
    onOpenKanbanEdit?.(contextMenuCard);
    closeKanbanContextMenu();
  };

  const handleContextDelete = () => {
    if (!contextMenuCard || contextMenuCard.source !== 'global') return;
    const confirmed = window.confirm(`¿Eliminar "${contextMenuCard.text}"?`);
    if (!confirmed) return;
    onDeleteTodo?.(contextMenuCard.sourceId);
    closeKanbanContextMenu();
  };

  const kanbanContextMenuPortal = kanbanContextMenu.open && contextMenuCard && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="todo-kanban-context-menu"
          style={{ top: kanbanContextMenu.y, left: kanbanContextMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="todo-kanban-context-title">
            <strong>{contextMenuCard.text}</strong>
            <span>{contextMenuCard.source === 'activity' ? 'Actividad' : 'Global'}</span>
          </div>

          {isContextGlobalCard && (
            <button type="button" onClick={handleContextEdit}>
              Editar
            </button>
          )}

          {contextMoveOptions.map(status => (
            <button
              key={`${contextMenuCard.id}-${status.key}`}
              type="button"
              onClick={() => handleContextMove(status.key)}
            >
              Mover a {status.label}
            </button>
          ))}

          {isContextGlobalCard && (
            <>
              <div className="todo-kanban-context-divider" />
              <button type="button" className="is-danger" onClick={handleContextDelete}>
                Eliminar
              </button>
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <section className="todo-list-view" aria-label="Todo list">
      <div className="todo-list-shell">
        <header className="todo-list-topbar">
          <div className="todo-list-title-wrap">
            <h1>Todo / List</h1>
            <p>Organiza rápido tus tareas personales y el flujo del día.</p>
          </div>

          <div className="todo-view-tabs" role="tablist" aria-label="Tipo de vista de TODOs">
            <button
              type="button"
              role="tab"
              aria-selected={todoViewMode === 'list'}
              className={`todo-view-tab ${todoViewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => onTodoViewModeChange?.('list')}
            >
              Lista
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={todoViewMode === 'kanban'}
              className={`todo-view-tab ${todoViewMode === 'kanban' ? 'is-active' : ''}`}
              onClick={() => onTodoViewModeChange?.('kanban')}
            >
              Kanban
            </button>
          </div>
        </header>

        {todoViewMode === 'kanban' ? (
          <div className="todo-kanban-shell">
            <div className="todo-kanban-toolbar">
              <input
                type="text"
                placeholder="Filtrar por texto..."
                value={kanbanFilter.query}
                onChange={(event) => onKanbanFilterChange?.({ query: event.target.value })}
              />

              <select
                value={kanbanFilter.status}
                onChange={(event) => onKanbanFilterChange?.({ status: event.target.value })}
              >
                <option value="all">Todos los estados</option>
                {kanbanStatuses.map(status => (
                  <option key={status.key} value={status.key}>{status.label}</option>
                ))}
              </select>

              <select
                value={kanbanFilter.priority}
                onChange={(event) => onKanbanFilterChange?.({ priority: event.target.value })}
              >
                <option value="all">Todas las prioridades</option>
                {PRIORITY_OPTIONS.map(priority => (
                  <option key={priority.value} value={priority.value}>{priority.label}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Tag..."
                value={kanbanFilter.tag}
                onChange={(event) => onKanbanFilterChange?.({ tag: event.target.value })}
                list="kanban-tag-suggestions"
              />

              <select
                value={kanbanSort}
                onChange={(event) => onKanbanSortChange?.(event.target.value)}
              >
                {KANBAN_SORT_OPTIONS.map(sortOption => (
                  <option key={sortOption.value} value={sortOption.value}>{sortOption.label}</option>
                ))}
              </select>

              <button type="button" className="todo-kanban-clear" onClick={clearKanbanFilters}>
                Limpiar
              </button>
            </div>

            {kanbanContextNotice ? (
              <p className="todo-kanban-context-notice">{kanbanContextNotice}</p>
            ) : null}

            <datalist id="kanban-tag-suggestions">
              {availableTags.map(tag => (
                <option key={tag} value={tag} />
              ))}
            </datalist>

            <div className="todo-kanban-board" aria-label="Kanban board">
              {kanbanStatuses.map(status => {
                const columnCards = Array.isArray(kanbanColumns?.[status.key]) ? kanbanColumns[status.key] : [];
                const isColumnDropTarget = dropHint.status === status.key && dropHint.cardId === null;

                return (
                  <article className="todo-kanban-column" key={status.key}>
                    <header className="todo-kanban-column-header">
                      <h3>{status.label}</h3>
                      <span>{columnCards.length}</span>
                      <button
                        type="button"
                        className="todo-kanban-add"
                        aria-label={`Agregar tarea a ${status.label}`}
                        onClick={() => onCreateKanbanTodo?.(status.key)}
                      >
                        <FaPlus />
                      </button>
                    </header>

                    <div
                      className={`todo-kanban-column-body ${isColumnDropTarget ? 'is-drop-target' : ''}`}
                      onDragOver={(event) => handleColumnDragOver(event, status.key)}
                      onDrop={(event) => handleDropOnColumn(event, status.key)}
                    >
                      {columnCards.length === 0 ? (
                        <p className="todo-kanban-empty-column">Sin tareas por ahora.</p>
                      ) : (
                        columnCards.map(card => {
                          const isDraggedCard = draggedCard?.id === card.id;
                          const isDropTarget = dropHint.status === status.key && dropHint.cardId === card.id;
                          const cardTags = Array.isArray(card.tags) ? card.tags : [];
                          const isEditableGlobalCard = card.source === 'global';

                          return (
                            <article
                              key={card.id}
                              className={[
                                'todo-kanban-card',
                                isDraggedCard ? 'is-dragging' : '',
                                isDropTarget ? 'is-drop-target' : '',
                                isEditableGlobalCard && selectedKanbanTodoId === card.sourceId ? 'is-selected' : '',
                                card.source === 'activity' ? 'is-activity-card' : 'is-global-card'
                              ].filter(Boolean).join(' ')}
                              draggable
                              onDragStart={(event) => handleCardDragStart(event, card)}
                              onDragEnd={resetDragState}
                              onDragOver={(event) => handleCardDragOver(event, status.key, card.id)}
                              onDrop={(event) => handleDropOnCard(event, status.key, card.id)}
                              onContextMenu={(event) => openKanbanContextMenu(event, card)}
                              onClick={() => {
                                closeKanbanContextMenu();
                                if (isEditableGlobalCard) {
                                  onOpenKanbanEdit?.(card);
                                }
                              }}
                            >
                              <div className="todo-kanban-card-badges">
                                <span className={`todo-kanban-source-badge is-${card.source}`}>
                                  {card.source === 'activity' ? 'Actividad' : 'Global'}
                                </span>
                                {card.source === 'activity' && card.activityType ? (
                                  <span className="todo-kanban-type-badge">{card.activityType}</span>
                                ) : null}
                              </div>

                              <div className="todo-kanban-card-head">
                                <h4>
                                  {card.source === 'activity' && card.icono ? `${card.icono} ` : ''}
                                  {card.text}
                                </h4>
                                <span
                                  className={`todo-kanban-priority-dot is-${card.priority || 'medium'}`}
                                  title={`Prioridad ${card.priority || 'medium'}`}
                                />
                              </div>

                              {card.description && (
                                <p className="todo-kanban-card-description">{card.description}</p>
                              )}

                              <footer className="todo-kanban-card-footer">
                                <div className="todo-kanban-tags">
                                  {cardTags.slice(0, 2).map(tag => (
                                    <span key={`${card.id}-${tag}`} className="todo-kanban-tag">
                                      {tag}
                                    </span>
                                  ))}
                                  {cardTags.length > 2 && (
                                    <span className="todo-kanban-tag">+{cardTags.length - 2}</span>
                                  )}
                                </div>

                                {card.dueDate && (
                                  <span className="todo-kanban-due">
                                    <FaCalendarAlt />
                                    {formatDueDate(card.dueDate)}
                                  </span>
                                )}
                              </footer>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="todo-list-content-grid is-list-only">
            <article className="todo-list-main-card is-list-only">
              <header className="todo-list-main-header">
                <h2>Todo global</h2>
                <p>Captura tareas rápidas de tu día sin salir del dashboard.</p>
              </header>

              <form className="todo-list-input-row" onSubmit={onAddTodo}>
                <input
                  type="text"
                  placeholder="Agregar nueva tarea..."
                  value={todoInput}
                  onChange={onTodoInputChange}
                />
                <button type="submit" aria-label="Agregar tarea">
                  <FaPlus />
                </button>
              </form>

              <div className="todo-list-items">
                {todos.length === 0 ? (
                  <p className="todo-list-empty">Todavía no tienes tareas globales.</p>
                ) : (
                  <ul>
                    {todos.map(todo => (
                      <li key={todo.id} className={`todo-list-item ${todo.completed ? 'is-completed' : ''}`}>
                        <button
                          type="button"
                          className={`todo-list-check ${todo.completed ? 'is-completed' : ''}`}
                          onClick={() => onToggleTodo?.(todo.id)}
                          aria-label={todo.completed ? 'Marcar como pendiente' : 'Marcar como completada'}
                        >
                          <FaCheck />
                        </button>

                        <span>{todo.text}</span>

                        <button
                          type="button"
                          className="todo-list-delete"
                          onClick={() => onDeleteTodo?.(todo.id)}
                          aria-label="Eliminar tarea"
                        >
                          <FaTimes />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <footer className="todo-list-main-footer">
                <p className="todo-list-remaining">
                  Pendientes: {remainingCount} de {totalCount}
                </p>
                {quote ? <p className="todo-list-quote">{quote}</p> : null}
              </footer>
            </article>
          </div>
        )}
      </div>

      {isKanbanEditOpen && (
        <div
          className="todo-kanban-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onCloseKanbanEdit?.();
            }
          }}
        >
          <section className="todo-kanban-modal" role="dialog" aria-modal="true" aria-label="Editar tarjeta">
            <header className="todo-kanban-modal-header">
              <h3>Editar tarea</h3>
              <button type="button" onClick={onCloseKanbanEdit} aria-label="Cerrar edición">
                <FaTimes />
              </button>
            </header>

            <form className="todo-kanban-modal-form" onSubmit={onSaveKanbanEdit}>
              <label>
                <span>Título</span>
                <input
                  name="text"
                  value={kanbanEditDraft.text}
                  onChange={updateKanbanDraft}
                  placeholder="Nombre de la tarea"
                  required
                />
              </label>

              <label>
                <span>Descripción</span>
                <textarea
                  name="description"
                  value={kanbanEditDraft.description}
                  onChange={updateKanbanDraft}
                  placeholder="Contexto breve..."
                  rows={3}
                />
              </label>

              <div className="todo-kanban-modal-grid">
                <label>
                  <span>Estado</span>
                  <select
                    name="status"
                    value={kanbanEditDraft.status}
                    onChange={updateKanbanDraft}
                  >
                    {kanbanStatuses.map(status => (
                      <option key={status.key} value={status.key}>{status.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Prioridad</span>
                  <select
                    name="priority"
                    value={kanbanEditDraft.priority}
                    onChange={updateKanbanDraft}
                  >
                    {PRIORITY_OPTIONS.map(priority => (
                      <option key={priority.value} value={priority.value}>{priority.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span>Etiquetas</span>
                <input
                  value={kanbanEditDraft.tagsInput}
                  onChange={(event) => onKanbanEditTagsChange?.(event.target.value)}
                  placeholder="Ej. algoritmos, lectura"
                  list="kanban-tag-suggestions"
                />
              </label>

              <label>
                <span>Fecha límite</span>
                <input
                  type="date"
                  name="dueDate"
                  value={kanbanEditDraft.dueDate}
                  onChange={updateKanbanDraft}
                />
              </label>

              <footer className="todo-kanban-modal-actions">
                <button type="button" className="is-ghost" onClick={onCloseKanbanEdit}>
                  Cancelar
                </button>
                <button type="button" className="is-danger" onClick={onDeleteKanbanTodo}>
                  Eliminar
                </button>
                <button type="submit" className="is-primary">
                  Guardar
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {kanbanContextMenuPortal}
    </section>
  );
}

export default TodoListView;
