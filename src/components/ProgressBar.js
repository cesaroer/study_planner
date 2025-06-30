import React from 'react';

const ProgressBar = ({ progress }) => (
  <div className="progress-container">
    <div className="progress-bar" style={{ width: `${progress}%` }}>
      <span className="progress-text">{progress}%</span>
    </div>
    {progress > 0 && progress < 100 && (
      <span className="rocket-emoji" style={{ left: `calc(${progress}% - 15px)` }}>🚀</span>
    )}
  </div>
);

export default ProgressBar;
