import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FaTimes, FaPlus, FaCheck, FaTrash, FaExternalLinkAlt } from 'react-icons/fa';
import * as DS from '../services/dataService';
import './TodoListModal.css';

const LEGACY_STORAGE_KEY = 'activity_todos';

const normalizeKeyPart = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9-]/g, '');

const buildPrimaryIdentifier = (activity) => {
  if (!activity || typeof activity !== 'object') return '';
  const username = normalizeKeyPart(localStorage.getItem('lastLoggedUsername') || 'anon');
  const type = normalizeKeyPart(activity.tipo);
  const name = normalizeKeyPart(activity.actividad);
  const day = normalizeKeyPart(activity.dia);
  if (name && type) return `usr:${username}|activity:${name}|type:${type}`;
  if (name && day) return `usr:${username}|activity:${name}|day:${day}`;
  if (name) return `usr:${username}|activity:${name}`;
  if (activity.id) return `usr:${username}|id:${String(activity.id)}`;
  return '';
};

const buildLegacyIdentifierCandidates = (activity) => {
  if (!activity || typeof activity !== 'object') return [];
  const week = String(activity.semana || '').trim();
  const day = normalizeKeyPart(activity.dia);
  const name = normalizeKeyPart(activity.actividad);
  const type = normalizeKeyPart(activity.tipo);
  const legacy = [];
  if (week && day && name) legacy.push(`wk:${week}|day:${day}|activity:${name}`);
  if (day && name) legacy.push(`day:${day}|activity:${name}`);
  if (name) legacy.push(`activity:${name}`);
  if (name && type) legacy.push(`activity:${name}|type:${type}`);
  return legacy;
};

const normalizeTodoRecord = (todo) => {
  if (!todo || typeof todo !== 'object') return null;
  const text = String(todo.text || '').trim();
  if (!text) return null;
  return {
    id: String(todo.id || Date.now()),
    text,
    completed: Boolean(todo.completed),
    createdAt: todo.created_at || todo.createdAt || new Date().toISOString()
  };
};

const safeParseLegacyMap = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

const linkifyText = (text) => {
  if (!text) return text;

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  const hasUrls = text.match(urlRegex);

  if (!hasUrls) return text;

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      const url = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="todo-link"
          onClick={(event) => event.stopPropagation()}
        >
          {part}
          <FaExternalLinkAlt className="external-link-icon" />
        </a>
      );
    }
    return part;
  });
};

