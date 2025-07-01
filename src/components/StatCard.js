import React from 'react';

export default function StatCard({ title, value, color }) {
  return (
    <div className="stat-card" style={{ backgroundColor: color }}>
      <h3>{title}</h3>
      <p className="stat-value">{value}</p>
    </div>
  );
}
