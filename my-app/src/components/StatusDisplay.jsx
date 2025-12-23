import React from 'react';
import { colors, fonts } from '../utils/styles';

/**
 * Status Display Component
 * Shows key-value pairs for status information
 *
 * @param {Object} props
 * @param {Array} props.items - Array of { label, value, color?, unit? }
 */
const StatusDisplay = ({ items = [] }) => {
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{
            color: colors.text.dark,
            fontSize: '11px',
            fontFamily: fonts.mono
          }}>
            {item.label}
          </span>
          <span style={{
            color: item.color || colors.text.primary,
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: fonts.mono
          }}>
            {typeof item.value === 'number' ? item.value.toFixed(item.decimals ?? 1) : item.value}
            {item.unit && <span style={{ marginLeft: '2px' }}>{item.unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
};

export default StatusDisplay;
