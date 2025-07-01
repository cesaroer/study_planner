import React from 'react';
import './ActivityFrequencyChart.css';

const ActivityFrequencyChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="no-data-message">No hay datos de frecuencia para mostrar.</p>;
  }

  // Find max count for scaling bars
  const maxCount = Math.max(...data.map(item => item.count));

  return (
    <div className="chart-container">
      <h3>Frecuencia de Actividades</h3>
      <div className="chart-bars">
        {data.map((item, index) => (
          <div key={index} className="chart-bar-item">
            <div
              className="chart-bar"
              style={{ height: `${(item.count / maxCount) * 100}%` }}
            ></div>
            <span className="bar-label">{item.activity} ({item.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityFrequencyChart;
