import React from 'react';
import { colors, fonts, panelStyles } from '../utils/styles';

/**
 * System Parameters Window Component
 * Displays and allows editing of system parameters with equations
 *
 * @param {Object} props
 * @param {Array} props.parameters - Array of { name, value, unit, min?, max?, step?, editable?, onChange? }
 * @param {string} props.equation - LaTeX-style equation string to display
 * @param {string} props.equationLabel - Label for the equation section
 * @param {string} props.title - Title for the panel
 */
const SystemParameters = ({
  parameters = [],
  equation,
  equationLabel = 'System Equation',
  title = 'SYSTEM PARAMETERS'
}) => {
  return (
    <div style={{
      ...panelStyles.base,
      width: '280px'
    }}>
      <h2 style={panelStyles.header}>{title}</h2>

      {/* Equation display */}
      {equation && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <h3 style={{
            color: colors.text.secondary,
            fontSize: '11px',
            marginBottom: '10px',
            letterSpacing: '1px'
          }}>
            {equationLabel}
          </h3>
          <div style={{
            color: colors.text.primary,
            fontSize: '13px',
            fontFamily: fonts.mono,
            lineHeight: '1.6',
            textAlign: 'center',
            overflowX: 'auto'
          }}>
            {equation}
          </div>
        </div>
      )}

      {/* Parameters list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {parameters.map((param, index) => (
          <div key={index}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: param.editable ? '5px' : '0'
            }}>
              <span style={{
                color: colors.text.muted,
                fontSize: '11px',
                fontFamily: fonts.mono
              }}>
                {param.name}
              </span>
              <span style={{
                color: param.color || colors.text.primary,
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: fonts.mono
              }}>
                {typeof param.value === 'number' ? param.value.toFixed(param.decimals ?? 2) : param.value}
                {param.unit && <span style={{ color: colors.text.muted, marginLeft: '3px' }}>{param.unit}</span>}
              </span>
            </div>

            {param.editable && param.onChange && (
              <input
                type="range"
                min={param.min ?? 0}
                max={param.max ?? 100}
                step={param.step ?? 1}
                value={param.value}
                onChange={e => param.onChange(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  accentColor: param.color || colors.primary
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemParameters;
