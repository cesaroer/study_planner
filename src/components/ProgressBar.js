import React from 'react';

const ProgressBar = ({ progress }) => {
  const clampedEmojiPosition = Math.max(6, Math.min(96, progress));

  return (
    <div className="progress-container">
      <div className="progress-bar" style={{ width: `${progress}%` }}>
        <span className="progress-text">{progress}%</span>
      </div>
      {progress > 0 && progress < 100 && (
        <span className="rocket-emoji" style={{ left: `calc(${clampedEmojiPosition}% - 9px)` }}>
          🚀
        </span>
      )}
    </div>
  );
};

export default ProgressBar;
