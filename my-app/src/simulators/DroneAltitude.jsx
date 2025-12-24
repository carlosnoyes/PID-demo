import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataChart, SimulationControls, ControlPanel, StatusDisplay } from '../components';
import { createPIDController } from '../utils/pidController';
import { colors, fonts, panelStyles, sliderStyles } from '../utils/styles';

// Physics constants
const GRAVITY = 9.81;
const BASE_DRONE_MASS = 2.0;
const MASS_INCREMENT = 1.0;
const MAX_THRUST = 500;
const MIN_THRUST = -500;
const DT = 0.001;
const RENDER_INTERVAL = 16;
const MAX_ALTITUDE = 100;
const SETPOINT_MIN = 20;
const SETPOINT_MAX = 80;

// Default PID values
const DEFAULT_PID = { kp: 25, ki: 0, kd: 0 };
const PID_CONFIG = { kpMax: 100, kiMax: 50, kdMax: 50 };

const DroneAltitudeSimulator = ({ simulators = [], activeSimulator = 'drone', onSimulatorChange = () => {} }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [controlMode, setControlMode] = useState('pid');
  const [userInput, setUserInput] = useState(0);
  const [pidGains, setPidGains] = useState(DEFAULT_PID);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentMass, setCurrentMass] = useState(BASE_DRONE_MASS);
  const [setpointDisplay, setSetpointDisplay] = useState(50);
  const [cumulativeError, setCumulativeError] = useState(0);
  const [plotData, setPlotData] = useState({
    setpointHistory: [],
    measuredHistory: [],
    errorHistory: [],
    thrustHistory: [],
    timeHistory: []
  });

  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastRenderRef = useRef(0);
  const pidController = useRef(createPIDController({ integralMin: -50, integralMax: 50 }));

  const stateRef = useRef({
    altitude: 50,
    velocity: 0,
    mass: BASE_DRONE_MASS,
    setpoint: 50,
    time: 0,
    thrust: 0,
    crashed: false
  });

  const resetSimulation = useCallback(() => {
    stateRef.current = {
      altitude: 50,
      velocity: 0,
      mass: BASE_DRONE_MASS,
      setpoint: 50,
      time: 0,
      thrust: 0,
      crashed: false
    };
    pidController.current.reset();
    setPlotData({ setpointHistory: [], measuredHistory: [], errorHistory: [], thrustHistory: [], timeHistory: [] });
    setElapsedTime(0);
    setCurrentMass(BASE_DRONE_MASS);
    setSetpointDisplay(50);
    setCumulativeError(0);
    setIsRunning(false);
  }, []);

  const changeSetpoint = useCallback(() => {
    if (stateRef.current.crashed) return;
    const newSetpoint = SETPOINT_MIN + Math.random() * (SETPOINT_MAX - SETPOINT_MIN);
    stateRef.current.setpoint = newSetpoint;
    pidController.current.resetIntegral();
    setSetpointDisplay(newSetpoint);
  }, []);

  const addWeight = useCallback(() => {
    if (stateRef.current.crashed) return;
    stateRef.current.mass += MASS_INCREMENT;
    setCurrentMass(stateRef.current.mass);
  }, []);

  const simulateStep = useCallback((controlSignal) => {
    const state = stateRef.current;
    if (state.crashed) return;

    controlSignal = Math.max(MIN_THRUST, Math.min(MAX_THRUST, controlSignal));
    state.thrust = controlSignal;

    const baseHoverThrust = BASE_DRONE_MASS * GRAVITY;
    const actualThrust = baseHoverThrust + controlSignal;
    const gravityForce = state.mass * GRAVITY;
    const netForce = actualThrust - gravityForce;
    const acceleration = state.mass > 0 ? netForce / state.mass : 0;

    state.velocity += acceleration * DT;
    state.altitude += state.velocity * DT;
    state.time += DT;

    if (state.altitude <= 0 || state.altitude >= MAX_ALTITUDE) {
      state.crashed = true;
      state.altitude = Math.max(0, Math.min(MAX_ALTITUDE, state.altitude));
      state.velocity = 0;
    }
  }, []);

  const computePIDThrust = useCallback(() => {
    const state = stateRef.current;
    const error = state.setpoint - state.altitude;
    return pidController.current.compute(error, pidGains, DT);
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

    // Danger zones
    const dangerTopY = height - (MAX_ALTITUDE / MAX_ALTITUDE) * (height - 60) - 30;
    const safeTopY = height - (SETPOINT_MAX / MAX_ALTITUDE) * (height - 60) - 30;
    const safeBottomY = height - (SETPOINT_MIN / MAX_ALTITUDE) * (height - 60) - 30;
    const dangerBottomY = height - 30;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(50, dangerTopY, width - 70, safeTopY - dangerTopY);
    ctx.fillRect(50, safeBottomY, width - 70, dangerBottomY - safeBottomY);

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

    // Safe zone boundaries
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

    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DANGER ZONE', width / 2, safeTopY - 5);
    ctx.fillText('DANGER ZONE', width / 2, safeBottomY + 12);

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
    }

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

    // Weight display above drone
    const addedWeight = state.mass - BASE_DRONE_MASS;
    if (addedWeight > 0) {
      // Draw weight icon (stylized weight/dumbbell shape)
      const weightY = droneY - 35;
      const weightWidth = 24;
      const weightHeight = 12;

      // Weight icon background
      ctx.fillStyle = '#805ad5';
      ctx.shadowColor = '#805ad5';
      ctx.shadowBlur = 8;

      // Left weight plate
      ctx.beginPath();
      ctx.roundRect(droneX - weightWidth/2 - 6, weightY - weightHeight/2, 8, weightHeight, 2);
      ctx.fill();

      // Right weight plate
      ctx.beginPath();
      ctx.roundRect(droneX + weightWidth/2 - 2, weightY - weightHeight/2, 8, weightHeight, 2);
      ctx.fill();

      // Center bar
      ctx.fillStyle = '#9f7aea';
      ctx.beginPath();
      ctx.roundRect(droneX - weightWidth/2 + 2, weightY - 3, weightWidth - 4, 6, 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Weight text
      ctx.fillStyle = '#e9d5ff';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`+${addedWeight.toFixed(1)}kg`, droneX, weightY - 15);
    } else {
      // Show total mass when no weight added (dimmer)
      ctx.fillStyle = 'rgba(160, 174, 192, 0.6)';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${state.mass.toFixed(1)}kg`, droneX, droneY - 25);
    }

    // Crashed text
    if (state.crashed) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.font = 'bold 32px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRASHED!', width / 2, height / 2 - 20);
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillStyle = '#a0aec0';
      ctx.fillText('Press Start to try again', width / 2, height / 2 + 15);
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

      while (accumulator >= DT * 1000) {
        let thrust = controlMode === 'pid' ? computePIDThrust() : userInput * 500;
        simulateStep(thrust);

        const state = stateRef.current;
        const error = Math.abs(state.setpoint - state.altitude);
        errorAccumulator += error * DT;

        accumulator -= DT * 1000;
      }

      const state = stateRef.current;
      if (state.time - lastPlotTime >= 0.05) {
        lastPlotTime = state.time;
        setPlotData(prev => ({
          setpointHistory: [...prev.setpointHistory, state.setpoint],
          measuredHistory: [...prev.measuredHistory, state.altitude],
          errorHistory: [...prev.errorHistory, state.setpoint - state.altitude],
          thrustHistory: [...prev.thrustHistory, state.thrust],
          timeHistory: [...prev.timeHistory, state.time]
        }));
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
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isRunning, controlMode, userInput, computePIDThrust, simulateStep, render, cumulativeError]);

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
        THRUST CONTROL
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <span style={{ color: colors.success, fontSize: '10px', marginBottom: '5px' }}>+500N</span>
          <input
            type="range"
            min={-500}
            max={500}
            value={userInput * 500}
            onChange={e => setUserInput(Number(e.target.value) / 500)}
            style={{
              ...sliderStyles.base,
              accentColor: userInput >= 0 ? colors.secondary : colors.info,
              writingMode: 'vertical-lr',
              direction: 'rtl',
              height: '120px',
              width: '30px'
            }}
          />
          <span style={{ color: colors.info, fontSize: '10px', marginTop: '5px' }}>-500N</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '10px 15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ color: colors.text.muted, fontSize: '10px', marginBottom: '3px' }}>THRUST</div>
            <div style={{ color: userInput >= 0 ? colors.secondary : colors.info, fontSize: '18px', fontWeight: 'bold' }}>
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
              color: colors.text.secondary,
              fontFamily: fonts.mono
            }}
          >
            CENTER (0)
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', maxWidth: '1450px', margin: '0 auto' }}>
      {/* Top Row: Simulation + Control Panel */}
      <div style={{ display: 'flex', gap: '20px', width: '100%' }}>
        {/* Simulation Window */}
        <div style={{ ...panelStyles.base, padding: '15px', position: 'relative' }}>
          {/* Simulator Selector Dropdown */}
          <select
            value={activeSimulator}
            onChange={(e) => onSimulatorChange(e.target.value)}
            style={{
              position: 'absolute',
              top: '15px',
              right: '15px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: '5px',
              border: '1px solid rgba(100, 150, 200, 0.3)',
              background: 'rgba(45, 55, 72, 0.9)',
              color: colors.text.primary,
              fontFamily: fonts.mono,
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            {simulators.map(sim => (
              <option key={sim.id} value={sim.id}>{sim.label}</option>
            ))}
          </select>
          <canvas ref={canvasRef} width={950} height={380} style={{ borderRadius: '8px' }} />
          <SimulationControls
            isRunning={isRunning}
            onToggle={handleToggle}
            actions={[
              { label: '🎯 NEW TARGET', onClick: changeSetpoint, disabled: !isRunning || stateRef.current.crashed, variant: 'secondary' },
              { label: '⚖️ ADD WEIGHT', onClick: addWeight, disabled: !isRunning || stateRef.current.crashed, variant: 'accent' }
            ]}
          />
        </div>

        {/* Control Panel */}
        <ControlPanel
          controlMode={controlMode}
          onModeChange={setControlMode}
          pidGains={pidGains}
          onPidChange={(changes) => setPidGains(prev => ({ ...prev, ...changes }))}
          pidConfig={PID_CONFIG}
          onResetGains={() => setPidGains(DEFAULT_PID)}
          manualControls={manualControls}
          statusDisplay={
            <StatusDisplay items={[
              { label: 'Time', value: elapsedTime, unit: 's', color: colors.text.primary },
              { label: 'Mass', value: currentMass, unit: 'kg', color: '#805ad5', decimals: 2 },
              { label: 'Target', value: setpointDisplay, unit: 'm', color: colors.setpoint },
              { label: 'Cumulative Error', value: cumulativeError, color: colors.warning }
            ]} />
          }
        />
      </div>

      {/* Bottom Row: Data Tracking (full width) */}
      <div style={{ ...panelStyles.base, width: '100%' }}>
        <DataChart
          timeHistory={plotData.timeHistory}
          series={[
            { data: plotData.setpointHistory, label: 'Setpoint (m)', color: '#00d4ff', sharedAxis: 'altitude' },
            { data: plotData.measuredHistory, label: 'Measured (m)', color: '#00ff88', sharedAxis: 'altitude' },
            { data: plotData.errorHistory, label: 'Error (m)', color: '#ff3366' },
            { data: plotData.thrustHistory, label: 'Control (N)', color: '#ffcc00' }
          ]}
          width={1350}
          height={220}
        />
      </div>

    </div>
  );
};

export default DroneAltitudeSimulator;

