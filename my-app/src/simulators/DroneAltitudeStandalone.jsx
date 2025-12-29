import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ============================================================================
// EMBEDDED STYLES (from utils/styles.js)
// ============================================================================
const colors = {
  primary: '#6a9fd4',
  secondary: '#f6ad55',
  success: '#48bb78',
  danger: '#e53e3e',
  warning: '#fbbf24',
  info: '#63b3ed',
  proportional: '#6af',
  integral: '#68d391',
  derivative: '#fa6',
  setpoint: '#ff6b6b',
  error: '#fbbf24',
  control: '#f6ad55',
  background: {
    dark: '#0a0f1a',
    medium: '#1a2035',
    light: '#2d3748',
    panel: 'rgba(26, 32, 44, 0.8)'
  },
  text: {
    primary: '#e2e8f0',
    secondary: '#a0aec0',
    muted: '#718096',
    dark: '#4a5568'
  },
  border: 'rgba(100, 150, 200, 0.2)'
};

const fonts = {
  mono: '"JetBrains Mono", "Fira Code", monospace'
};

const buttonStyles = {
  base: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: '600',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    letterSpacing: '1px',
    transition: 'transform 0.1s, opacity 0.1s',
    fontFamily: fonts.mono
  },
  primary: {
    background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
    color: '#fff'
  },
  danger: {
    background: 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)',
    color: '#fff'
  },
  secondary: {
    background: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
    color: '#fff'
  },
  accent: {
    background: 'linear-gradient(135deg, #805ad5 0%, #6b46c1 100%)',
    color: '#fff'
  },
  info: {
    background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
    color: '#fff'
  },
  ghost: {
    background: 'rgba(45, 55, 72, 0.6)',
    border: '1px solid rgba(100, 150, 200, 0.4)',
    color: '#a0aec0'
  },
  disabled: {
    background: 'rgba(80, 80, 100, 0.4)',
    color: '#666',
    cursor: 'not-allowed'
  }
};

const panelStyles = {
  base: {
    background: colors.background.panel,
    borderRadius: '12px',
    padding: '20px',
    border: `1px solid ${colors.border}`,
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)'
  }
};

const sliderStyles = {
  base: {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    cursor: 'pointer'
  }
};

function getButtonStyle(variant = 'primary', isDisabled = false) {
  if (isDisabled) {
    return { ...buttonStyles.base, ...buttonStyles.disabled };
  }
  return { ...buttonStyles.base, ...(buttonStyles[variant] || buttonStyles.primary) };
}

// ============================================================================
// EMBEDDED PID CONTROLLER (from utils/pidController.js)
// ============================================================================
function createPIDController(config = {}) {
  let state = {
    integral: 0,
    prevError: 0,
    initialized: false,
    derivativeHistory: [] // Store last 5 derivative values for moving average
  };

  const defaults = {
    integralMin: -Infinity,
    integralMax: Infinity,
    derivativeWindowSize: 5,
    ...config
  };

  return {
    compute(error, gains, dt) {
      const newIntegral = Math.max(
        defaults.integralMin,
        Math.min(defaults.integralMax, state.integral + error * dt)
      );

      // Calculate raw derivative (avoid derivative kick on first call)
      const rawDerivative = state.initialized ? (error - state.prevError) / dt : 0;

      // Add to derivative history
      state.derivativeHistory.push(rawDerivative);
      if (state.derivativeHistory.length > defaults.derivativeWindowSize) {
        state.derivativeHistory.shift();
      }

      // Calculate moving average of derivative
      const derivative = state.derivativeHistory.reduce((sum, val) => sum + val, 0) / state.derivativeHistory.length;

      const output = gains.kp * error + gains.ki * newIntegral + gains.kd * derivative;

      state.integral = newIntegral;
      state.prevError = error;
      state.initialized = true;

      return {
        output,
        errorP: error,
        errorI: newIntegral,
        errorD: derivative
      };
    },

    reset() {
      state.integral = 0;
      state.prevError = 0;
      state.initialized = false;
      state.derivativeHistory = [];
    },

    resetIntegral() {
      state.integral = 0;
    },

    getState() {
      return { ...state };
    }
  };
}

