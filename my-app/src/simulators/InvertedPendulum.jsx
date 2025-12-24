import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataChart, SimulationControls, ControlPanel, StatusDisplay } from '../components';
import { createPIDController } from '../utils/pidController';
import { colors, fonts, panelStyles } from '../utils/styles';

// Physics constants
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
const DEFAULT_PID = { kp: 150, ki: 0, kd: 0 };
const PID_CONFIG = { kpMax: 300, kiMax: 100, kdMax: 100 };

const InvertedPendulumSimulator = ({ simulators = [], activeSimulator = 'pendulum', onSimulatorChange = () => {} }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [controlMode, setControlMode] = useState('pid');
  const [userInput, setUserInput] = useState(0);
  const [pidGains, setPidGains] = useState(DEFAULT_PID);
  const [nudgeForce, setNudgeForce] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [bestTime, setBestTime] = useState(0);
  const [plotData, setPlotData] = useState({
    setpointHistory: [],
    measuredHistory: [],
    errorHistory: [],
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
    fallen: false,
    force: 0
  });

  const resetSimulation = useCallback(() => {
    stateRef.current = {
      theta: (Math.random() - 0.5) * 0.1,
      thetaDot: 0,
      x: 0,
      xDot: 0,
      time: 0,
      fallen: false,
      force: 0
    };
    pidController.current.reset();
    timeOffsetRef.current = 0;
    setPlotData({ setpointHistory: [], measuredHistory: [], errorHistory: [], forceHistory: [], timeHistory: [] });
    setElapsedTime(0);
    setNudgeForce(0);
    setIsRunning(false);
  }, []);

  const applyNudge = useCallback(() => {
    setNudgeForce(50); // fixed 50N nudge
    setTimeout(() => setNudgeForce(0), 200);
  }, []);

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

    const noise = (Math.random() - 0.5) * 2 * NOISE_AMPLITUDE;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    const denom = l * (4.0 / 3.0 - (m * cosTheta * cosTheta) / (M + m));
    const thetaDDot = (g * sinTheta +
      cosTheta * ((-force - m * l * thetaDot * thetaDot * sinTheta + b * xDot) / (M + m)) -
      c * thetaDot / (m * l) + noise) / denom;
    const xDDot = (force + m * l * (thetaDot * thetaDot * sinTheta - thetaDDot * cosTheta) - b * xDot) / (M + m);

    state.thetaDot += thetaDDot * DT;
    state.theta += state.thetaDot * DT;
    state.xDot += xDDot * DT;
    state.x += state.xDot * DT;
    state.time += DT;
    state.force = force;

    while (state.theta > Math.PI) state.theta -= 2 * Math.PI;
    while (state.theta < -Math.PI) state.theta += 2 * Math.PI;

    if (Math.abs(state.theta) > Math.PI / 2) {
      state.fallen = true;
    }

    if (Math.abs(state.x) > TRACK_WIDTH / 2 - 0.2) {
      state.fallen = true;
    }
  }, []);

  const computePIDForce = useCallback(() => {
    const state = stateRef.current;
    const error = state.theta;
    const angleForce = pidController.current.compute(error, pidGains, DT);
    const positionForce = 20 * state.x + 10 * state.xDot;
    return Math.max(-50, Math.min(50, angleForce + positionForce));
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

    // Mass
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

    // Fallen/Crashed text
    if (state.fallen) {
      const isCrashed = Math.abs(state.x) > TRACK_WIDTH / 2 - 0.3;
      ctx.fillStyle = 'rgba(200, 50, 50, 0.9)';
      ctx.font = 'bold 36px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isCrashed ? 'CRASHED!' : 'FALLEN!', centerX, height * 0.3);
      ctx.font = '18px "JetBrains Mono", monospace';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Press Start to try again', centerX, height * 0.3 + 35);
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
    let lastPlotTime = 0;

    const loop = (currentTime) => {
      const deltaTime = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;
      accumulator += deltaTime;

      while (accumulator >= DT * 1000) {
        let force = controlMode === 'pid' ? computePIDForce() : userInput * 30;
        force += nudgeForce;
        simulateStep(force);

        const state = stateRef.current;
        if (state.time - lastPlotTime >= 0.05) {
          lastPlotTime = state.time;
          const measured = state.theta * 180 / Math.PI;
          const setpoint = 0;
          setPlotData(prev => ({
            setpointHistory: [...prev.setpointHistory, setpoint],
            measuredHistory: [...prev.measuredHistory, measured],
            errorHistory: [...prev.errorHistory, setpoint - measured],
            forceHistory: [...prev.forceHistory, state.force],
            timeHistory: [...prev.timeHistory, state.time - timeOffsetRef.current]
          }));

          if (!state.fallen) {
            setElapsedTime(state.time);
          }
        }

        if (state.fallen && state.time > bestTime) {
          setBestTime(state.time);
        }

        accumulator -= DT * 1000;
      }

      if (currentTime - lastRenderRef.current >= RENDER_INTERVAL) {
        render();
        lastRenderRef.current = currentTime;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isRunning, controlMode, userInput, nudgeForce, computePIDForce, simulateStep, render, bestTime]);

  useEffect(() => { render(); }, [render]);


  const handleToggle = () => {
    if (isRunning) {
      setIsRunning(false);
    } else {
      resetSimulation();
      setIsRunning(true);
    }
  };

  const manualControls = (
    <div style={{ padding: '10px 0' }}>
      <h3 style={{ color: colors.text.secondary, fontSize: '12px', marginBottom: '15px', textAlign: 'center' }}>
        CART FORCE CONTROL
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: colors.info, fontSize: '10px', minWidth: '35px', textAlign: 'right' }}>LEFT</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={userInput}
            onChange={e => setUserInput(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: userInput < 0 ? colors.info : userInput > 0 ? colors.secondary : colors.text.muted,
              height: '8px',
              cursor: 'pointer'
            }}
          />
          <span style={{ color: colors.secondary, fontSize: '10px', minWidth: '35px' }}>RIGHT</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '10px 15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', textAlign: 'center', width: '100%' }}>
            <div style={{ color: colors.text.muted, fontSize: '10px', marginBottom: '3px' }}>FORCE</div>
            <div style={{ color: userInput < 0 ? colors.info : userInput > 0 ? colors.secondary : colors.text.muted, fontSize: '18px', fontWeight: 'bold' }}>
              {(userInput * 30).toFixed(1)}N
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
              color: colors.text.secondary,
              fontFamily: fonts.mono,
              width: '100%'
            }}
          >
            CENTER (0)
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Top Row: Left Panel + Simulation + Control Panel */}
      <div style={{ display: 'flex', gap: '20px', width: '100%' }}>
        {/* Left Button Panel */}
        <div style={{ ...panelStyles.base, padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', width: '175px', flexShrink: 0 }}>
          {/* Simulator Selector */}
          <div>
            <select
              value={activeSimulator}
              onChange={(e) => onSimulatorChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '5px',
                border: '1px solid rgba(100, 150, 200, 0.3)',
                background: 'rgba(45, 55, 72, 0.9)',
                color: colors.text.primary,
                fontFamily: fonts.mono,
                cursor: 'pointer'
              }}
            >
              {simulators.map(sim => (
                <option key={sim.id} value={sim.id}>{sim.label}</option>
              ))}
            </select>
          </div>

          {/* Simulation Controls */}
          <SimulationControls
            isRunning={isRunning}
            onToggle={handleToggle}
            actions={[
              { label: '⚡ NUDGE', onClick: applyNudge, disabled: !isRunning || stateRef.current.fallen, variant: 'accent' }
            ]}
          />
        </div>

        {/* Simulation Window */}
        <div style={{ ...panelStyles.base, padding: '15px', flex: 1 }}>
          <canvas ref={canvasRef} width={498} height={330} style={{ display: 'block', width: '100%', height: 'auto', borderRadius: '8px' }} />
        </div>

        {/* Control Panel */}
        <ControlPanel
          controlMode={controlMode}
          onModeChange={setControlMode}
          pidGains={pidGains}
          onPidChange={(changes) => setPidGains(prev => ({ ...prev, ...changes }))}
          pidConfig={PID_CONFIG}
          onResetGains={() => setPidGains(DEFAULT_PID)}
          accumulatedError={pidController.current.getState().integral}
          onResetError={() => pidController.current.resetIntegral()}
          manualControls={manualControls}
          statusDisplay={
            <StatusDisplay items={[
              { label: 'Balance Time', value: elapsedTime, unit: 's', color: stateRef.current.fallen ? colors.danger : colors.success },
              { label: 'Best Time', value: bestTime, unit: 's', color: colors.secondary }
            ]} />
          }
        />
      </div>

      {/* Bottom Row: Data Tracking */}
      <div style={{ ...panelStyles.base, padding: '15px', width: '100%', boxSizing: 'border-box', position: 'relative' }}>
        <button
          onClick={() => {
            timeOffsetRef.current = stateRef.current.time;
            setPlotData({ setpointHistory: [], measuredHistory: [], errorHistory: [], forceHistory: [], timeHistory: [] });
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
            { data: plotData.setpointHistory, label: 'Setpoint (deg)', color: '#00d4ff', sharedAxis: 'angle' },
            { data: plotData.measuredHistory, label: 'Measured (deg)', color: '#00ff88', sharedAxis: 'angle' },
            { data: plotData.errorHistory, label: 'Error (deg)', color: '#ff3366' },
            { data: plotData.forceHistory, label: 'Control (N)', color: '#ffcc00' }
          ]}
          width={1140}
          height={220}
        />
      </div>

    </div>
  );
};

export default InvertedPendulumSimulator;

