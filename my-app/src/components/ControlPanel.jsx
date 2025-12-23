import React from 'react';
import { colors, fonts, panelStyles, getButtonStyle, sliderStyles } from '../utils/styles';

/**
 * Control Panel Component
 * Handles PID/Manual mode switching and parameter controls
 *
 * @param {Object} props
 * @param {string} props.controlMode - 'pid' or 'manual'
 * @param {Function} props.onModeChange - Called when mode changes
 * @param {Object} props.pidGains - { kp, ki, kd }
 * @param {Function} props.onPidChange - Called with { kp?, ki?, kd? } when gains change
 * @param {Object} props.pidConfig - { kpMax, kiMax, kdMax } for slider ranges
 * @param {Function} props.onResetGains - Called when reset gains is clicked
 * @param {React.ReactNode} props.manualControls - Custom content for manual mode
 * @param {React.ReactNode} props.statusDisplay - Status display content
 */
const ControlPanel = ({
  controlMode,
  onModeChange,
  pidGains = { kp: 0, ki: 0, kd: 0 },
  onPidChange,
  pidConfig = { kpMax: 100, kiMax: 50, kdMax: 50 },
  onResetGains,
  manualControls,
  statusDisplay
}) => {
  const pidParams = [
    { key: 'kp', label: 'Kp (Proportional)', color: colors.proportional, max: pidConfig.kpMax },
    { key: 'ki', label: 'Ki (Integral)', color: colors.integral, max: pidConfig.kiMax },
    { key: 'kd', label: 'Kd (Derivative)', color: colors.derivative, max: pidConfig.kdMax }
  ];

  return (
    <div style={{
      ...panelStyles.base,
      width: '280px'
    }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => onModeChange('pid')}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '5px',
            border: controlMode === 'pid' ? `2px solid ${colors.secondary}` : '1px solid rgba(100, 150, 200, 0.3)',
            cursor: 'pointer',
            background: controlMode === 'pid' ? 'rgba(246, 173, 85, 0.2)' : 'rgba(45, 55, 72, 0.3)',
            color: controlMode === 'pid' ? colors.secondary : colors.text.muted,
            fontFamily: fonts.mono
          }}
        >
          PID AUTO
        </button>
        <button
          onClick={() => onModeChange('manual')}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '5px',
            border: controlMode === 'manual' ? `2px solid ${colors.info}` : '1px solid rgba(100, 150, 200, 0.3)',
            cursor: 'pointer',
            background: controlMode === 'manual' ? 'rgba(99, 179, 237, 0.2)' : 'rgba(45, 55, 72, 0.3)',
            color: controlMode === 'manual' ? colors.info : colors.text.muted,
            fontFamily: fonts.mono
          }}
        >
          MANUAL
        </button>
      </div>

      {/* PID Controls */}
      {controlMode === 'pid' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: colors.text.secondary, fontSize: '12px', margin: 0 }}>PID PARAMETERS</h3>
            <button
              onClick={onResetGains}
              style={{
                padding: '5px 12px',
                fontSize: '10px',
                fontWeight: '600',
                borderRadius: '4px',
                border: '1px solid rgba(100, 150, 200, 0.3)',
                cursor: 'pointer',
                background: 'rgba(45, 55, 72, 0.4)',
                color: colors.text.secondary,
                fontFamily: fonts.mono
              }}
            >
              RESET GAINS
            </button>
          </div>

          {pidParams.map(param => (
            <div key={param.key} style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <label style={{ color: colors.text.muted, fontSize: '11px' }}>{param.label}</label>
                <span style={{ color: param.color, fontSize: '13px', fontWeight: 'bold' }}>
                  {pidGains[param.key]}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={param.max}
                value={pidGains[param.key]}
                onChange={e => onPidChange({ [param.key]: Number(e.target.value) })}
                style={{
                  ...sliderStyles.base,
                  accentColor: param.color
                }}
              />
            </div>
          ))}
        </>
      ) : (
        manualControls
      )}
    </div>
  );
};

export default ControlPanel;
