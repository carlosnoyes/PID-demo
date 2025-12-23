import React from 'react';
import { colors, fonts } from '../utils/styles';

/**
 * Navigation Component
 * Simple tab-style navigation for switching between simulators
 *
 * @param {Object} props
 * @param {Array} props.items - Array of { id, label, icon? }
 * @param {string} props.activeId - Currently active item ID
 * @param {Function} props.onChange - Called with item ID when selection changes
 */
const Navigation = ({ items, activeId, onChange }) => {
  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'center',
      gap: '4px',
      padding: '8px',
      background: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '8px',
      marginBottom: '20px'
    }}>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          style={{
            padding: '10px 20px',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            background: activeId === item.id
              ? 'linear-gradient(135deg, rgba(106, 159, 212, 0.3) 0%, rgba(100, 150, 200, 0.2) 100%)'
              : 'transparent',
            color: activeId === item.id ? colors.text.primary : colors.text.muted,
            fontFamily: fonts.mono,
            letterSpacing: '1px',
            transition: 'all 0.2s ease',
            borderBottom: activeId === item.id ? `2px solid ${colors.primary}` : '2px solid transparent'
          }}
          onMouseEnter={e => {
            if (activeId !== item.id) {
              e.target.style.background = 'rgba(100, 150, 200, 0.1)';
            }
          }}
          onMouseLeave={e => {
            if (activeId !== item.id) {
              e.target.style.background = 'transparent';
            }
          }}
        >
          {item.icon && <span style={{ marginRight: '6px' }}>{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </nav>
  );
};

export default Navigation;
