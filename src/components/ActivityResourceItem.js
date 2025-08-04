import React, { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import TodoListModal from './TodoListModal';
import './ActivityResourceItem.css';

const ActivityResourceItem = ({ activity }) => {
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setIsTodoModalOpen(true);
  };

  return (
    <>
      <div 
        className="activity-resource"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick(e)}
      >
        <div className="activity-main">
          <div className="activity-info">
            <span className="activity-type">{activity.tipo}</span>
            <span className="activity-text">
              {activity.icono && <span className="activity-icon">{activity.icono}</span>}
              {activity.actividad}
            </span>
          </div>
          <div 
            className="expand-icon"
            onClick={(e) => {
              e.stopPropagation();
              handleClick(e);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleClick(e)}
            aria-label="Open todo list"
          >
            <FaChevronDown size={16} />
          </div>
        </div>
      </div>

      <TodoListModal
        isOpen={isTodoModalOpen}
        onClose={() => setIsTodoModalOpen(false)}
        activity={activity}
      />
    </>
  );
};

export default ActivityResourceItem;
