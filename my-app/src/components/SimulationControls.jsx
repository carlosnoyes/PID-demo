import React from 'react';
import { getButtonStyle, fonts } from '../utils/styles';

/**
 * Simulation Controls Component
 * Start/Stop button and optional action buttons
 *
 * @param {Object} props
 * @param {boolean} props.isRunning - Whether simulation is running
 * @param {Function} props.onToggle - Called when start/stop is clicked
 * @param {Array} props.actions - Array of { label, onClick, disabled?, variant? }
 */
const SimulationControls = ({
  isRunning,
  onToggle,
  actions = []
}) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: '12px',
      marginTop: '16px',
      flexWrap: 'wrap'
    }}>
      <button
        onClick={onToggle}
        style={getButtonStyle(isRunning ? 'danger' : 'primary')}
        onMouseDown={e => e.target.style.transform = 'scale(0.98)'}
        onMouseUp={e => e.target.style.transform = 'scale(1)'}
      >
        {isRunning ? '⏹ STOP' : '▶ START'}
      </button>

      {actions.map((action, index) => (
        <button
          key={index}
          onClick={action.onClick}
          disabled={action.disabled}
          style={getButtonStyle(action.variant || 'secondary', action.disabled)}
          onMouseDown={e => !action.disabled && (e.target.style.transform = 'scale(0.98)')}
          onMouseUp={e => e.target.style.transform = 'scale(1)'}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
};

export default SimulationControls;
