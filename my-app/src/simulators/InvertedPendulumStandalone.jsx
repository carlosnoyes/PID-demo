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
    derivativeHistory: []
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

      const rawDerivative = state.initialized ? (error - state.prevError) / dt : 0;

      state.derivativeHistory.push(rawDerivative);
      if (state.derivativeHistory.length > defaults.derivativeWindowSize) {
        state.derivativeHistory.shift();
      }

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
const PENDULUM_LENGTH = 2.0;
const PENDULUM_MASS = 0.25;
const CART_MASS = 1.0;
const FRICTION_CART = 0.1;
const FRICTION_PENDULUM = 0.01;
const NOISE_AMPLITUDE = 0.002;
const DT = 0.001;
const RENDER_INTERVAL = 16;
const TRACK_WIDTH = 20.0;
const SCALE = 23;

// Default PID values
const DEFAULT_PID = { kp: 250, ki: 25, kd: 75 };
const PID_CONFIG = { kpMax: 1000, kiMax: 200, kdMax: 200 };

// Disturbance types
const DISTURBANCE_TYPES = {
  OFF: 'off',
  NUDGES: 'nudges',
  TILTS: 'tilts'
};

// Impulse duration for nudges (seconds)
const NUDGE_IMPULSE_DURATION = 0.5;

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
const InvertedPendulumStandalone = ({ simulators = [], activeSimulator = '', onSimulatorChange = () => {} }) => {
  // Simulation state
  const [isRunning, setIsRunning] = useState(false);
  const [pidGains, setPidGains] = useState(DEFAULT_PID);
  const [fallen, setFallen] = useState(false);
  const [failureType, setFailureType] = useState(null);
  const [accumulatedError, setAccumulatedError] = useState(0);
  const [currentForce, setCurrentForce] = useState(0);

  // Disturbance configuration
  const [disturbanceType, setDisturbanceType] = useState(DISTURBANCE_TYPES.OFF);
  const [nudgeAmplitude, setNudgeAmplitude] = useState(30);
  const [nudgeFrequency, setNudgeFrequency] = useState(0.5);
  const [tiltAmplitude, setTiltAmplitude] = useState(5); // degrees
  const [tiltFrequency, setTiltFrequency] = useState(0.2);

  const [plotData, setPlotData] = useState({
    setpointHistory: [],
    measuredHistory: [],
    errorPHistory: [],
    errorIHistory: [],
    errorDHistory: [],
    forceHistory: [],
    timeHistory: []
  });
  const timeOffsetRef = useRef(0);

  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastRenderRef = useRef(0);
  const pidController = useRef(createPIDController());

  const stateRef = useRef({
    theta: 0.05,
    thetaDot: 0,
    x: 0,
    xDot: 0,
    time: 0,
    force: 0,
    floorTilt: 0
  });

  // Calculate nudge force based on time (short impulses, alternating left/right)
  const calculateNudgeForce = useCallback((time) => {
    if (disturbanceType !== DISTURBANCE_TYPES.NUDGES) return 0;

    const period = 1 / nudgeFrequency;
    const timeInPeriod = time % period;
    const halfPeriod = period / 2;

    // Determine if we're in the first or second half of the period (for alternating direction)
    const isFirstHalf = timeInPeriod < halfPeriod;
    const timeInHalf = isFirstHalf ? timeInPeriod : timeInPeriod - halfPeriod;

    // Only apply force during impulse duration
    if (timeInHalf < NUDGE_IMPULSE_DURATION) {
      const direction = isFirstHalf ? 1 : -1;
      return nudgeAmplitude * direction;
    }

    return 0;
  }, [disturbanceType, nudgeAmplitude, nudgeFrequency]);

  // Calculate floor tilt angle based on time (sinusoidal, in radians)
  const calculateTiltAngle = useCallback((time) => {
    if (disturbanceType !== DISTURBANCE_TYPES.TILTS) return 0;

    const amplitudeRad = tiltAmplitude * Math.PI / 180; // Convert degrees to radians
    // Sinusoidal tilt
    return amplitudeRad * Math.sin(2 * Math.PI * tiltFrequency * time);
  }, [disturbanceType, tiltAmplitude, tiltFrequency]);

  const resetSimulation = useCallback(() => {
    stateRef.current = {
      theta: (Math.random() - 0.5) * 0.1,
      thetaDot: 0,
      x: 0,
      xDot: 0,
      time: 0,
      force: 0,
      floorTilt: 0
    };
    pidController.current.reset();
    timeOffsetRef.current = 0;
    setPlotData({ setpointHistory: [], measuredHistory: [], errorPHistory: [], errorIHistory: [], errorDHistory: [], forceHistory: [], timeHistory: [] });
    setFallen(false);
    setFailureType(null);
    setAccumulatedError(0);
    setCurrentForce(0);
  }, []);

  const simulateStep = useCallback((force, currentFallen, floorTilt) => {
    const state = stateRef.current;
    if (currentFallen) return null;

    const m = PENDULUM_MASS;
    const M = CART_MASS;
    const l = PENDULUM_LENGTH;
    const g = GRAVITY;
    const b = FRICTION_CART;
    const c = FRICTION_PENDULUM;
    const { theta, thetaDot, x, xDot } = state;

    const noise = (Math.random() - 0.5) * 2 * NOISE_AMPLITUDE;

    // Effective pendulum angle relative to true vertical (accounting for floor tilt)
    const effectiveTheta = theta + floorTilt;
    const sinTheta = Math.sin(effectiveTheta);
    const cosTheta = Math.cos(effectiveTheta);

    // Cart experiences a gravitational component along the tilted track
    const cartGravityForce = (M + m) * g * Math.sin(floorTilt);

    const denom = l * (4.0 / 3.0 - (m * cosTheta * cosTheta) / (M + m));
    const thetaDDot = (g * sinTheta +
      cosTheta * ((-force - cartGravityForce - m * l * thetaDot * thetaDot * sinTheta + b * xDot) / (M + m)) -
      c * thetaDot / (m * l) + noise) / denom;
    const xDDot = (force + cartGravityForce + m * l * (thetaDot * thetaDot * sinTheta - thetaDDot * cosTheta) - b * xDot) / (M + m);

    state.thetaDot += thetaDDot * DT;
    state.theta += state.thetaDot * DT;
    state.xDot += xDDot * DT;
    state.x += state.xDot * DT;
    state.time += DT;
    state.force = force;
    state.floorTilt = floorTilt;

    while (state.theta > Math.PI) state.theta -= 2 * Math.PI;
    while (state.theta < -Math.PI) state.theta += 2 * Math.PI;

    if (Math.abs(state.x) > TRACK_WIDTH / 2 - 0.2) {
      return 'crashed';
    }

    if (Math.abs(state.theta) > Math.PI / 2) {
      return 'fallen';
    }

    return null;
  }, []);

  const computePIDForce = useCallback(() => {
    const state = stateRef.current;
    const error = state.theta;
    const pidResult = pidController.current.compute(error, pidGains, DT);
    const positionForce = 20 * state.x + 10 * state.xDot;
    const totalForce = Math.max(-50, Math.min(50, pidResult.output + positionForce));
    return { ...pidResult, totalForce };
  }, [pidGains]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0a0f1a');
    bgGradient.addColorStop(1, '#1a1f2e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    for (let i = 0; i < height; i += 30) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    const state = stateRef.current;
    const centerX = width / 2;
    const groundY = height * 0.7;
    const floorTilt = state.floorTilt || 0;

    // Save context and apply floor tilt rotation
    ctx.save();
    ctx.translate(centerX, groundY);
    ctx.rotate(floorTilt);
    ctx.translate(-centerX, -groundY);

    // Track
    ctx.strokeStyle = '#4a6fa5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX - TRACK_WIDTH / 2 * SCALE, groundY);
    ctx.lineTo(centerX + TRACK_WIDTH / 2 * SCALE, groundY);
    ctx.stroke();

    // Track markers
    ctx.strokeStyle = '#3a5a8a';
    ctx.lineWidth = 2;
    for (let i = -10; i <= 10; i++) {
      const markerX = centerX + i * SCALE;
      ctx.beginPath();
      ctx.moveTo(markerX, groundY - 5);
      ctx.lineTo(markerX, groundY + 5);
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.fillStyle = '#6a8ab5';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i}m`, markerX, groundY + 20);
      }
    }

    // Cart
    const cartX = centerX + state.x * SCALE;
    const cartWidth = 40;
    const cartHeight = 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(cartX - cartWidth / 2 + 5, groundY - cartHeight + 5, cartWidth, cartHeight);

    const cartGradient = ctx.createLinearGradient(cartX - cartWidth / 2, groundY - cartHeight, cartX - cartWidth / 2, groundY);
    cartGradient.addColorStop(0, '#5a7a9a');
    cartGradient.addColorStop(1, '#3a5a7a');
    ctx.fillStyle = cartGradient;
    ctx.fillRect(cartX - cartWidth / 2, groundY - cartHeight, cartWidth, cartHeight);

    ctx.strokeStyle = '#7a9aba';
    ctx.lineWidth = 2;
    ctx.strokeRect(cartX - cartWidth / 2, groundY - cartHeight, cartWidth, cartHeight);

    // Wheels
    ctx.fillStyle = '#2a3a4a';
    ctx.beginPath();
    ctx.arc(cartX - 12.5, groundY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cartX + 12.5, groundY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Pendulum
    const pivotX = cartX;
    const pivotY = groundY - cartHeight;
    const pendulumEndX = pivotX + PENDULUM_LENGTH * SCALE * Math.sin(state.theta);
    const pendulumEndY = pivotY - PENDULUM_LENGTH * SCALE * Math.cos(state.theta);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pivotX + 3, pivotY + 3);
    ctx.lineTo(pendulumEndX + 3, pendulumEndY + 3);
    ctx.stroke();

    const rodGradient = ctx.createLinearGradient(pivotX, pivotY, pendulumEndX, pendulumEndY);
    if (fallen) {
      rodGradient.addColorStop(0, '#aa4444');
      rodGradient.addColorStop(1, '#cc6666');
    } else {
      const angleIntensity = Math.min(1, Math.abs(state.theta) / (Math.PI / 4));
      const r = Math.floor(100 + angleIntensity * 155);
      const g = Math.floor(200 - angleIntensity * 100);
      const b = Math.floor(150 - angleIntensity * 50);
      rodGradient.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
      rodGradient.addColorStop(1, `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 30)})`);
    }
    ctx.strokeStyle = rodGradient;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pendulumEndX, pendulumEndY);
    ctx.stroke();

    // Mass
    ctx.beginPath();
    const massGradient = ctx.createRadialGradient(pendulumEndX - 3, pendulumEndY - 3, 0, pendulumEndX, pendulumEndY, 10);
    if (fallen) {
      massGradient.addColorStop(0, '#dd6666');
      massGradient.addColorStop(1, '#aa4444');
    } else {
      massGradient.addColorStop(0, '#ffdd88');
      massGradient.addColorStop(1, '#cc9944');
    }
    ctx.fillStyle = massGradient;
    ctx.arc(pendulumEndX, pendulumEndY, 10, 0, Math.PI * 2);
    ctx.fill();

    // Pivot
    ctx.beginPath();
    ctx.fillStyle = '#8ab';
    ctx.arc(pivotX, pivotY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Angle arc
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 50, -Math.PI / 2, -Math.PI / 2 + state.theta, state.theta > 0);
    ctx.stroke();

    // Restore context (stop rotation for UI elements and setpoint line)
    ctx.restore();

    // Setpoint line (vertical dashed line at 0 degrees - always vertical, not affected by tilt)
    // Calculate pivot position in non-rotated space
    const cosFloorTilt = Math.cos(floorTilt);
    const sinFloorTilt = Math.sin(floorTilt);
    const dx = pivotX - centerX;
    const dy = pivotY - groundY;
    const rotatedPivotX = centerX + dx * cosFloorTilt - dy * sinFloorTilt;
    const rotatedPivotY = groundY + dx * sinFloorTilt + dy * cosFloorTilt;

    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(rotatedPivotX, rotatedPivotY);
    ctx.lineTo(rotatedPivotX, rotatedPivotY - PENDULUM_LENGTH * SCALE - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Angle display
    const angleDeg = (state.theta * 180 / Math.PI).toFixed(1);
    const tiltDeg = (floorTilt * 180 / Math.PI).toFixed(1);
    ctx.fillStyle = colors.text.primary;
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Angle: ${angleDeg}°`, 20, 30);
    if (Math.abs(floorTilt) > 0.001) {
      ctx.fillStyle = colors.info;
      ctx.fillText(`Tilt: ${tiltDeg}°`, 20, 50);
    }

    // Fallen/Crashed text
    if (fallen) {
      ctx.fillStyle = 'rgba(200, 50, 50, 0.9)';
      ctx.font = 'bold 36px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(failureType === 'crashed' ? 'CRASHED!' : 'FALLEN!', centerX, height * 0.3);
      ctx.font = '18px "JetBrains Mono", monospace';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Press Reset to try again', centerX, height * 0.3 + 35);
    }
  }, [fallen, failureType]);

  // Animation loop
  useEffect(() => {
    if (!isRunning) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    let lastTime = performance.now();
    let accumulator = 0;
    let lastPlotTime = 0;
    let localFallen = false;

    const loop = (currentTime) => {
      const deltaTime = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;
      accumulator += deltaTime;

      let latestPidResult = null;

      while (accumulator >= DT * 1000) {
        const state = stateRef.current;
        const pidResult = computePIDForce();
        latestPidResult = pidResult;
        let force = pidResult.totalForce;

        // Add nudge force based on current time and mode
        force += calculateNudgeForce(state.time);

        // Calculate floor tilt angle
        const floorTilt = calculateTiltAngle(state.time);

        const failureResult = simulateStep(force, localFallen, floorTilt);

        if (failureResult && !localFallen) {
          localFallen = true;
          setFallen(true);
          setFailureType(failureResult);
          setIsRunning(false);
        }

        accumulator -= DT * 1000;
      }

      const state = stateRef.current;
      if (latestPidResult && state.time - lastPlotTime >= 0.05) {
        lastPlotTime = state.time;
        const measured = state.theta * 180 / Math.PI;
        const setpoint = 0;
        setPlotData(prev => ({
          setpointHistory: [...prev.setpointHistory, setpoint],
          measuredHistory: [...prev.measuredHistory, measured],
          errorPHistory: [...prev.errorPHistory, latestPidResult.errorP * 180 / Math.PI],
          errorIHistory: [...prev.errorIHistory, latestPidResult.errorI * 180 / Math.PI],
          errorDHistory: [...prev.errorDHistory, latestPidResult.errorD * 180 / Math.PI],
          forceHistory: [...prev.forceHistory, state.force],
          timeHistory: [...prev.timeHistory, state.time - timeOffsetRef.current]
        }));

        setCurrentForce(state.force);
        setAccumulatedError(pidController.current.getState().integral * 180 / Math.PI);
      }

      if (currentTime - lastRenderRef.current >= RENDER_INTERVAL) {
        render();
        lastRenderRef.current = currentTime;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isRunning, calculateNudgeForce, calculateTiltAngle, computePIDForce, simulateStep, render]);

  useEffect(() => { render(); }, [render]);

  const handleStart = () => {
    if (fallen) {
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
    setAccumulatedError(0);
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
        <div style={{ ...panelStyles.base, padding: '15px', width: '280px', flexShrink: 0, minHeight: '360px', maxHeight: '600px', overflowY: 'auto', boxSizing: 'border-box' }}>

          {/* Simulator Selector + Start/Stop/Reset Buttons */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Simulator Dropdown */}
              {simulators.length > 0 && (
                <select
                  value={activeSimulator}
                  onChange={(e) => onSimulatorChange(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '6px',
                    border: '1px solid rgba(100, 150, 200, 0.4)',
                    background: 'rgba(45, 55, 72, 0.8)',
                    color: '#a0aec0',
                    fontFamily: fonts.mono,
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  {simulators.map(sim => (
                    <option key={sim.id} value={sim.id}>
                      {sim.label}
                    </option>
                  ))}
                </select>
              )}

              {/* Icon Buttons */}
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  style={{
                    ...getButtonStyle('primary'),
                    padding: '8px',
                    minWidth: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Start"
                >
                  ▶
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  style={{
                    ...getButtonStyle('danger'),
                    padding: '8px',
                    minWidth: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Stop"
                >
                  ⏸
                </button>
              )}
              <button
                onClick={handleReset}
                style={{
                  ...getButtonStyle('ghost'),
                  padding: '8px',
                  minWidth: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Reset"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Disturbance Type */}
          <div>
            <h3 style={{ color: colors.text.secondary, fontSize: '12px', marginBottom: '8px', letterSpacing: '2px' }}>
              DISTURBANCE
            </h3>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '12px' }}>
              {Object.entries(DISTURBANCE_TYPES).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => setDisturbanceType(value)}
                  style={{
                    ...buttonStyles.base,
                    padding: '6px 12px',
                    fontSize: '10px',
                    ...(disturbanceType === value
                      ? (value === DISTURBANCE_TYPES.NUDGES ? buttonStyles.accent : value === DISTURBANCE_TYPES.TILTS ? buttonStyles.info : buttonStyles.primary)
                      : buttonStyles.ghost)
                  }}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Nudge-specific controls */}
            {disturbanceType === DISTURBANCE_TYPES.NUDGES && (
              <>
                <Slider
                  label="Amplitude"
                  value={nudgeAmplitude}
                  onChange={setNudgeAmplitude}
                  min={5}
                  max={50}
                  step={1}
                  unit=" N"
                  color={colors.warning}
                />
                <Slider
                  label="Frequency"
                  value={nudgeFrequency}
                  onChange={setNudgeFrequency}
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  unit=" Hz"
                  color={colors.secondary}
                />
              </>
            )}

            {/* Tilt-specific controls */}
            {disturbanceType === DISTURBANCE_TYPES.TILTS && (
              <>
                <Slider
                  label="Amplitude"
                  value={tiltAmplitude}
                  onChange={setTiltAmplitude}
                  min={1}
                  max={15}
                  step={1}
                  unit="°"
                  color={colors.info}
                />
                <Slider
                  label="Frequency"
                  value={tiltFrequency}
                  onChange={setTiltFrequency}
                  min={0.05}
                  max={1.0}
                  step={0.05}
                  unit=" Hz"
                  color={colors.secondary}
                />
              </>
            )}
          </div>
        </div>

        {/* Center: Simulation Window */}
        <div style={{ ...panelStyles.base, padding: '15px', flex: 1, minWidth: 0, height: '360px', display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', boxSizing: 'border-box' }}>
          <canvas
            ref={canvasRef}
            width={600}
            height={330}
            style={{ display: 'block', width: '100%', height: '100%', borderRadius: '8px' }}
          />
        </div>

        {/* Right Control Panel: PID + Force Status */}
        <div style={{ ...panelStyles.base, padding: '15px', width: '280px', flexShrink: 0, height: '360px', overflowY: 'auto', boxSizing: 'border-box' }}>

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

          {/* Force Status Display */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ color: colors.text.muted, fontSize: '9px' }}>FORCE</div>
                <div style={{ color: colors.secondary, fontSize: '14px', fontWeight: 'bold' }}>
                  {currentForce.toFixed(1)}N
                </div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                <div style={{ color: colors.text.muted, fontSize: '9px' }}>ACCUM. ERROR</div>
                <div style={{ color: colors.warning, fontSize: '14px', fontWeight: 'bold' }}>
                  {accumulatedError.toFixed(2)}°
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
            setPlotData({ setpointHistory: [], measuredHistory: [], errorPHistory: [], errorIHistory: [], errorDHistory: [], forceHistory: [], timeHistory: [] });
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
            { data: plotData.setpointHistory, label: 'Setpoint (°)', color: '#00d4ff', sharedAxis: 'angle' },
            { data: plotData.measuredHistory, label: 'Measured (°)', color: '#00ff88', sharedAxis: 'angle' },
            { data: plotData.errorPHistory, label: 'E_P (°)', color: '#ff3366', sharedAxis: 'error', clampedBounds: { min: -90, max: 90 } },
            { data: plotData.errorIHistory, label: 'E_I (°·s)', color: '#9d4edd', sharedAxis: 'error', clampedBounds: { min: -90, max: 90 } },
            { data: plotData.errorDHistory, label: 'E_D (°/s)', color: '#ff6d00', clampedBounds: { min: -90, max: 90 } },
            { data: plotData.forceHistory, label: 'Force (N)', color: '#ffcc00' }
          ]}
          width={1140}
          height={220}
        />
      </div>
    </div>
  );
};

export default InvertedPendulumStandalone;
