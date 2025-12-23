import React, { useState, useEffect, useRef, useCallback } from 'react';

// Physics constants
const GRAVITY = 9.81; // m/s²
const PENDULUM_LENGTH = 2.0; // meters (doubled)
const PENDULUM_MASS = 0.25; // kg (halved)
const CART_MASS = 1.0; // kg
const FRICTION_CART = 0.1; // cart friction coefficient
const FRICTION_PENDULUM = 0.01; // pendulum friction coefficient
const NOISE_AMPLITUDE = 0.002; // small random disturbance (radians)
const DT = 0.001; // simulation timestep (1ms for accuracy)
const RENDER_INTERVAL = 16; // render at ~60fps
const TRACK_WIDTH = 10.0; // meters (total track width, ±5m)

// Scale factors for rendering
const SCALE = 65; // pixels per meter (reduced to fit ±5m track)

const InvertedPendulumSimulator = () => {
  // State
  const [isRunning, setIsRunning] = useState(false);
  const [controlMode, setControlMode] = useState('pid'); // 'user' or 'pid'
  const [userInput, setUserInput] = useState(0); // -1 to 1 for user control

  // PID parameters
  const [kp, setKp] = useState(150);
  const [ki, setKi] = useState(20);
  const [kd, setKd] = useState(40);

  // Default PID values for reset
  const DEFAULT_KP = 150;
  const DEFAULT_KI = 20;
  const DEFAULT_KD = 40;

  // Nudge and timer state
  const [nudgeForce, setNudgeForce] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [bestTime, setBestTime] = useState(0);

  // Physics state (using refs for performance in animation loop)
  const stateRef = useRef({
    theta: 0.05, // angle from vertical (radians), small initial offset
    thetaDot: 0, // angular velocity
    x: 0, // cart position
    xDot: 0, // cart velocity
    integral: 0, // PID integral term
    prevError: 0, // for derivative term
    time: 0,
    fallen: false
  });

  // Canvas ref
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastRenderRef = useRef(0);

  // Data for plots
  const [plotData, setPlotData] = useState({
    angleHistory: [],
    positionHistory: [],
    forceHistory: [],
    timeHistory: []
  });

  // Reset simulation
  const resetSimulation = useCallback(() => {
    stateRef.current = {
      theta: (Math.random() - 0.5) * 0.1, // random small angle
      thetaDot: 0,
      x: 0,
      xDot: 0,
      integral: 0,
      prevError: 0,
      time: 0,
      fallen: false
    };
    setPlotData({
      angleHistory: [],
      positionHistory: [],
      forceHistory: [],
      timeHistory: []
    });
    setElapsedTime(0);
    setNudgeForce(0);
  }, []);

  // Reset PID gains to defaults
  const resetPIDGains = useCallback(() => {
    setKp(DEFAULT_KP);
    setKi(DEFAULT_KI);
    setKd(DEFAULT_KD);
  }, []);

  // Nudge function - applies fixed impulse
  const applyNudge = useCallback(() => {
    setNudgeForce(50); // fixed 50N nudge
    // Clear nudge after 200ms
    setTimeout(() => setNudgeForce(0), 200);
  }, []);

  // Physics simulation using Euler's method with small timestep
  // Equations of motion for inverted pendulum on cart:
  // (M + m)ẍ + mlθ̈cosθ - mlθ̇²sinθ = F - bẋ
  // lθ̈ + ẍcosθ - gsinθ = -cθ̇
  const simulateStep = useCallback((force) => {
    const state = stateRef.current;
    if (state.fallen) return;

    const m = PENDULUM_MASS;
    const M = CART_MASS;
    const l = PENDULUM_LENGTH;
    const g = GRAVITY;
    const b = FRICTION_CART;
    const c = FRICTION_PENDULUM;

    const { theta, thetaDot, x, xDot } = state;

    // Add small noise to create instability
    const noise = (Math.random() - 0.5) * 2 * NOISE_AMPLITUDE;

    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    // Solve coupled equations of motion
    // Using the standard inverted pendulum equations:
    // θ̈ = (g*sin(θ) + cos(θ)*(-F - m*l*θ̇²*sin(θ) + b*ẋ)/(M+m) - c*θ̇/m/l) / (l*(4/3 - m*cos²(θ)/(M+m)))
    // ẍ = (F + m*l*(θ̇²*sin(θ) - θ̈*cos(θ)) - b*ẋ) / (M + m)

    const denom = l * (4.0 / 3.0 - (m * cosTheta * cosTheta) / (M + m));
    const thetaDDot = (g * sinTheta +
      cosTheta * ((-force - m * l * thetaDot * thetaDot * sinTheta + b * xDot) / (M + m)) -
      c * thetaDot / (m * l) + noise) / denom;

    const xDDot = (force + m * l * (thetaDot * thetaDot * sinTheta - thetaDDot * cosTheta) - b * xDot) / (M + m);

    // Update state using Euler integration
    state.thetaDot += thetaDDot * DT;
    state.theta += state.thetaDot * DT;
    state.xDot += xDDot * DT;
    state.x += state.xDot * DT;
    state.time += DT;

    // Normalize angle to [-π, π]
    while (state.theta > Math.PI) state.theta -= 2 * Math.PI;
    while (state.theta < -Math.PI) state.theta += 2 * Math.PI;

    // Check for failure conditions
    if (Math.abs(state.theta) > Math.PI / 2) {
      state.fallen = true;
    }

    // Bounce off track limits
    if (Math.abs(state.x) > TRACK_WIDTH / 2 - 0.2) {
      state.x = Math.sign(state.x) * (TRACK_WIDTH / 2 - 0.2);
      state.xDot = -state.xDot * 0.5; // bounce with energy loss
    }
  }, []);

  // PID Controller
  const computePIDForce = useCallback(() => {
    const state = stateRef.current;

    // Error is the angle from vertical
    const error = state.theta;

    // Update integral (with anti-windup)
    state.integral += error * DT;
    state.integral = Math.max(-10, Math.min(10, state.integral));

    // Derivative
    const derivative = (error - state.prevError) / DT;
    state.prevError = error;

    // Also add position control to keep cart centered
    const positionError = state.x;
    const positionDerivative = state.xDot;

    // Combined control: angle is primary, position is secondary
    const angleForce = kp * error + ki * state.integral + kd * derivative;
    const positionForce = 20 * positionError + 10 * positionDerivative;

    const totalForce = angleForce + positionForce;

    // Limit force
    return Math.max(-50, Math.min(50, totalForce));
  }, [kp, ki, kd]);

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0a0f1a');
    bgGradient.addColorStop(1, '#1a1f2e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
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

    // Draw track
    ctx.strokeStyle = '#4a6fa5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX - TRACK_WIDTH / 2 * SCALE, groundY);
    ctx.lineTo(centerX + TRACK_WIDTH / 2 * SCALE, groundY);
    ctx.stroke();

    // Track markers
    ctx.strokeStyle = '#3a5a8a';
    ctx.lineWidth = 2;
    for (let i = -5; i <= 5; i++) {
      const markerX = centerX + i * SCALE;
      ctx.beginPath();
      ctx.moveTo(markerX, groundY - 5);
      ctx.lineTo(markerX, groundY + 5);
      ctx.stroke();

      if (i % 2 === 0) { // Only label every 2m to avoid crowding
        ctx.fillStyle = '#6a8ab5';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${i}m`, markerX, groundY + 20);
      }
    }

    // Cart position in pixels
    const cartX = centerX + state.x * SCALE;
    const cartWidth = 80;
    const cartHeight = 40;

    // Draw cart shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(cartX - cartWidth / 2 + 5, groundY - cartHeight + 5, cartWidth, cartHeight);

    // Draw cart
    const cartGradient = ctx.createLinearGradient(cartX - cartWidth / 2, groundY - cartHeight, cartX - cartWidth / 2, groundY);
    cartGradient.addColorStop(0, '#5a7a9a');
    cartGradient.addColorStop(1, '#3a5a7a');
    ctx.fillStyle = cartGradient;
    ctx.fillRect(cartX - cartWidth / 2, groundY - cartHeight, cartWidth, cartHeight);

    // Cart border
    ctx.strokeStyle = '#7a9aba';
    ctx.lineWidth = 2;
    ctx.strokeRect(cartX - cartWidth / 2, groundY - cartHeight, cartWidth, cartHeight);

    // Wheels
    ctx.fillStyle = '#2a3a4a';
    ctx.beginPath();
    ctx.arc(cartX - 25, groundY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cartX + 25, groundY, 10, 0, Math.PI * 2);
    ctx.fill();

    // Pendulum pivot point
    const pivotX = cartX;
    const pivotY = groundY - cartHeight;

    // Pendulum end point (note: theta=0 is vertical up, positive is clockwise)
    const pendulumEndX = pivotX + PENDULUM_LENGTH * SCALE * Math.sin(state.theta);
    const pendulumEndY = pivotY - PENDULUM_LENGTH * SCALE * Math.cos(state.theta);

    // Draw pendulum rod shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pivotX + 3, pivotY + 3);
    ctx.lineTo(pendulumEndX + 3, pendulumEndY + 3);
    ctx.stroke();

    // Draw pendulum rod
    const rodGradient = ctx.createLinearGradient(pivotX, pivotY, pendulumEndX, pendulumEndY);
    if (state.fallen) {
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

    // Draw pendulum mass
    ctx.beginPath();
    const massGradient = ctx.createRadialGradient(pendulumEndX - 3, pendulumEndY - 3, 0, pendulumEndX, pendulumEndY, 10);
    if (state.fallen) {
      massGradient.addColorStop(0, '#dd6666');
      massGradient.addColorStop(1, '#aa4444');
    } else {
      massGradient.addColorStop(0, '#ffdd88');
      massGradient.addColorStop(1, '#cc9944');
    }
    ctx.fillStyle = massGradient;
    ctx.arc(pendulumEndX, pendulumEndY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = state.fallen ? '#cc5555' : '#ddaa55';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw pivot
    ctx.beginPath();
    ctx.fillStyle = '#8ab';
    ctx.arc(pivotX, pivotY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Draw angle indicator arc
    ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 50, -Math.PI / 2, -Math.PI / 2 + state.theta, state.theta > 0);
    ctx.stroke();

    // Fallen indicator
    if (state.fallen) {
      ctx.fillStyle = 'rgba(200, 50, 50, 0.9)';
      ctx.font = 'bold 36px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FALLEN!', centerX, height * 0.3);
      ctx.font = '18px "JetBrains Mono", monospace';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Press Reset to try again', centerX, height * 0.3 + 35);
    }

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

    const loop = (currentTime) => {
      const deltaTime = Math.min(currentTime - lastTime, 50); // cap at 50ms
      lastTime = currentTime;
      accumulator += deltaTime;

      // Physics updates (multiple steps per frame for accuracy)
      while (accumulator >= DT * 1000) {
        let force = 0;

        if (controlMode === 'pid') {
          force = computePIDForce();
        } else {
          // User control: map input to force
          force = userInput * 30; // max 30N
        }

        // Add nudge force
        force += nudgeForce;

        simulateStep(force);

        // Update plot data less frequently
        const state = stateRef.current;
        if (Math.floor(state.time * 20) !== Math.floor((state.time - DT) * 20)) {
          setPlotData(prev => {
            const maxPoints = 200;
            return {
              angleHistory: [...prev.angleHistory.slice(-maxPoints), state.theta * 180 / Math.PI],
              positionHistory: [...prev.positionHistory.slice(-maxPoints), state.x],
              forceHistory: [...prev.forceHistory.slice(-maxPoints), force],
              timeHistory: [...prev.timeHistory.slice(-maxPoints), state.time]
            };
          });

          // Update elapsed time display
          if (!state.fallen) {
            setElapsedTime(state.time);
          }
        }

        // Check for new best time when fallen
        if (state.fallen && state.time > bestTime) {
          setBestTime(state.time);
        }

        accumulator -= DT * 1000;
      }

      // Render at display refresh rate
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
  }, [isRunning, controlMode, userInput, nudgeForce, bestTime, computePIDForce, simulateStep, render]);

  // Initial render
  useEffect(() => {
    render();
  }, [render]);

  // Keyboard controls for user mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (controlMode !== 'user') return;
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        setUserInput(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        setUserInput(1);
      }
    };

    const handleKeyUp = (e) => {
      if (controlMode !== 'user') return;
      if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) {
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
  const MiniChart = ({ data, label, unit, color, min, max }) => {
    const chartWidth = 180;
    const chartHeight = 60;

    if (data.length < 2) return (
      <div className="flex flex-col">
        <span style={{ color: '#8aa', fontSize: '11px', fontFamily: '"JetBrains Mono", monospace' }}>{label}</span>
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

    const current = data[data.length - 1];

    return (
      <div className="flex flex-col">
        <div className="flex justify-between items-center" style={{ width: chartWidth }}>
          <span style={{ color: '#8aa', fontSize: '11px', fontFamily: '"JetBrains Mono", monospace' }}>{label}</span>
          <span style={{ color: color, fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 'bold' }}>
            {current.toFixed(2)}{unit}
          </span>
        </div>
        <svg width={chartWidth} height={chartHeight} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
          {/* Zero line */}
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
      background: 'linear-gradient(135deg, #0a0f1a 0%, #1a2035 100%)',
      padding: '20px',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#e0e8f0',
          marginBottom: '5px',
          letterSpacing: '2px'
        }}>
          INVERTED PENDULUM
          <span style={{ color: '#6a9fd4', marginLeft: '10px' }}>PID CONTROLLER</span>
        </h1>
        <p style={{ color: '#6a8a9a', fontSize: '13px' }}>
          Real-time physics simulation with accurate dynamics
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-5">
        {/* Main visualization */}
        <div style={{
          background: 'rgba(20, 30, 50, 0.8)',
          borderRadius: '12px',
          padding: '15px',
          border: '1px solid rgba(100, 150, 200, 0.2)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)'
        }}>
          <canvas
            ref={canvasRef}
            width={750}
            height={400}
            style={{ borderRadius: '8px' }}
          />

          {/* Control buttons */}
          <div className="flex justify-center gap-3 mt-4">
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
                  ? 'linear-gradient(135deg, #c44 0%, #a33 100%)'
                  : 'linear-gradient(135deg, #4a8 0%, #396 100%)',
                color: '#fff',
                letterSpacing: '1px',
                transition: 'transform 0.1s',
                fontFamily: 'inherit'
              }}
              onMouseDown={e => e.target.style.transform = 'scale(0.98)'}
              onMouseUp={e => e.target.style.transform = 'scale(1)'}
            >
              {isRunning ? '⏹ STOP' : '▶ START'}
            </button>

            <button
              onClick={applyNudge}
              disabled={!isRunning || stateRef.current.fallen}
              style={{
                padding: '12px 30px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: (!isRunning || stateRef.current.fallen) ? 'not-allowed' : 'pointer',
                background: (!isRunning || stateRef.current.fallen)
                  ? 'rgba(80, 80, 100, 0.4)'
                  : 'linear-gradient(135deg, #d84 0%, #b63 100%)',
                color: (!isRunning || stateRef.current.fallen) ? '#666' : '#fff',
                letterSpacing: '1px',
                transition: 'transform 0.1s',
                fontFamily: 'inherit'
              }}
              onMouseDown={e => e.target.style.transform = 'scale(0.98)'}
              onMouseUp={e => e.target.style.transform = 'scale(1)'}
            >
              ⚡ NUDGE
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
                background: 'rgba(50, 70, 100, 0.6)',
                color: '#aac',
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
          background: 'rgba(20, 30, 50, 0.8)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(100, 150, 200, 0.2)',
          width: '280px'
        }}>
          <h2 style={{ color: '#b0c4d8', fontSize: '14px', marginBottom: '15px', letterSpacing: '2px' }}>
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
                border: controlMode === 'pid' ? '2px solid #6a9fd4' : '1px solid rgba(100, 150, 200, 0.3)',
                cursor: 'pointer',
                background: controlMode === 'pid' ? 'rgba(106, 159, 212, 0.2)' : 'rgba(50, 70, 100, 0.3)',
                color: controlMode === 'pid' ? '#8ac' : '#68a',
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
                border: controlMode === 'user' ? '2px solid #d4a06a' : '1px solid rgba(100, 150, 200, 0.3)',
                cursor: 'pointer',
                background: controlMode === 'user' ? 'rgba(212, 160, 106, 0.2)' : 'rgba(50, 70, 100, 0.3)',
                color: controlMode === 'user' ? '#da8' : '#68a',
                fontFamily: 'inherit'
              }}
            >
              MANUAL
            </button>
          </div>

          {controlMode === 'pid' ? (
            <>
              <div className="flex justify-between items-center" style={{ marginBottom: '12px' }}>
                <h3 style={{ color: '#8aa', fontSize: '12px', margin: 0 }}>PID PARAMETERS</h3>
                <button
                  onClick={resetPIDGains}
                  style={{
                    padding: '5px 12px',
                    fontSize: '10px',
                    fontWeight: '600',
                    borderRadius: '4px',
                    border: '1px solid rgba(100, 150, 200, 0.3)',
                    cursor: 'pointer',
                    background: 'rgba(50, 70, 100, 0.4)',
                    color: '#8aa',
                    fontFamily: 'inherit'
                  }}
                >
                  RESET GAINS
                </button>
              </div>

              {[
                { label: 'Kp (Proportional)', value: kp, set: setKp, min: 0, max: 300, color: '#6af' },
                { label: 'Ki (Integral)', value: ki, set: setKi, min: 0, max: 100, color: '#af6' },
                { label: 'Kd (Derivative)', value: kd, set: setKd, min: 0, max: 100, color: '#fa6' }
              ].map(param => (
                <div key={param.label} style={{ marginBottom: '15px' }}>
                  <div className="flex justify-between" style={{ marginBottom: '5px' }}>
                    <label style={{ color: '#789', fontSize: '11px' }}>{param.label}</label>
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
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ color: '#8aa', fontSize: '13px', marginBottom: '15px' }}>
                Use arrow keys or A/D to control the cart
              </p>
              <div className="flex justify-center gap-3">
                <div style={{
                  padding: '15px 20px',
                  background: userInput < 0 ? 'rgba(106, 159, 212, 0.4)' : 'rgba(50, 70, 100, 0.4)',
                  borderRadius: '6px',
                  border: '1px solid rgba(100, 150, 200, 0.3)',
                  color: '#aac',
                  fontSize: '20px'
                }}>
                  ←
                </div>
                <div style={{
                  padding: '15px 20px',
                  background: userInput > 0 ? 'rgba(106, 159, 212, 0.4)' : 'rgba(50, 70, 100, 0.4)',
                  borderRadius: '6px',
                  border: '1px solid rgba(100, 150, 200, 0.3)',
                  color: '#aac',
                  fontSize: '20px'
                }}>
                  →
                </div>
              </div>
            </div>
          )}

          {/* Timer display */}
          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3 style={{ color: '#8aa', fontSize: '11px', marginBottom: '12px', letterSpacing: '1px' }}>
              BALANCE TIMER
            </h3>
            <div style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: stateRef.current.fallen ? '#c55' : '#6fa',
              fontFamily: '"JetBrains Mono", monospace'
            }}>
              {elapsedTime.toFixed(1)}s
            </div>
            {bestTime > 0 && (
              <div style={{ marginTop: '10px', color: '#da8', fontSize: '12px' }}>
                Best: {bestTime.toFixed(1)}s
              </div>
            )}
          </div>
        </div>

        {/* Charts panel */}
        <div style={{
          background: 'rgba(20, 30, 50, 0.8)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(100, 150, 200, 0.2)'
        }}>
          <h2 style={{ color: '#b0c4d8', fontSize: '14px', marginBottom: '15px', letterSpacing: '2px' }}>
            SIGNAL HISTORY
          </h2>

          <div className="flex flex-col gap-4">
            <MiniChart
              data={plotData.angleHistory}
              label="ANGLE"
              unit="°"
              color="#6af"
              min={-45}
              max={45}
            />
            <MiniChart
              data={plotData.positionHistory}
              label="CART POSITION"
              unit=" m"
              color="#6fa"
              min={-5}
              max={5}
            />
            <MiniChart
              data={plotData.forceHistory}
              label="CONTROL FORCE"
              unit=" N"
              color="#fa6"
              min={-50}
              max={50}
            />
          </div>

          {/* Physics info */}
          <div style={{
            marginTop: '20px',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            fontSize: '10px',
            color: '#567'
          }}>
            <div style={{ marginBottom: '5px', color: '#789' }}>SYSTEM PARAMETERS</div>
            <div>Cart mass: {CART_MASS} kg</div>
            <div>Pendulum mass: {PENDULUM_MASS} kg</div>
            <div>Pendulum length: {PENDULUM_LENGTH} m</div>
            <div>Simulation dt: {DT * 1000} ms</div>
            <div>Noise amplitude: ±{(NOISE_AMPLITUDE * 180 / Math.PI).toFixed(3)}°</div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div style={{
        textAlign: 'center',
        marginTop: '25px',
        color: '#456',
        fontSize: '11px'
      }}>
        <p>
          Physics model: Coupled nonlinear ODEs for cart-pendulum system with friction and random disturbances
        </p>
        <p style={{ marginTop: '5px' }}>
          θ̈ = (g·sin(θ) + cos(θ)·(−F − ml·θ̇²·sin(θ))/(M+m)) / (l·(4/3 − m·cos²(θ)/(M+m)))
        </p>
      </div>
    </div>
  );
};

export default InvertedPendulumSimulator;