import React from 'react';
import './FrequencyModal.css';
import { FaTimes } from 'react-icons/fa';
import StatCard from './StatCard';

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

export default function FrequencyModal({ isOpen, onClose, activities, currentWeek }) {
  if (!isOpen) return null;

  // Filtrar actividades por semana actual
  const currentWeekActivities = activities.filter(act => act.semana === currentWeek);
  console.log('currentWeekActivities:', currentWeekActivities);

  // Lógica para calcular las estadísticas
  const getMostFrequent = (tipo = null) => {
    // Filtrar actividades completadas de la semana actual
    const completedActivities = currentWeekActivities.filter(act => act.completado);
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
      console.log(`Actividad: ${act.actividad}, Tipo: ${act.tipo}, Completada: ${act.completado}`);
      frequencyMap[act.actividad] = (frequencyMap[act.actividad] || 0) + 1;
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="frequency-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>×</button>
        <h2>Estadísticas de Frecuencia</h2>
        
        <div className="frequency-stats">
          <div className="stat-card">
            <h3>🏆 Actividad más frecuente</h3>
            <p className="stat-value">{mostFrequentOverall || 'N/A'}</p>
          </div>
          <StatCard
            title="⭐ Principal más frecuente"
            value={mostFrequentPrimary || "N/A"}
            color="#4a90e2"
          />
          <StatCard
            title="🔶 Secundaria más frecuente"
            value={mostFrequentSecondary || "N/A"}
            color="#f5a623"
          />
          <StatCard
            title="🔷 Baja más frecuente"
            value={mostFrequentLowPriority || "N/A"}
            color="#7ed321"
          />
          <StatCard
            title="⚪ Pasivo más frecuente"
            value={mostFrequentPassive || "N/A"}
            color="#bd10e0"
          />
        </div>
      </div>
    </div>
  );
}
