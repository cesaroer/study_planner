import React from 'react';

export default function StatCard({ emoji, title, value }) {
  return (
    <div className="stat-card">
      {emoji && <div className="stat-emoji">{emoji}</div>}
      <h3>{title}</h3>
      <p className="stat-value">{value}</p>
    </div>
  );
}
