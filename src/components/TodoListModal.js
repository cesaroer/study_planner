import React, { useState, useEffect } from 'react';
import { FaTimes, FaPlus, FaCheck, FaTrash, FaExternalLinkAlt } from 'react-icons/fa';
import './TodoListModal.css';

const STORAGE_KEY = 'activity_todos';

// Helper function to detect URLs in text and convert them to links
const linkifyText = (text) => {
  if (!text) return text;
  
  // URL regex pattern
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Split the text by URLs and non-URLs
  const parts = text.split(urlRegex);
  
  // Check if the text contains any URLs
  const hasUrls = text.match(urlRegex);
  
  if (!hasUrls) return text;
  
  // Map through parts and wrap URLs in anchor tags
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
          onClick={(e) => e.stopPropagation()}
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

  // Load todos from localStorage when component mounts or activity changes
  useEffect(() => {
    if (!activity?.id) return;
    
    const savedTodos = localStorage.getItem(STORAGE_KEY);
    if (savedTodos) {
      const allTodos = JSON.parse(savedTodos);
      setTodos(allTodos[activity.id] || []);
    }
  }, [activity?.id]);

  // Save todos to localStorage whenever they change
  const saveTodos = (updatedTodos) => {
    if (!activity?.id) return;
    
    const savedTodos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    savedTodos[activity.id] = updatedTodos;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTodos));
  };

  const addTodo = (e) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    
    const todo = {
      id: Date.now(),
      text: newTodo.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    
    const updatedTodos = [...todos, todo];
    setTodos(updatedTodos);
    saveTodos(updatedTodos);
    setNewTodo('');
  };

  const toggleTodo = (id) => {
    const updatedTodos = todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    setTodos(updatedTodos);
    saveTodos(updatedTodos);
  };

  const deleteTodo = (id) => {
    const updatedTodos = todos.filter(todo => todo.id !== id);
    setTodos(updatedTodos);
    saveTodos(updatedTodos);
  };

  const clearCompleted = () => {
    const updatedTodos = todos.filter(todo => !todo.completed);
    setTodos(updatedTodos);
    saveTodos(updatedTodos);
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
          {todos.length > 0 ? (
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
            onChange={(e) => setNewTodo(e.target.value)}
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
