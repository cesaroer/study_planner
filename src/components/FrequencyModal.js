import React from 'react';
import './FrequencyModal.css';
import { FaTimes } from 'react-icons/fa';
import StatCard from './StatCard';
import ActivityFrequencyChart from './ActivityFrequencyChart';

const FrequencyCard = ({ title, activity, tipo }) => {
  if (!activity) return null;
  
  return (
    <div className={`frequency-card ${tipo ? `tipo-${tipo}` : ''}`}>
      <h3>{title}</h3>
      <p className="activity-name">{activity}</p>
      {tipo && <span className="tipo-indicator">{tipo}</span>}
    </div>
  );
};

export default function FrequencyModal({ isOpen, onClose, activities = [], currentWeek }) {
  if (!isOpen) return null;

  // Ensure activities is an array and filter by current week
  const currentWeekActivities = Array.isArray(activities) 
    ? activities.filter(act => act && act.semana === currentWeek)
    : [];
  
  console.log('currentWeekActivities:', currentWeekActivities);

  // Lógica para calcular las estadísticas
  const getMostFrequent = (tipo = null) => {
    // Filtrar actividades completadas de la semana actual
    const completedActivities = currentWeekActivities.filter(act => act && act.completado);
    console.log('completedActivities:', completedActivities);
    
    // Si no hay actividades completadas, retornar null
    if (completedActivities.length === 0) return null;
    
    // Filtrar por tipo si se especifica
    const filteredActivities = tipo 
      ? completedActivities.filter(act => act.tipo === tipo)
      : completedActivities;
    console.log(`filteredActivities for ${tipo}:`, filteredActivities);
    
    // Si no hay actividades en el tipo, retornar null
    if (filteredActivities.length === 0) return null;
    
    // Contar frecuencias
    const frequencyMap = {};
    filteredActivities.forEach(act => {
      if (act && act.actividad) {
        console.log(`Actividad: ${act.actividad}, Tipo: ${act.tipo}, Completada: ${act.completado}`);
        frequencyMap[act.actividad] = (frequencyMap[act.actividad] || 0) + 1;
      }
    });
    
    console.log(`FrequencyMap for ${tipo || 'all'}:`, frequencyMap);
    
    // Encontrar la actividad más frecuente
    let maxCount = 0;
    let mostFrequent = null;
    Object.entries(frequencyMap).forEach(([activity, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = activity;
      }
    });
    
    return mostFrequent;
  };

  // Obtener datos
  const mostFrequentOverall = getMostFrequent();
  const mostFrequentPrimary = getMostFrequent("Actividad Principal");
  const mostFrequentSecondary = getMostFrequent("Secundaria");
  const mostFrequentLowPriority = getMostFrequent("Menor Prioridad");
  const mostFrequentPassive = getMostFrequent("Conocimiento Pasivo");

  // Calculate frequency data for the chart
  const chartData = (() => {
    const completedActivities = currentWeekActivities.filter(act => act && act.completado);
    const frequencyMap = {};
    completedActivities.forEach(act => {
      if (act && act.actividad) {
        frequencyMap[act.actividad] = (frequencyMap[act.actividad] || 0) + 1;
      }
    });
    return Object.entries(frequencyMap).map(([activity, count]) => ({ 
      activity, 
      count 
    })).sort((a, b) => b.count - a.count);
  })();

  return (
    <div className="modal-overlay frequency-overlay" onClick={onClose}>
      <div className="frequency-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Estadísticas de Frecuencia</h2>
          <button onClick={onClose} className="modal-close-button">
            <FaTimes />
          </button>
        </div>
        <div className="frequency-content">
          <div className="frequency-stats">
            <StatCard
              emoji="🏆"
              title="Actividad más frecuente"
              value={mostFrequentOverall || 'N/A'}
            />
            <StatCard
              emoji="⭐"
              title="Principal más frecuente"
              value={mostFrequentPrimary || "N/A"}
            />
            <StatCard
              emoji="🔶"
              title="Secundaria más frecuente"
              value={mostFrequentSecondary || "N/A"}
            />
            <StatCard
              emoji="🔷"
              title="Baja más frecuente"
              value={mostFrequentLowPriority || "N/A"}
            />
            <StatCard
              emoji="⚪"
              title="Pasivo más frecuente"
              value={mostFrequentPassive || "N/A"}
            />
          </div>
          <ActivityFrequencyChart data={chartData} />
        </div>
      </div>
    </div>
  );
}