// ============================================================================
// EMBEDDED DATA CHART COMPONENT (from components/DataChart.jsx)
// ============================================================================
const DataChart = ({
  timeHistory = [],
  series = [],
  width = 300,
  height = 200
}) => {
  const [visibleSeries, setVisibleSeries] = useState(
    series.reduce((acc, _, i) => ({ ...acc, [i]: true }), {})
  );

  const toggleSeries = (index) => {
    setVisibleSeries(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const axisSpacing = 45;
  const baseLeftPadding = 50;
  const rightPadding = 20;
  const topPadding = 20;
  const bottomPadding = 35;

  const leftPadding = baseLeftPadding + (series.length * axisSpacing);
  const plotWidth = width - leftPadding - rightPadding;
  const plotHeight = height - topPadding - bottomPadding;

  const seriesBounds = useMemo(() => {
    const sharedAxisGroups = {};
    series.forEach(({ sharedAxis }, index) => {
      if (sharedAxis) {
        if (!sharedAxisGroups[sharedAxis]) {
          sharedAxisGroups[sharedAxis] = [];
        }
        sharedAxisGroups[sharedAxis].push(index);
      }
    });

    return series.map(({ data, label, sharedAxis, fixedBounds, clampedBounds }) => {
      // If fixedBounds are specified, use them
      if (fixedBounds) {
        return fixedBounds;
      }

      if (!data || data.length === 0) return { min: 0, max: 1 };

      const margin = 0.1;

      if (sharedAxis && sharedAxisGroups[sharedAxis]) {
        const groupIndices = sharedAxisGroups[sharedAxis];
        const allValues = groupIndices.flatMap(i => series[i].data || []);
        let min = Math.min(...allValues);
        let max = Math.max(...allValues);

        const isErrorOrControl = label.includes('Error') || label.includes('Control') || label.includes('E_');
        if (isErrorOrControl) {
          const absMax = Math.max(Math.abs(min), Math.abs(max));
          const rangeWithMargin = absMax * (1 + margin);

          // If clampedBounds specified, clamp the range
          if (clampedBounds) {
            const clampedRange = Math.min(rangeWithMargin, Math.max(Math.abs(clampedBounds.min), Math.abs(clampedBounds.max)));
            return { min: -clampedRange, max: clampedRange };
          }

          return { min: -rangeWithMargin, max: rangeWithMargin };
        }

        const range = max - min || 1;
        min -= range * margin;
        max += range * margin;

        return { min, max };
      }

      let min = Math.min(...data);
      let max = Math.max(...data);

      const isErrorOrControl = label.includes('Error') || label.includes('Control') || label.includes('E_');
      if (isErrorOrControl) {
        const absMax = Math.max(Math.abs(min), Math.abs(max));
        const rangeWithMargin = absMax * (1 + margin);

        // If clampedBounds specified, clamp the range
        if (clampedBounds) {
          const clampedRange = Math.min(rangeWithMargin, Math.max(Math.abs(clampedBounds.min), Math.abs(clampedBounds.max)));
          return { min: -clampedRange, max: clampedRange };
        }

        return { min: -rangeWithMargin, max: rangeWithMargin };
      }

      const range = max - min || 1;
      min -= range * margin;
      max += range * margin;

      return { min, max };
    });
  }, [series]);

  const xBounds = useMemo(() => {
    const xMin = 0;
    const xMax = timeHistory.length > 0 ? Math.max(...timeHistory) : 10;
    return { min: xMin, max: xMax };
  }, [timeHistory]);

  const generatePoints = (data, bounds) => {
    if (!data || data.length < 2 || timeHistory.length < 2) return '';

    const { min, max } = bounds;
    const range = max - min || 1;

    return data.map((v, i) => {
      const time = timeHistory[i] || 0;
      const x = leftPadding + ((time - xBounds.min) / (xBounds.max - xBounds.min || 1)) * plotWidth;
      const y = topPadding + plotHeight - ((v - min) / range) * plotHeight;
      return `${x},${y}`;
    }).join(' ');
  };

  const getDecimalPlaces = (value, range) => {
    if (range > 10) return 0;
    if (range > 1) return 1;
    if (range > 0.1) return 2;
    return 3;
  };

  const generateTicks = (bounds, count = 5) => {
    const { min, max } = bounds;
    const range = max - min;
    const decimals = getDecimalPlaces(max, range);
    const ticks = [];
    for (let i = 0; i < count; i++) {
      const value = min + (i / (count - 1)) * range;
      const y = topPadding + plotHeight - (i / (count - 1)) * plotHeight;
      ticks.push({ value, y, decimals });
    }
    return ticks;
  };

  const generateXTicks = (count = 5) => {
    const { min, max } = xBounds;
    const range = max - min || 1;
    const ticks = [];
    for (let i = 0; i < count; i++) {
      const value = min + (i / (count - 1)) * range;
      const x = leftPadding + (i / (count - 1)) * plotWidth;
      ticks.push({ value, x });
    }
    return ticks;
  };

  const xTicks = generateXTicks();

  if (timeHistory.length < 2) {
    return (
      <div style={{
        width,
        height,
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.text.muted,
        fontFamily: fonts.mono,
        fontSize: '12px'
      }}>
        Waiting for data...
      </div>
    );
  }

  return (
    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px' }}>
      <svg width={width} height={height}>
        {(() => {
          const firstVisibleIndex = series.findIndex((_, i) => visibleSeries[i]);
          if (firstVisibleIndex === -1) return null;
          const ticks = generateTicks(seriesBounds[firstVisibleIndex]);
          return ticks.map((tick, i) => (
            <line
              key={`grid-${i}`}
              x1={leftPadding}
              y1={tick.y}
              x2={width - rightPadding}
              y2={tick.y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          ));
        })()}

        <line
          x1={leftPadding}
          y1={topPadding + plotHeight}
          x2={width - rightPadding}
          y2={topPadding + plotHeight}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
        />
        {xTicks.map((tick, i) => (
          <g key={`x-tick-${i}`}>
            <line
              x1={tick.x}
              y1={topPadding + plotHeight}
              x2={tick.x}
              y2={topPadding + plotHeight + 5}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
            <text
              x={tick.x}
              y={topPadding + plotHeight + 18}
              textAnchor="middle"
              fill="rgba(255,255,255,0.6)"
              fontSize="10"
              fontFamily={fonts.mono}
            >
              {tick.value.toFixed(1)}s
            </text>
          </g>
        ))}

        {series.map(({ color }, seriesIndex) => {
          if (!visibleSeries[seriesIndex]) return null;

          const axisX = baseLeftPadding + (seriesIndex * axisSpacing);
          const ticks = generateTicks(seriesBounds[seriesIndex]);

          return (
            <g key={`axis-${seriesIndex}`}>
              <line
                x1={axisX}
                y1={topPadding}
                x2={axisX}
                y2={topPadding + plotHeight}
                stroke={color}
                strokeWidth="2"
              />
              {ticks.map((tick, i) => (
                <g key={`tick-${seriesIndex}-${i}`}>
                  <line
                    x1={axisX - 4}
                    y1={tick.y}
                    x2={axisX}
                    y2={tick.y}
                    stroke={color}
                    strokeWidth="1"
                  />
                  <text
                    x={axisX - 6}
                    y={tick.y + 3}
                    textAnchor="end"
                    fill={color}
                    fontSize="9"
                    fontFamily={fonts.mono}
                  >
                    {tick.value.toFixed(tick.decimals)}
                  </text>
                </g>
              ))}
            </g>
          );
        })}

        {series.map(({ data, color }, i) => {
          if (!visibleSeries[i]) return null;

          return (
            <polyline
              key={`line-${i}`}
              points={generatePoints(data, seriesBounds[i])}
              fill="none"
              stroke={color}
              strokeWidth="2"
            />
          );
        })}

        {series.some((_, i) => visibleSeries[i] && seriesBounds[i].min < 0 && seriesBounds[i].max > 0) && (
          <line
            x1={leftPadding}
            y1={topPadding + plotHeight / 2}
            x2={width - rightPadding}
            y2={topPadding + plotHeight / 2}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
            strokeDasharray="4"
          />
        )}
      </svg>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '15px',
        marginTop: '8px',
        flexWrap: 'wrap'
      }}>
        {series.map(({ label, color }, i) => (
          <div
            key={`legend-${i}`}
            onClick={() => toggleSeries(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              opacity: visibleSeries[i] ? 1 : 0.4,
              transition: 'opacity 0.2s'
            }}
          >
            <div style={{
              width: '20px',
              height: '3px',
              background: color
            }} />
            <span style={{
              color: colors.text.muted,
              fontSize: '10px',
              fontFamily: fonts.mono,
              userSelect: 'none'
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// PHYSICS CONSTANTS
// ============================================================================
const GRAVITY = 9.81;
const MIN_MASS = 1.0;
const MAX_MASS = 100.0;
const DEFAULT_MASS = 10.0;
const MAX_THRUST = 2000;  // Maximum upward thrust
const MIN_THRUST = -2000; // Negative thrust for faster descent
const DT = 0.001;
const RENDER_INTERVAL = 16;
const MAX_ALTITUDE = 100;

// Default PID values
const DEFAULT_PID = { kp: 50, ki: 5, kd: 30 };
const PID_CONFIG = { kpMax: 200, kiMax: 100, kdMax: 100 };

// Setpoint modes
const SETPOINT_MODES = {
  CONSTANT: 'constant',
  SINE: 'sine',
  BOX: 'box'
};

// ============================================================================
// SLIDER COMPONENT
// ============================================================================
const Slider = ({ label, value, onChange, min, max, step = 1, unit = '', color = colors.primary }) => (
  <div style={{ marginBottom: '12px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
      <span style={{ color: colors.text.secondary, fontSize: '11px' }}>{label}</span>
      <span style={{ color, fontSize: '11px', fontWeight: 'bold' }}>{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...sliderStyles.base, accentColor: color }}
    />
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const DroneAltitudeStandalone = () => {
  // Simulation state
  const [isRunning, setIsRunning] = useState(false);
  const [pidGains, setPidGains] = useState(DEFAULT_PID);
  const [cumulativeError, setCumulativeError] = useState(0);
  const [currentThrust, setCurrentThrust] = useState(0);

  // Drone mass
  const [droneMass, setDroneMass] = useState(DEFAULT_MASS);

  // Setpoint mode configuration
  const [setpointMode, setSetpointMode] = useState(SETPOINT_MODES.CONSTANT);
  const [constantSetpoint, setConstantSetpoint] = useState(50);
  const [sineAmplitude, setSineAmplitude] = useState(20);
  const [sineFrequency, setSineFrequency] = useState(0.1);
  const [boxAmplitude, setBoxAmplitude] = useState(20);
  const [boxFrequency, setBoxFrequency] = useState(0.1);

  const [plotData, setPlotData] = useState({
    setpointHistory: [],
    measuredHistory: [],
    errorPHistory: [],
    errorIHistory: [],
    errorDHistory: [],
    thrustHistory: [],
    timeHistory: []
  });
  const timeOffsetRef = useRef(0);

  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastRenderRef = useRef(0);
  const pidController = useRef(createPIDController());

  const stateRef = useRef({
    altitude: 50,
    velocity: 0,
    mass: DEFAULT_MASS,
    setpoint: 50,
    time: 0,
    thrust: 0,
    crashed: false
  });

  // Calculate setpoint based on mode and time
  const calculateSetpoint = useCallback((time) => {
    const baseSetpoint = 50; // Center altitude

    switch (setpointMode) {
      case SETPOINT_MODES.CONSTANT:
        return constantSetpoint;

      case SETPOINT_MODES.SINE:
        // Sine wave centered at 50m
        return baseSetpoint + sineAmplitude * Math.sin(2 * Math.PI * sineFrequency * time);

      case SETPOINT_MODES.BOX:
        // Box/square wave centered at 50m
        const period = 1 / boxFrequency;
        const phase = (time % period) / period;
        return baseSetpoint + (phase < 0.5 ? boxAmplitude : -boxAmplitude);

      default:
        return constantSetpoint;
    }
  }, [setpointMode, constantSetpoint, sineAmplitude, sineFrequency, boxAmplitude, boxFrequency]);

  const resetSimulation = useCallback(() => {
    const initialSetpoint = calculateSetpoint(0);
    stateRef.current = {
      altitude: 50,
      velocity: 0,
      mass: droneMass,
      setpoint: initialSetpoint,
      time: 0,
      thrust: 0,
      crashed: false
    };
    pidController.current.reset();
    timeOffsetRef.current = 0;
    setPlotData({ setpointHistory: [], measuredHistory: [], errorPHistory: [], errorIHistory: [], errorDHistory: [], thrustHistory: [], timeHistory: [] });
    setCurrentThrust(0);
    setCumulativeError(0);
  }, [droneMass, calculateSetpoint]);

  const simulateStep = useCallback((controlSignal) => {
    const state = stateRef.current;
    if (state.crashed) return;

    // Clamp thrust between 0 and MAX_THRUST
    // 0 thrust means drone falls (no lift)
    const thrust = Math.max(MIN_THRUST, Math.min(MAX_THRUST, controlSignal));
    state.thrust = thrust;

    // Physics: thrust provides upward force, gravity pulls down
    const gravityForce = state.mass * GRAVITY;
    const netForce = thrust - gravityForce;
    const acceleration = netForce / state.mass;

    state.velocity += acceleration * DT;
    state.altitude += state.velocity * DT;
    state.time += DT;

    // Update setpoint based on mode
    state.setpoint = calculateSetpoint(state.time);

    if (state.altitude <= 0 || state.altitude >= MAX_ALTITUDE) {
      state.crashed = true;
      state.altitude = Math.max(0, Math.min(MAX_ALTITUDE, state.altitude));
      state.velocity = 0;
    }
  }, [calculateSetpoint]);

  const computePIDThrust = useCallback(() => {
    const state = stateRef.current;
    const error = state.setpoint - state.altitude;

    // PID output directly controls thrust - no hover thrust offset
    // With only P gain and zero error, thrust will be zero and drone will fall
    const pidResult = pidController.current.compute(error, pidGains, DT);

    return pidResult;
  }, [pidGains]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, '#1a1a2e');
    skyGradient.addColorStop(0.5, '#16213e');
    skyGradient.addColorStop(1, '#1f4037');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);

    const state = stateRef.current;

    // Altitude markers
    ctx.strokeStyle = 'rgba(100, 200, 150, 0.15)';
    ctx.lineWidth = 1;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(100, 200, 150, 0.4)';
    ctx.textAlign = 'right';

    for (let alt = 0; alt <= MAX_ALTITUDE; alt += 20) {
      const y = height - (alt / MAX_ALTITUDE) * (height - 60) - 30;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
      ctx.fillText(`${alt}m`, 45, y + 4);
    }

    const droneX = width / 2;
    const droneY = height - (state.altitude / MAX_ALTITUDE) * (height - 60) - 30;
    const setpointY = height - (state.setpoint / MAX_ALTITUDE) * (height - 60) - 30;

    // Setpoint line
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(80, setpointY);
    ctx.lineTo(width - 40, setpointY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`TARGET: ${state.setpoint.toFixed(1)}m`, width - 140, setpointY - 8);

    // Ground
    const groundGradient = ctx.createLinearGradient(0, height - 30, 0, height);
    groundGradient.addColorStop(0, '#2d5a3d');
    groundGradient.addColorStop(1, '#1a3d2a');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, height - 30, width, 30);

    // Thrust visualization
    // Positive thrust (upward flames)
    if (state.thrust > 0) {
      const thrustIntensity = Math.min(Math.abs(state.thrust) / (state.mass * GRAVITY * 2), 1);
      const flameHeight = 15 + thrustIntensity * 35;
      const flameGradient = ctx.createLinearGradient(droneX, droneY + 15, droneX, droneY + 15 + flameHeight);
      flameGradient.addColorStop(0, `rgba(255, 200, 50, ${0.9 * thrustIntensity})`);
      flameGradient.addColorStop(0.3, `rgba(255, 100, 30, ${0.7 * thrustIntensity})`);
      flameGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(droneX - 12, droneY + 15);
      ctx.lineTo(droneX + 12, droneY + 15);
      ctx.lineTo(droneX + 4, droneY + 15 + flameHeight);
      ctx.lineTo(droneX - 4, droneY + 15 + flameHeight);
      ctx.closePath();
      ctx.fill();
    }

    // Negative thrust (downward jets - reverse thrust)
    if (state.thrust < 0) {
      const thrustIntensity = Math.min(Math.abs(state.thrust) / (state.mass * GRAVITY * 2), 1);
      const jetHeight = 15 + thrustIntensity * 25;
      const jetGradient = ctx.createLinearGradient(droneX, droneY - 15, droneX, droneY - 15 - jetHeight);
      jetGradient.addColorStop(0, `rgba(100, 150, 255, ${0.8 * thrustIntensity})`);
      jetGradient.addColorStop(0.5, `rgba(150, 180, 255, ${0.5 * thrustIntensity})`);
      jetGradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
      ctx.fillStyle = jetGradient;
      ctx.beginPath();
      ctx.moveTo(droneX - 10, droneY - 15);
      ctx.lineTo(droneX + 10, droneY - 15);
      ctx.lineTo(droneX + 3, droneY - 15 - jetHeight);
      ctx.lineTo(droneX - 3, droneY - 15 - jetHeight);
      ctx.closePath();
      ctx.fill();
    }

    // Drone body
    const bodyGradient = ctx.createLinearGradient(droneX - 25, droneY - 10, droneX + 25, droneY + 10);
    if (state.crashed) {
      bodyGradient.addColorStop(0, '#7f1d1d');
      bodyGradient.addColorStop(0.5, '#991b1b');
      bodyGradient.addColorStop(1, '#7f1d1d');
    } else {
      bodyGradient.addColorStop(0, '#4a5568');
      bodyGradient.addColorStop(0.5, '#718096');
      bodyGradient.addColorStop(1, '#4a5568');
    }
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.roundRect(droneX - 25, droneY - 10, 50, 20, 5);
    ctx.fill();

    // Arms
    ctx.strokeStyle = state.crashed ? '#450a0a' : '#2d3748';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(droneX - 20, droneY);
    ctx.lineTo(droneX - 40, droneY - 8);
    ctx.moveTo(droneX + 20, droneY);
    ctx.lineTo(droneX + 40, droneY - 8);
    ctx.stroke();

    // Propellers
    if (!state.crashed && state.thrust > 0) {
      const propAngle = (state.time * 50) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.7)';
      ctx.lineWidth = 2;
      [-40, 40].forEach(offset => {
        ctx.beginPath();
        ctx.ellipse(droneX + offset, droneY - 8, 15, 3, propAngle, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // Hubs
    ctx.fillStyle = state.crashed ? '#450a0a' : '#1a202c';
    [-40, 40].forEach(offset => {
      ctx.beginPath();
      ctx.arc(droneX + offset, droneY - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // LED
    const error = Math.abs(state.setpoint - state.altitude);
    const ledColor = state.crashed ? '#ef4444' : error < 1 ? '#4ade80' : error < 3 ? '#fbbf24' : '#ef4444';
    ctx.fillStyle = ledColor;
    ctx.shadowColor = ledColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(droneX, droneY - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mass display above drone
    ctx.fillStyle = '#805ad5';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.mass.toFixed(1)}kg`, droneX, droneY - 25);

    // Crashed text
    if (state.crashed) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.font = 'bold 32px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRASHED!', width / 2, height / 2 - 20);
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillStyle = '#a0aec0';
      ctx.fillText('Press Reset to try again', width / 2, height / 2 + 15);
    }
  }, []);

  // Animation loop
  useEffect(() => {
    if (!isRunning) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    let lastTime = performance.now();
    let accumulator = 0;
    let errorAccumulator = cumulativeError;
    let lastPlotTime = 0;

    const loop = (currentTime) => {
      const deltaTime = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;
      accumulator += deltaTime;

      let latestPidResult = null;

      while (accumulator >= DT * 1000) {
        const pidResult = computePIDThrust();
        latestPidResult = pidResult;
        simulateStep(pidResult.output);

        const state = stateRef.current;
        const error = state.setpoint - state.altitude;
        errorAccumulator += error * DT;

        accumulator -= DT * 1000;
      }

      const state = stateRef.current;
      if (latestPidResult && state.time - lastPlotTime >= 0.05) {
        lastPlotTime = state.time;
        setPlotData(prev => ({
          setpointHistory: [...prev.setpointHistory, state.setpoint],
          measuredHistory: [...prev.measuredHistory, state.altitude],
          errorPHistory: [...prev.errorPHistory, latestPidResult.errorP],
          errorIHistory: [...prev.errorIHistory, latestPidResult.errorI],
          errorDHistory: [...prev.errorDHistory, latestPidResult.errorD],
          thrustHistory: [...prev.thrustHistory, state.thrust],
          timeHistory: [...prev.timeHistory, state.time - timeOffsetRef.current]
        }));
        setCurrentThrust(state.thrust);
        setCumulativeError(errorAccumulator);
      }

      if (currentTime - lastRenderRef.current >= RENDER_INTERVAL) {
        render();
        lastRenderRef.current = currentTime;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isRunning, computePIDThrust, simulateStep, render, cumulativeError]);

  useEffect(() => { render(); }, [render]);

  // Update mass in state when droneMass changes
  useEffect(() => {
    stateRef.current.mass = droneMass;
  }, [droneMass]);

  const handleStart = () => {
    if (stateRef.current.crashed) {
      resetSimulation();
    }
    setIsRunning(true);
  };

  const handleStop = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    resetSimulation();
  };

  const handleResetIntegral = () => {
    pidController.current.resetIntegral();
    setCumulativeError(0);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px',
      maxWidth: '1300px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: fonts.mono,
      background: colors.background.dark,
      minHeight: '100vh'
    }}>
      {/* Top Row: Left Panel + Simulation + Right Panel */}
      <div style={{ display: 'flex', gap: '20px', width: '100%', alignItems: 'stretch' }}>

        {/* Left Control Panel */}
        <div style={{ ...panelStyles.base, padding: '15px', width: '280px', flexShrink: 0, height: '450px', overflowY: 'auto' }}>

          {/* Start/Stop/Reset Buttons */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: colors.text.secondary, fontSize: '12px', marginBottom: '10px', letterSpacing: '2px' }}>
              SIMULATION CONTROL
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  style={getButtonStyle('primary')}
                >
                  START
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  style={getButtonStyle('danger')}
                >
                  STOP
                </button>
              )}
              <button
                onClick={handleReset}
                style={getButtonStyle('ghost')}
              >
                RESET
              </button>
            </div>
          </div>

          {/* Drone Weight */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: colors.text.secondary, fontSize: '12px', marginBottom: '10px', letterSpacing: '2px' }}>
              DRONE WEIGHT
            </h3>
            <Slider
              label="Mass"
              value={droneMass}
              onChange={setDroneMass}
              min={MIN_MASS}
              max={MAX_MASS}
              step={0.5}
              unit=" kg"
              color="#805ad5"
            />
          </div>

          {/* Setpoint Mode */}
          <div>
            <h3 style={{ color: colors.text.secondary, fontSize: '12px', marginBottom: '10px', letterSpacing: '2px' }}>
              SETPOINT MODE
            </h3>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
              {Object.entries(SETPOINT_MODES).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => setSetpointMode(value)}
                  style={{
                    ...buttonStyles.base,
                    padding: '6px 12px',
                    fontSize: '10px',
                    ...(setpointMode === value ? buttonStyles.info : buttonStyles.ghost)
                  }}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Mode-specific controls */}
            {setpointMode === SETPOINT_MODES.CONSTANT && (
              <Slider
                label="Target Altitude"
                value={constantSetpoint}
                onChange={setConstantSetpoint}
                min={5}
                max={95}
                step={1}
                unit=" m"
                color={colors.setpoint}
              />
            )}

            {setpointMode === SETPOINT_MODES.SINE && (
              <>
                <Slider
                  label="Amplitude"
                  value={sineAmplitude}
                  onChange={setSineAmplitude}
                  min={5}
                  max={40}
                  step={1}
                  unit=" m"
                  color={colors.setpoint}
                />
                <Slider
                  label="Frequency"
                  value={sineFrequency}
                  onChange={setSineFrequency}
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  unit=" Hz"
                  color={colors.secondary}
                />
              </>
            )}

            {setpointMode === SETPOINT_MODES.BOX && (
              <>
                <Slider
                  label="Amplitude"
                  value={boxAmplitude}
                  onChange={setBoxAmplitude}
                  min={5}
                  max={40}
                  step={1}
                  unit=" m"
                  color={colors.setpoint}
                />
                <Slider
                  label="Frequency"
                  value={boxFrequency}
                  onChange={setBoxFrequency}
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  unit=" Hz"
                  color={colors.secondary}
                />
              </>
            )}
          </div>
        </div>

        {/* Center: Simulation Window */}
        <div style={{ ...panelStyles.base, padding: '15px', flex: 1, minWidth: 0, height: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }}
          />
        </div>

        {/* Right Control Panel: PID + Status */}
        <div style={{ ...panelStyles.base, padding: '15px', width: '280px', flexShrink: 0, height: '450px', overflowY: 'auto' }}>

          {/* PID Gains */}
          <div style={{ marginBottom: '20px' }}>
            <Slider
              label="Proportional (Kp)"
              value={pidGains.kp}
              onChange={(v) => setPidGains(prev => ({ ...prev, kp: v }))}
              min={0}
              max={PID_CONFIG.kpMax}
              step={1}
              color={colors.proportional}
            />
            <Slider
              label="Integral (Ki)"
              value={pidGains.ki}
              onChange={(v) => setPidGains(prev => ({ ...prev, ki: v }))}
              min={0}
              max={PID_CONFIG.kiMax}
              step={0.5}
              color={colors.integral}
            />
            <Slider
              label="Derivative (Kd)"
              value={pidGains.kd}
              onChange={(v) => setPidGains(prev => ({ ...prev, kd: v }))}
              min={0}
              max={PID_CONFIG.kdMax}
              step={1}
              color={colors.derivative}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                onClick={() => setPidGains(DEFAULT_PID)}
                style={{ ...getButtonStyle('ghost'), padding: '6px 12px', fontSize: '10px', flex: 1 }}
              >
                RESET GAINS
              </button>
              <button
                onClick={handleResetIntegral}
                style={{ ...getButtonStyle('ghost'), padding: '6px 12px', fontSize: '10px', flex: 1 }}
              >
                RESET INTEGRAL
              </button>
            </div>
          </div>

          {/* Status Display */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ color: colors.text.muted, fontSize: '9px' }}>THRUST</div>
                <div style={{ color: colors.secondary, fontSize: '14px', fontWeight: 'bold' }}>
                  {currentThrust.toFixed(0)}N
                </div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ color: colors.text.muted, fontSize: '9px' }}>CUMULATIVE ERROR</div>
                <div style={{ color: colors.warning, fontSize: '14px', fontWeight: 'bold' }}>
                  {cumulativeError.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Data Tracking */}
      <div style={{ ...panelStyles.base, padding: '15px', width: '100%', boxSizing: 'border-box', position: 'relative' }}>
        <button
          onClick={() => {
            timeOffsetRef.current = stateRef.current.time;
            setPlotData({ setpointHistory: [], measuredHistory: [], errorPHistory: [], errorIHistory: [], errorDHistory: [], thrustHistory: [], timeHistory: [] });
          }}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            padding: '6px 12px',
            fontSize: '10px',
            fontWeight: '600',
            borderRadius: '4px',
            border: '1px solid rgba(100, 150, 200, 0.3)',
            cursor: 'pointer',
            background: 'rgba(45, 55, 72, 0.8)',
            color: colors.text.secondary,
            fontFamily: fonts.mono,
            zIndex: 10
          }}
        >
          CLEAR PLOT
        </button>
        <DataChart
          timeHistory={plotData.timeHistory}
          series={[
            { data: plotData.setpointHistory, label: 'Setpoint (m)', color: '#00d4ff', fixedBounds: { min: 0, max: 100 } },
            { data: plotData.measuredHistory, label: 'Measured (m)', color: '#00ff88', fixedBounds: { min: 0, max: 100 } },
            { data: plotData.errorPHistory, label: 'E_P (m)', color: '#ff3366', sharedAxis: 'error', clampedBounds: { min: -100, max: 100 } },
            { data: plotData.errorIHistory, label: 'E_I (m·s)', color: '#9d4edd', sharedAxis: 'error', clampedBounds: { min: -100, max: 100 } },
            { data: plotData.errorDHistory, label: 'E_D (m/s)', color: '#ff6d00', clampedBounds: { min: -100, max: 100 } },
            { data: plotData.thrustHistory, label: 'Thrust (N)', color: '#ffcc00' }
          ]}
          width={1140}
          height={220}
        />
      </div>
    </div>
  );
};

export default DroneAltitudeStandalone;
