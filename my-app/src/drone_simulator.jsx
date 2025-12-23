import React, { useState, useEffect, useRef, useCallback } from 'react';

// Physics constants
const GRAVITY = 9.81; // m/s²
const BASE_DRONE_MASS = 2.0; // kg
const MASS_INCREMENT = 1.0; // 1kg added when button pressed
const MAX_THRUST = 500; // Newtons
const MIN_THRUST = -500; // Newtons (can push down)
const DT = 0.001; // simulation timestep (1ms for accuracy)
const RENDER_INTERVAL = 16; // render at ~60fps
const MAX_ALTITUDE = 100; // meters
const MIN_ALTITUDE = 0; // meters (ground)
const CRASH_CEILING = 100; // crash if hit ceiling
const CRASH_FLOOR = 0; // crash if hit ground
const SETPOINT_MIN = 20; // minimum setpoint
const SETPOINT_MAX = 80; // maximum setpoint

const DroneAltitudeSimulator = () => {
  // State
  const [isRunning, setIsRunning] = useState(false);
  const [controlMode, setControlMode] = useState('pid'); // 'user' or 'pid'
  const [userInput, setUserInput] = useState(0); // -1 to 1 for user control

  // PID parameters
  const [kp, setKp] = useState(25);
  const [ki, setKi] = useState(8);
  const [kd, setKd] = useState(15);

  // Default PID values for reset
  const DEFAULT_KP = 25;
  const DEFAULT_KI = 8;
  const DEFAULT_KD = 15;

  // Physics state
  const stateRef = useRef({
    altitude: 50, // current height in meters (start in middle)
    velocity: 0, // vertical velocity
    mass: BASE_DRONE_MASS,
    setpoint: 50, // target altitude
    integral: 0,
    prevError: 0,
    time: 0,
    thrust: 0,
    massAdded: 0, // number of times mass was added
    crashed: false
  });

  // Timer and score
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentMass, setCurrentMass] = useState(BASE_DRONE_MASS);
  const [setpoint, setSetpointDisplay] = useState(25);
  const [cumulativeError, setCumulativeError] = useState(0);

  // Data for plots
  const [plotData, setPlotData] = useState({
    altitudeHistory: [],
    setpointHistory: [],
    thrustHistory: [],
    errorHistory: [],
    timeHistory: []
  });

  // Reset simulation
  const resetSimulation = useCallback(() => {
    stateRef.current = {
      altitude: 50,
      velocity: 0,
      mass: BASE_DRONE_MASS,
      setpoint: 50,
      integral: 0,
      prevError: 0,
      time: 0,
      thrust: 0,
      massAdded: 0,
      crashed: false
    };
    setPlotData({
      altitudeHistory: [],
      setpointHistory: [],
      thrustHistory: [],
      errorHistory: [],
      timeHistory: []
    });
    setElapsedTime(0);
    setCurrentMass(BASE_DRONE_MASS);
    setSetpointDisplay(50);
    setCumulativeError(0);
  }, []);

  // Change setpoint to random value
  const changeSetpoint = useCallback(() => {
    if (stateRef.current.crashed) return;
    const newSetpoint = SETPOINT_MIN + Math.random() * (SETPOINT_MAX - SETPOINT_MIN);
    stateRef.current.setpoint = newSetpoint;
    stateRef.current.integral = 0; // Reset integral to prevent windup
    setSetpointDisplay(newSetpoint);
  }, []);

  // Add weight to drone
  const addWeight = useCallback(() => {
    if (stateRef.current.crashed) return;
    stateRef.current.mass += MASS_INCREMENT;
    stateRef.current.massAdded += 1;
    setCurrentMass(stateRef.current.mass);
  }, []);

  // Reset PID gains to defaults
  const resetPIDGains = useCallback(() => {
    setKp(DEFAULT_KP);
    setKi(DEFAULT_KI);
    setKd(DEFAULT_KD);
  }, []);

  // Physics simulation
  const simulateStep = useCallback((controlSignal) => {
    const state = stateRef.current;
    if (state.crashed) return;

    // Clamp control signal
    controlSignal = Math.max(MIN_THRUST, Math.min(MAX_THRUST, controlSignal));
    state.thrust = controlSignal; // Store control signal for display (centered at 0)

    const { altitude, velocity, mass } = state;

    // Base hover thrust compensates for initial drone mass only (~20N for 2kg)
    const baseHoverThrust = BASE_DRONE_MASS * GRAVITY;
    
    // Actual thrust applied is base hover + control signal
    const actualThrust = baseHoverThrust + controlSignal;

    // Forces: 
    // - Thrust acts upward (positive)
    // - Gravity acts downward (negative)
    const gravityForce = mass * GRAVITY;
    
    // Net force: thrust up, gravity down
    const netForce = actualThrust - gravityForce;

    // Acceleration (F = ma, so a = F/m)
    const acceleration = mass > 0 ? netForce / mass : 0;

    // Update state using Euler integration
    state.velocity += acceleration * DT;
    state.altitude += state.velocity * DT;
    state.time += DT;

    // Crash detection
    if (state.altitude <= CRASH_FLOOR || state.altitude >= CRASH_CEILING) {
      state.crashed = true;
      state.altitude = Math.max(CRASH_FLOOR, Math.min(CRASH_CEILING, state.altitude));
      state.velocity = 0;
    }
  }, []);

  // PID Controller
  const computePIDThrust = useCallback(() => {
    const state = stateRef.current;

    // Error is the difference from setpoint
    const error = state.setpoint - state.altitude;

    // Update integral (with anti-windup)
    state.integral += error * DT;
    state.integral = Math.max(-50, Math.min(50, state.integral));

    // Derivative (of error, which is negative of velocity when setpoint is constant)
    const derivative = (error - state.prevError) / DT;
    state.prevError = error;

    // PID output only - no feedforward compensation for added mass
    // The integral term must compensate for any added weight
    const pidOutput = kp * error + ki * state.integral + kd * derivative;

    return pidOutput;
  }, [kp, ki, kd]);

  // Canvas ref
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastRenderRef = useRef(0);

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas with sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, '#1a1a2e');
    skyGradient.addColorStop(0.5, '#16213e');
    skyGradient.addColorStop(1, '#1f4037');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw danger zones (0-20m and 80-100m)
    const dangerTopY = height - (CRASH_CEILING / MAX_ALTITUDE) * (height - 60) - 30;
    const safeTopY = height - (SETPOINT_MAX / MAX_ALTITUDE) * (height - 60) - 30;
    const safeBottomY = height - (SETPOINT_MIN / MAX_ALTITUDE) * (height - 60) - 30;
    const dangerBottomY = height - (CRASH_FLOOR / MAX_ALTITUDE) * (height - 60) - 30;

    // Top danger zone
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(50, dangerTopY, width - 70, safeTopY - dangerTopY);

    // Bottom danger zone
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(50, safeBottomY, width - 70, dangerBottomY - safeBottomY);

    // Draw altitude markers
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

    // Draw safe zone boundaries
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(50, safeTopY);
    ctx.lineTo(width - 20, safeTopY);
    ctx.moveTo(50, safeBottomY);
    ctx.lineTo(width - 20, safeBottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels for danger zones
    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DANGER ZONE', width / 2, safeTopY - 5);
    ctx.fillText('DANGER ZONE', width / 2, safeBottomY + 12);

    const state = stateRef.current;
    const droneX = width / 2;
    const droneY = height - (state.altitude / MAX_ALTITUDE) * (height - 60) - 30;
    const setpointY = height - (state.setpoint / MAX_ALTITUDE) * (height - 60) - 30;

    // Draw setpoint line
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(80, setpointY);
    ctx.lineTo(width - 40, setpointY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Setpoint label
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`TARGET: ${state.setpoint.toFixed(1)}m`, width - 140, setpointY - 8);

    // Draw ground
    const groundGradient = ctx.createLinearGradient(0, height - 30, 0, height);
    groundGradient.addColorStop(0, '#2d5a3d');
    groundGradient.addColorStop(1, '#1a3d2a');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, height - 30, width, 30);

    // Ground pattern
    ctx.strokeStyle = 'rgba(50, 100, 70, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, height - 30);
      ctx.lineTo(i + 10, height);
      ctx.stroke();
    }

    // Draw thrust visualization (flame/jet effect)
    if (state.thrust > 0) {
      const thrustIntensity = state.thrust / MAX_THRUST;
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

      // Inner flame
      ctx.fillStyle = `rgba(255, 255, 200, ${0.5 * thrustIntensity})`;
      ctx.beginPath();
      ctx.moveTo(droneX - 6, droneY + 15);
      ctx.lineTo(droneX + 6, droneY + 15);
      ctx.lineTo(droneX, droneY + 15 + flameHeight * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    // Draw downward thrust (blue effect)
    if (state.thrust < 0) {
      const thrustIntensity = Math.abs(state.thrust) / Math.abs(MIN_THRUST);
      const jetHeight = 10 + thrustIntensity * 20;

      ctx.fillStyle = `rgba(100, 150, 255, ${0.6 * thrustIntensity})`;
      ctx.beginPath();
      ctx.moveTo(droneX - 10, droneY - 12);
      ctx.lineTo(droneX + 10, droneY - 12);
      ctx.lineTo(droneX + 3, droneY - 12 - jetHeight);
      ctx.lineTo(droneX - 3, droneY - 12 - jetHeight);
      ctx.closePath();
      ctx.fill();
    }

    // Draw drone body
    // Main body
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

    // Drone arms
    ctx.strokeStyle = state.crashed ? '#450a0a' : '#2d3748';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(droneX - 20, droneY);
    ctx.lineTo(droneX - 40, droneY - 8);
    ctx.moveTo(droneX + 20, droneY);
    ctx.lineTo(droneX + 40, droneY - 8);
    ctx.stroke();

    // Propellers (spinning effect) - don't spin if crashed
    if (!state.crashed) {
      const propAngle = (state.time * 50) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.7)';
      ctx.lineWidth = 2;

      [-40, 40].forEach(offset => {
        ctx.beginPath();
        ctx.ellipse(droneX + offset, droneY - 8, 15, 3, propAngle, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // Propeller hubs
    ctx.fillStyle = state.crashed ? '#450a0a' : '#1a202c';
    [-40, 40].forEach(offset => {
      ctx.beginPath();
      ctx.arc(droneX + offset, droneY - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // LED indicator
    const error = Math.abs(state.setpoint - state.altitude);
    const ledColor = state.crashed ? '#ef4444' : error < 1 ? '#4ade80' : error < 3 ? '#fbbf24' : '#ef4444';
    ctx.fillStyle = ledColor;
    ctx.shadowColor = ledColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(droneX, droneY - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Mass indicator (show added weights)
    if (state.massAdded > 0) {
      ctx.fillStyle = '#805ad5';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`+${(state.massAdded * MASS_INCREMENT).toFixed(1)}kg`, droneX, droneY + 28);
    }

    // Current altitude display
    ctx.fillStyle = state.crashed ? '#ef4444' : '#e2e8f0';
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.altitude.toFixed(1)}m`, droneX, droneY - 25);

    // Crashed indicator
    if (state.crashed) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.font = 'bold 32px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRASHED!', width / 2, height / 2 - 20);
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillStyle = '#a0aec0';
      ctx.fillText('Press Reset to try again', width / 2, height / 2 + 15);
    }

    // Thrust indicator bar on the side
    const barX = width - 35;
    const barHeight = height - 80;
    const barY = 40;

    // Bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(barX - 10, barY, 20, barHeight);

    // Zero line
    const zeroY = barY + barHeight * (MAX_THRUST / (MAX_THRUST - MIN_THRUST));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barX - 12, zeroY);
    ctx.lineTo(barX + 12, zeroY);
    ctx.stroke();

    // Thrust fill
    const thrustNormalized = (state.thrust - MIN_THRUST) / (MAX_THRUST - MIN_THRUST);
    const thrustBarHeight = thrustNormalized * barHeight;
    const thrustColor = state.thrust >= 0 ? '#f6ad55' : '#63b3ed';

    ctx.fillStyle = thrustColor;
    if (state.thrust >= 0) {
      ctx.fillRect(barX - 8, zeroY - (thrustNormalized - (Math.abs(MIN_THRUST) / (MAX_THRUST - MIN_THRUST))) * barHeight, 16, (state.thrust / (MAX_THRUST - MIN_THRUST)) * barHeight);
    } else {
      ctx.fillRect(barX - 8, zeroY, 16, (Math.abs(state.thrust) / (MAX_THRUST - MIN_THRUST)) * barHeight);
    }

    // Thrust label
    ctx.fillStyle = '#a0aec0';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('THRUST', barX, barY - 10);
    ctx.fillText(`${state.thrust.toFixed(0)}N`, barX, barY + barHeight + 15);

  }, []);

  // Main animation loop
  useEffect(() => {
    if (!isRunning) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    let lastTime = performance.now();
    let accumulator = 0;
    let errorAccumulator = 0;
    let lastPlotTime = 0;

    const loop = (currentTime) => {
      const deltaTime = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;
      accumulator += deltaTime;

      while (accumulator >= DT * 1000) {
        let thrust = 0;

        if (controlMode === 'pid') {
          thrust = computePIDThrust();
        } else {
          // User control: userInput is -1 to 1 from slider, map to ±500N
          // 0 = hover (for base mass only - user must compensate for added mass!)
          thrust = userInput * 500;
        }

        simulateStep(thrust);

        // Accumulate error for scoring
        const error = Math.abs(stateRef.current.setpoint - stateRef.current.altitude);
        errorAccumulator += error * DT;

        accumulator -= DT * 1000;
      }

      // Update display state every 50ms (20 times per second)
      const state = stateRef.current;
      if (state.time - lastPlotTime >= 0.05) {
        lastPlotTime = state.time;
        setPlotData(prev => {
          const maxPoints = 200;
          return {
            altitudeHistory: [...prev.altitudeHistory.slice(-maxPoints), state.altitude],
            setpointHistory: [...prev.setpointHistory.slice(-maxPoints), state.setpoint],
            thrustHistory: [...prev.thrustHistory.slice(-maxPoints), state.thrust],
            errorHistory: [...prev.errorHistory.slice(-maxPoints), state.setpoint - state.altitude],
            timeHistory: [...prev.timeHistory.slice(-maxPoints), state.time]
          };
        });
        setElapsedTime(state.time);
        setCurrentMass(state.mass);
        setSetpointDisplay(state.setpoint);
        setCumulativeError(errorAccumulator);
      }

      if (currentTime - lastRenderRef.current >= RENDER_INTERVAL) {
        render();
        lastRenderRef.current = currentTime;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, controlMode, userInput, computePIDThrust, simulateStep, render]);

  // Initial render
  useEffect(() => {
    render();
  }, [render]);

  // Keyboard controls for user mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (controlMode !== 'user') return;
      if (e.key === 'ArrowUp' || e.key === 'w') {
        setUserInput(1);
      } else if (e.key === 'ArrowDown' || e.key === 's') {
        setUserInput(-1);
      }
    };

    const handleKeyUp = (e) => {
      if (controlMode !== 'user') return;
      if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) {
        setUserInput(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [controlMode]);

  // Mini chart component
  const MiniChart = ({ data, data2, label, unit, color, color2, min, max }) => {
    const chartWidth = 200;
    const chartHeight = 60;

    if (data.length < 2) return (
      <div className="flex flex-col">
        <span style={{ color: '#8ab', fontSize: '11px', fontFamily: '"JetBrains Mono", monospace' }}>{label}</span>
        <div style={{ width: chartWidth, height: chartHeight, background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }} />
      </div>
    );

    const dataMin = min ?? Math.min(...data);
    const dataMax = max ?? Math.max(...data);
    const range = dataMax - dataMin || 1;

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * chartWidth;
      const y = chartHeight - ((v - dataMin) / range) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    let points2 = '';
    if (data2 && data2.length >= 2) {
      points2 = data2.map((v, i) => {
        const x = (i / (data2.length - 1)) * chartWidth;
        const y = chartHeight - ((v - dataMin) / range) * chartHeight;
        return `${x},${y}`;
      }).join(' ');
    }

    const current = data[data.length - 1];

    return (
      <div className="flex flex-col">
        <div className="flex justify-between items-center" style={{ width: chartWidth }}>
          <span style={{ color: '#8ab', fontSize: '11px', fontFamily: '"JetBrains Mono", monospace' }}>{label}</span>
          <span style={{ color: color, fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 'bold' }}>
            {current.toFixed(1)}{unit}
          </span>
        </div>
        <svg width={chartWidth} height={chartHeight} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
          {min !== undefined && max !== undefined && (
            <line
              x1="0"
              y1={chartHeight - ((0 - min) / (max - min)) * chartHeight}
              x2={chartWidth}
              y2={chartHeight - ((0 - min) / (max - min)) * chartHeight}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="4"
            />
          )}
          {points2 && (
            <polyline
              points={points2}
              fill="none"
              stroke={color2}
              strokeWidth="2"
              strokeDasharray="4"
            />
          )}
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        </svg>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      padding: '20px',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#e2e8f0',
          marginBottom: '5px',
          letterSpacing: '2px'
        }}>
          DRONE ALTITUDE
          <span style={{ color: '#f6ad55', marginLeft: '10px' }}>PID CONTROLLER</span>
        </h1>
        <p style={{ color: '#718096', fontSize: '13px' }}>
          Track the setpoint • Add weight to increase difficulty • Stay in the safe zone!
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-5">
        {/* Main visualization */}
        <div style={{
          background: 'rgba(26, 32, 44, 0.8)',
          borderRadius: '12px',
          padding: '15px',
          border: '1px solid rgba(100, 150, 200, 0.2)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)'
        }}>
          <canvas
            ref={canvasRef}
            width={500}
            height={450}
            style={{ borderRadius: '8px' }}
          />

          {/* Control buttons */}
          <div className="flex justify-center gap-3 mt-4 flex-wrap">
            <button
              onClick={() => setIsRunning(!isRunning)}
              style={{
                padding: '12px 30px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: isRunning
                  ? 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)'
                  : 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                color: '#fff',
                letterSpacing: '1px',
                transition: 'transform 0.1s',
                fontFamily: 'inherit'
              }}
            >
              {isRunning ? '⏹ STOP' : '▶ START'}
            </button>

            <button
              onClick={changeSetpoint}
              disabled={!isRunning || stateRef.current.crashed}
              style={{
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: (!isRunning || stateRef.current.crashed) ? 'not-allowed' : 'pointer',
                background: (!isRunning || stateRef.current.crashed)
                  ? 'rgba(80, 80, 100, 0.4)'
                  : 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
                color: (!isRunning || stateRef.current.crashed) ? '#666' : '#fff',
                letterSpacing: '1px',
                transition: 'transform 0.1s',
                fontFamily: 'inherit'
              }}
            >
              🎯 NEW TARGET
            </button>

            <button
              onClick={addWeight}
              disabled={!isRunning || stateRef.current.crashed}
              style={{
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: (!isRunning || stateRef.current.crashed) ? 'not-allowed' : 'pointer',
                background: (!isRunning || stateRef.current.crashed)
                  ? 'rgba(80, 80, 100, 0.4)'
                  : 'linear-gradient(135deg, #805ad5 0%, #6b46c1 100%)',
                color: (!isRunning || stateRef.current.crashed) ? '#666' : '#fff',
                letterSpacing: '1px',
                transition: 'transform 0.1s',
                fontFamily: 'inherit'
              }}
            >
              ⚖️ ADD WEIGHT
            </button>

            <button
              onClick={resetSimulation}
              style={{
                padding: '12px 30px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '6px',
                border: '1px solid rgba(100, 150, 200, 0.4)',
                cursor: 'pointer',
                background: 'rgba(45, 55, 72, 0.6)',
                color: '#a0aec0',
                letterSpacing: '1px',
                fontFamily: 'inherit'
              }}
            >
              ↺ RESET
            </button>
          </div>
        </div>

        {/* Control Panel */}
        <div style={{
          background: 'rgba(26, 32, 44, 0.8)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(100, 150, 200, 0.2)',
          width: '280px'
        }}>
          <h2 style={{ color: '#e2e8f0', fontSize: '14px', marginBottom: '15px', letterSpacing: '2px' }}>
            CONTROL MODE
          </h2>

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setControlMode('pid')}
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '5px',
                border: controlMode === 'pid' ? '2px solid #f6ad55' : '1px solid rgba(100, 150, 200, 0.3)',
                cursor: 'pointer',
                background: controlMode === 'pid' ? 'rgba(246, 173, 85, 0.2)' : 'rgba(45, 55, 72, 0.3)',
                color: controlMode === 'pid' ? '#f6ad55' : '#718096',
                fontFamily: 'inherit'
              }}
            >
              PID AUTO
            </button>
            <button
              onClick={() => setControlMode('user')}
              style={{
                flex: 1,
                padding: '10px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '5px',
                border: controlMode === 'user' ? '2px solid #63b3ed' : '1px solid rgba(100, 150, 200, 0.3)',
                cursor: 'pointer',
                background: controlMode === 'user' ? 'rgba(99, 179, 237, 0.2)' : 'rgba(45, 55, 72, 0.3)',
                color: controlMode === 'user' ? '#63b3ed' : '#718096',
                fontFamily: 'inherit'
              }}
            >
              MANUAL
            </button>
          </div>

          {controlMode === 'pid' ? (
            <>
              <div className="flex justify-between items-center" style={{ marginBottom: '12px' }}>
                <h3 style={{ color: '#a0aec0', fontSize: '12px', margin: 0 }}>PID PARAMETERS</h3>
                <button
                  onClick={resetPIDGains}
                  style={{
                    padding: '5px 12px',
                    fontSize: '10px',
                    fontWeight: '600',
                    borderRadius: '4px',
                    border: '1px solid rgba(100, 150, 200, 0.3)',
                    cursor: 'pointer',
                    background: 'rgba(45, 55, 72, 0.4)',
                    color: '#a0aec0',
                    fontFamily: 'inherit'
                  }}
                >
                  RESET GAINS
                </button>
              </div>

              {[
                { label: 'Kp (Proportional)', value: kp, set: setKp, min: 0, max: 100, color: '#f6ad55' },
                { label: 'Ki (Integral)', value: ki, set: setKi, min: 0, max: 50, color: '#68d391' },
                { label: 'Kd (Derivative)', value: kd, set: setKd, min: 0, max: 50, color: '#63b3ed' }
              ].map(param => (
                <div key={param.label} style={{ marginBottom: '15px' }}>
                  <div className="flex justify-between" style={{ marginBottom: '5px' }}>
                    <label style={{ color: '#718096', fontSize: '11px' }}>{param.label}</label>
                    <span style={{ color: param.color, fontSize: '13px', fontWeight: 'bold' }}>{param.value}</span>
                  </div>
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    value={param.value}
                    onChange={e => param.set(Number(e.target.value))}
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      accentColor: param.color
                    }}
                  />
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: '10px 0' }}>
              <h3 style={{ color: '#a0aec0', fontSize: '12px', marginBottom: '15px', textAlign: 'center' }}>
                THRUST CONTROL
              </h3>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  flex: 1
                }}>
                  <span style={{ color: '#68d391', fontSize: '10px', marginBottom: '5px' }}>+500N</span>
                  <input
                    type="range"
                    min={-500}
                    max={500}
                    value={userInput * 500}
                    onChange={e => setUserInput(Number(e.target.value) / 500)}
                    style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      accentColor: userInput >= 0 ? '#f6ad55' : '#63b3ed',
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      height: '150px',
                      width: '30px'
                    }}
                  />
                  <span style={{ color: '#63b3ed', fontSize: '10px', marginTop: '5px' }}>-500N</span>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    padding: '10px 15px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}>
                    <div style={{ color: '#718096', fontSize: '10px', marginBottom: '3px' }}>THRUST</div>
                    <div style={{ 
                      color: userInput >= 0 ? '#f6ad55' : '#63b3ed', 
                      fontSize: '18px', 
                      fontWeight: 'bold' 
                    }}>
                      {(userInput * 500).toFixed(1)}N
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setUserInput(0)}
                    style={{
                      padding: '8px 20px',
                      fontSize: '11px',
                      fontWeight: '600',
                      borderRadius: '4px',
                      border: '1px solid rgba(100, 150, 200, 0.3)',
                      cursor: 'pointer',
                      background: 'rgba(45, 55, 72, 0.6)',
                      color: '#a0aec0',
                      fontFamily: 'inherit'
                    }}
                  >
                    CENTER (0)
                  </button>
                </div>
              </div>
              
              <p style={{ color: '#4a5568', fontSize: '10px', marginTop: '15px', textAlign: 'center' }}>
                Drag slider to adjust thrust<br/>
                0 = hover (base mass only)<br/>
                You must compensate for added weight!
              </p>
            </div>
          )}

          {/* Status display */}
          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px'
          }}>
            <h3 style={{ color: '#a0aec0', fontSize: '11px', marginBottom: '12px', letterSpacing: '1px' }}>
              STATUS
            </h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Time</span>
                <span style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 'bold' }}>{elapsedTime.toFixed(1)}s</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Mass</span>
                <span style={{ color: '#805ad5', fontSize: '12px', fontWeight: 'bold' }}>{currentMass.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Target</span>
                <span style={{ color: '#ff6b6b', fontSize: '12px', fontWeight: 'bold' }}>{setpoint.toFixed(1)} m</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Cumulative Error</span>
                <span style={{ color: '#fbbf24', fontSize: '12px', fontWeight: 'bold' }}>{cumulativeError.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts panel */}
        <div style={{
          background: 'rgba(26, 32, 44, 0.8)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(100, 150, 200, 0.2)'
        }}>
          <h2 style={{ color: '#e2e8f0', fontSize: '14px', marginBottom: '15px', letterSpacing: '2px' }}>
            SIGNAL HISTORY
          </h2>

          <div className="flex flex-col gap-4">
            <MiniChart
              data={plotData.altitudeHistory}
              data2={plotData.setpointHistory}
              label="ALTITUDE vs TARGET"
              unit=" m"
              color="#4ade80"
              color2="#ff6b6b"
              min={0}
              max={100}
            />
            <MiniChart
              data={plotData.errorHistory}
              label="ERROR"
              unit=" m"
              color="#fbbf24"
              min={-40}
              max={40}
            />
            <MiniChart
              data={plotData.thrustHistory}
              label="THRUST"
              unit=" N"
              color="#f6ad55"
              min={-500}
              max={500}
            />
          </div>

          {/* Physics info */}
          <div style={{
            marginTop: '20px',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            fontSize: '10px',
            color: '#4a5568'
          }}>
            <div style={{ marginBottom: '5px', color: '#718096' }}>SYSTEM PARAMETERS</div>
            <div>Base mass: {BASE_DRONE_MASS} kg</div>
            <div>Hover thrust: {(BASE_DRONE_MASS * GRAVITY).toFixed(1)} N</div>
            <div>Weight increment: +{MASS_INCREMENT} kg</div>
            <div>Safe zone: {SETPOINT_MIN}-{SETPOINT_MAX}m</div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div style={{
        textAlign: 'center',
        marginTop: '25px',
        color: '#4a5568',
        fontSize: '11px'
      }}>
        <p>
          Physics: F = T - mg • Safe zone: 20-80m • Crash at 0m or 100m
        </p>
      </div>
    </div>
  );
};

export default DroneAltitudeSimulator;