const TodoListModal = ({ isOpen, onClose, activity }) => {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const primaryIdentifier = useMemo(() => buildPrimaryIdentifier(activity), [activity]);

  const identifierCandidates = useMemo(() => {
    const keys = new Set();
    if (primaryIdentifier) keys.add(primaryIdentifier);
    if (activity?.id) keys.add(String(activity.id));
    buildLegacyIdentifierCandidates(activity).forEach(key => {
      if (key) keys.add(key);
    });
    return Array.from(keys);
  }, [primaryIdentifier, activity]);

  const persistLegacyMirror = useCallback((nextTodos) => {
    if (!primaryIdentifier) return;
    const legacyMap = safeParseLegacyMap();
    const mirror = nextTodos.map(todo => ({
      id: todo.id,
      text: todo.text,
      completed: todo.completed,
      createdAt: todo.createdAt
    }));

    legacyMap[primaryIdentifier] = mirror;
    if (activity?.id) {
      legacyMap[String(activity.id)] = mirror;
    }
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyMap));
  }, [primaryIdentifier, activity?.id]);

  const loadTodos = useCallback(async () => {
    if (!primaryIdentifier) {
      setTodos([]);
      return;
    }

    setIsLoading(true);
    try {
      let primaryTodos = (await DS.getActivityTodos(primaryIdentifier)).map(normalizeTodoRecord).filter(Boolean);

      // Migrar de aliases en IndexedDB a clave estable.
      const aliasRecords = [];
      for (const identifier of identifierCandidates) {
        if (identifier === primaryIdentifier) continue;
        const aliasTodos = await DS.getActivityTodos(identifier);
        if (aliasTodos.length > 0) {
          aliasRecords.push({ identifier, todos: aliasTodos });
        }
      }

      if (aliasRecords.length > 0) {
        const existingSignatures = new Set(
          primaryTodos.map(todo => `${todo.text.toLowerCase()}|${todo.createdAt}`)
        );

        for (const entry of aliasRecords) {
          for (const todo of entry.todos) {
            const normalizedText = String(todo.text || '').trim();
            if (!normalizedText) {
              await DS.deleteActivityTodo(todo.id);
              continue;
            }
            const createdAt = todo.created_at || todo.createdAt || '';
            const signature = `${normalizedText.toLowerCase()}|${createdAt}`;

            if (!existingSignatures.has(signature)) {
              const created = await DS.addActivityTodo(primaryIdentifier, normalizedText);
              if (todo.completed) {
                await DS.toggleActivityTodo(created.id);
              }
              existingSignatures.add(signature);
            }
            await DS.deleteActivityTodo(todo.id);
          }
        }
        primaryTodos = (await DS.getActivityTodos(primaryIdentifier)).map(normalizeTodoRecord).filter(Boolean);
      }

      // Migración legacy localStorage -> IndexedDB
      if (primaryTodos.length === 0) {
        const legacyMap = safeParseLegacyMap();
        const legacyTodos = identifierCandidates.flatMap(identifier => (
          Array.isArray(legacyMap[identifier]) ? legacyMap[identifier] : []
        ));

        if (legacyTodos.length > 0) {
          await DS.importTodosFromLocalStorage({ [primaryIdentifier]: legacyTodos });
          primaryTodos = (await DS.getActivityTodos(primaryIdentifier)).map(normalizeTodoRecord).filter(Boolean);
        }
      }

      setTodos(primaryTodos);
      persistLegacyMirror(primaryTodos);
    } catch {
      const legacyMap = safeParseLegacyMap();
      const fallbackTodos = identifierCandidates
        .flatMap(identifier => (Array.isArray(legacyMap[identifier]) ? legacyMap[identifier] : []))
        .map(normalizeTodoRecord)
        .filter(Boolean);
      setTodos(fallbackTodos);
    } finally {
      setIsLoading(false);
    }
  }, [identifierCandidates, persistLegacyMirror, primaryIdentifier]);

  useEffect(() => {
    if (!isOpen) return;
    loadTodos();
  }, [isOpen, loadTodos]);

  const addTodo = async (event) => {
    event.preventDefault();
    const text = newTodo.trim();
    if (!text || !primaryIdentifier) return;

    try {
      const created = await DS.addActivityTodo(primaryIdentifier, text);
      const normalized = normalizeTodoRecord(created);
      if (!normalized) return;
      setTodos(prev => {
        const next = [...prev, normalized];
        persistLegacyMirror(next);
        return next;
      });
      setNewTodo('');
    } catch {
      // fallback visual en caso extremo
      const fallbackTodo = normalizeTodoRecord({
        id: Date.now(),
        text,
        completed: false,
        createdAt: new Date().toISOString()
      });
      if (!fallbackTodo) return;
      setTodos(prev => {
        const next = [...prev, fallbackTodo];
        persistLegacyMirror(next);
        return next;
      });
      setNewTodo('');
    }
  };

  const toggleTodo = async (id) => {
    setTodos(prev => {
      const next = prev.map(todo => (
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ));
      persistLegacyMirror(next);
      return next;
    });

    try {
      await DS.toggleActivityTodo(id);
    } catch {
      loadTodos();
    }
  };

  const deleteTodo = async (id) => {
    setTodos(prev => {
      const next = prev.filter(todo => todo.id !== id);
      persistLegacyMirror(next);
      return next;
    });
    try {
      await DS.deleteActivityTodo(id);
    } catch {
      loadTodos();
    }
  };

  const clearCompleted = async () => {
    if (!primaryIdentifier) return;
    setTodos(prev => {
      const next = prev.filter(todo => !todo.completed);
      persistLegacyMirror(next);
      return next;
    });
    try {
      await DS.clearCompletedTodos(primaryIdentifier);
    } catch {
      loadTodos();
    }
  };

  if (!isOpen) return null;

  const completedCount = todos.filter(todo => todo.completed).length;
  const activeCount = todos.length - completedCount;

  return (
    <div className="todo-modal-overlay">
      <div className="todo-modal-content">
        <div className="todo-modal-header">
          <h3>{activity?.actividad || 'Todo List'}</h3>
          <button className="close-button" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="todo-stats">
          <span>{activeCount} pendientes</span>
          {completedCount > 0 && (
            <button
              className="clear-completed"
              onClick={clearCompleted}
            >
              Limpiar completados
            </button>
          )}
        </div>

        <div className="todo-list">
          {isLoading ? (
            <p className="no-todos">Cargando...</p>
          ) : todos.length > 0 ? (
            <ul>
              {todos.map(todo => (
                <li key={todo.id} className="todo-item">
                  <button
                    className={`todo-checkbox ${todo.completed ? 'completed' : ''}`}
                    onClick={() => toggleTodo(todo.id)}
                    aria-label={todo.completed ? 'Marcar como no completado' : 'Marcar como completado'}
                  >
                    {todo.completed && <FaCheck />}
                  </button>
                  <span className={`todo-text ${todo.completed ? 'completed' : ''}`}>
                    {linkifyText(todo.text)}
                  </span>
                  <button
                    className="delete-todo"
                    onClick={() => deleteTodo(todo.id)}
                    aria-label="Eliminar tarea"
                  >
                    <FaTrash />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-todos">No hay tareas aún. ¡Añade una abajo!</p>
          )}
        </div>

        <form onSubmit={addTodo} className="add-todo-form">
          <input
            type="text"
            value={newTodo}
            onChange={(event) => setNewTodo(event.target.value)}
            placeholder="Añadir nueva tarea..."
            className="todo-input"
            autoFocus
          />
          <button
            type="submit"
            className="add-todo-button"
            disabled={!newTodo.trim()}
          >
            <FaPlus />
          </button>
        </form>
      </div>
    </div>
  );
};

export default TodoListModal;
