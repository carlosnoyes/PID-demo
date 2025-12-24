import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataChart, SimulationControls, ControlPanel, StatusDisplay } from '../components';
import { createPIDController } from '../utils/pidController';
import { colors, fonts, panelStyles, sliderStyles } from '../utils/styles';

// Physics constants
const WATER_MASS = 1500;
const SPECIFIC_HEAT = 4186;
const THERMAL_MASS = WATER_MASS * SPECIFIC_HEAT;
const HEAT_LOSS_COEFFICIENT = 500;
const MAX_HEATER_POWER = 15000;
const MIN_HEATER_POWER = 0;
const DT = 0.1;
const RENDER_INTERVAL = 16;
const TIME_SCALE = 600;
const SETPOINT_MIN = 30;
const SETPOINT_MAX = 42;
const AMBIENT_MIN = -10;
const AMBIENT_MAX = 35;

// Default PID values
const DEFAULT_PID = { kp: 2500, ki: 0, kd: 0 };
const PID_CONFIG = { kpMax: 5000, kiMax: 500, kdMax: 20000 };

const HotTubSimulator = ({ simulators = [], activeSimulator = 'hottub', onSimulatorChange = () => {} }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [controlMode, setControlMode] = useState('pid');
  const [userInput, setUserInput] = useState(0);
  const [pidGains, setPidGains] = useState(DEFAULT_PID);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentTemp, setCurrentTemp] = useState(38);
  const [setpointDisplay, setSetpointDisplay] = useState(38);
  const [ambientDisplay, setAmbientDisplay] = useState(20);
  const [heaterPower, setHeaterPower] = useState(0);
  const [plotData, setPlotData] = useState({
    setpointHistory: [],
    measuredHistory: [],
    errorHistory: [],
    powerHistory: [],
    timeHistory: []
  });
  const timeOffsetRef = useRef(0);

  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const lastRenderRef = useRef(0);
  const pidController = useRef(createPIDController());

  const stateRef = useRef({
    temperature: 38,
    setpoint: 38,
    ambient: 20,
    time: 0,
    heaterPower: 0
  });

  const resetSimulation = useCallback(() => {
    stateRef.current = {
      temperature: 38,
      setpoint: 38,
      ambient: 20,
      time: 0,
      heaterPower: 0
    };
    pidController.current.reset();
    timeOffsetRef.current = 0;
    setPlotData({ setpointHistory: [], measuredHistory: [], errorHistory: [], powerHistory: [], timeHistory: [] });
    setElapsedTime(0);
    setCurrentTemp(38);
    setSetpointDisplay(38);
    setAmbientDisplay(20);
    setHeaterPower(0);
    setIsRunning(false);
  }, []);

  const changeSetpoint = useCallback(() => {
    const newSetpoint = SETPOINT_MIN + Math.random() * (SETPOINT_MAX - SETPOINT_MIN);
    stateRef.current.setpoint = newSetpoint;
    setSetpointDisplay(newSetpoint);
  }, []);

  const changeAmbient = useCallback(() => {
    const newAmbient = AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
    stateRef.current.ambient = newAmbient;
    setAmbientDisplay(newAmbient);
  }, []);

  const simulateStep = useCallback((power) => {
    const state = stateRef.current;
    power = Math.max(MIN_HEATER_POWER, Math.min(MAX_HEATER_POWER, power));
    state.heaterPower = power;

    const heatLoss = HEAT_LOSS_COEFFICIENT * (state.temperature - state.ambient);
    const netPower = power - heatLoss;
    const dT = (netPower * DT) / THERMAL_MASS;

    state.temperature += dT;
    state.time += DT;
    state.temperature = Math.max(0, Math.min(50, state.temperature));
  }, []);

  const computePIDPower = useCallback(() => {
    const state = stateRef.current;
    const error = state.setpoint - state.temperature;
    return pidController.current.compute(error, pidGains, DT);
  }, [pidGains]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const state = stateRef.current;

    // Sky gradient based on ambient
    const skyBrightness = Math.max(0, Math.min(1, (state.ambient + 10) / 45));
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, `rgb(${30 + skyBrightness * 100}, ${50 + skyBrightness * 150}, ${100 + skyBrightness * 155})`);
    skyGradient.addColorStop(1, `rgb(${40 + skyBrightness * 60}, ${80 + skyBrightness * 100}, ${60 + skyBrightness * 80})`);
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);

    // Ground
    ctx.fillStyle = '#3d5c3d';
    ctx.fillRect(0, height - 80, width, 80);

    // Hot tub
    const tubX = width / 2 - 120;
    const tubY = height - 180;
    const tubWidth = 240;
    const tubHeight = 120;

    // Tub outer shell
    ctx.fillStyle = '#5d4e37';
    ctx.beginPath();
    ctx.roundRect(tubX - 10, tubY - 10, tubWidth + 20, tubHeight + 30, 10);
    ctx.fill();

    // Water color based on temperature
    const tempRatio = (state.temperature - 20) / 30;
    const r = Math.min(255, 100 + tempRatio * 155);
    const g = Math.min(255, 150 - tempRatio * 100);
    const b = Math.max(100, 255 - tempRatio * 155);

    const waterGradient = ctx.createLinearGradient(tubX, tubY, tubX, tubY + tubHeight);
    waterGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
    waterGradient.addColorStop(1, `rgba(${r * 0.7}, ${g * 0.7}, ${b * 0.7}, 0.95)`);
    ctx.fillStyle = waterGradient;
    ctx.beginPath();
    ctx.roundRect(tubX, tubY, tubWidth, tubHeight, 5);
    ctx.fill();

    // Steam effect
    if (state.temperature > state.ambient + 10) {
      const steamIntensity = Math.min(1, (state.temperature - state.ambient - 10) / 20);
      ctx.fillStyle = `rgba(255, 255, 255, ${steamIntensity * 0.3})`;
      for (let i = 0; i < 8; i++) {
        const steamX = tubX + 30 + i * 25 + Math.sin(state.time * 0.5 + i) * 10;
        const steamY = tubY - 20 - Math.sin(state.time * 0.3 + i * 0.5) * 15;
        const steamSize = 15 + Math.sin(state.time * 0.4 + i) * 5;
        ctx.beginPath();
        ctx.arc(steamX, steamY, steamSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bubbles
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 12; i++) {
      const bubbleX = tubX + 20 + (i * 18) % tubWidth;
      const bubbleY = tubY + tubHeight - 20 - ((state.time * 30 + i * 20) % (tubHeight - 30));
      const bubbleSize = 3 + (i % 3);
      ctx.beginPath();
      ctx.arc(bubbleX, bubbleY, bubbleSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Temperature display on tub
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(tubX + tubWidth / 2 - 50, tubY + 30, 100, 50, 5);
    ctx.fill();

    ctx.fillStyle = state.temperature < state.setpoint - 2 ? '#63b3ed' : state.temperature > state.setpoint + 2 ? '#fc8181' : '#68d391';
    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.temperature.toFixed(1)}°`, tubX + tubWidth / 2, tubY + 65);

    // Heater indicator
    const heaterOn = state.heaterPower > 100;
    ctx.fillStyle = heaterOn ? '#ff6b35' : '#444';
    ctx.beginPath();
    ctx.roundRect(tubX + tubWidth + 15, tubY + 40, 30, 60, 5);
    ctx.fill();

    if (heaterOn) {
      const glowIntensity = state.heaterPower / MAX_HEATER_POWER;
      ctx.fillStyle = `rgba(255, 100, 50, ${glowIntensity * 0.5})`;
      ctx.beginPath();
      ctx.arc(tubX + tubWidth + 30, tubY + 70, 25 + glowIntensity * 10, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#aaa';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HEATER', tubX + tubWidth + 30, tubY + 115);

    // Ambient temperature
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '24px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Ambient: ${state.ambient.toFixed(1)}°C`, 20, 35);

    // Target temperature
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`Target: ${state.setpoint.toFixed(1)}°C`, 20, 65);

    // Power meter
    const meterX = 20;
    const meterY = height - 60;
    const meterWidth = 150;
    const meterHeight = 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

    const powerRatio = state.heaterPower / MAX_HEATER_POWER;
    const powerGradient = ctx.createLinearGradient(meterX, meterY, meterX + meterWidth, meterY);
    powerGradient.addColorStop(0, '#4ade80');
    powerGradient.addColorStop(0.5, '#fbbf24');
    powerGradient.addColorStop(1, '#ef4444');
    ctx.fillStyle = powerGradient;
    ctx.fillRect(meterX, meterY, meterWidth * powerRatio, meterHeight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);

    ctx.fillStyle = '#fff';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Heater: ${(state.heaterPower / 1000).toFixed(1)} kW`, meterX, meterY - 5);

    // Time display (bottom right)
    const simMinutes = Math.floor(state.time / 60);
    const simHours = Math.floor(simMinutes / 60);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Time: ${simHours}h ${simMinutes % 60}m`, width - 20, height - 20);
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
      accumulator += deltaTime * TIME_SCALE;

      while (accumulator >= DT * 1000) {
        let power = controlMode === 'pid' ? computePIDPower() : userInput * MAX_HEATER_POWER;
        simulateStep(power);
        accumulator -= DT * 1000;
      }

      const state = stateRef.current;
      if (state.time - lastPlotTime >= 60) {
        lastPlotTime = state.time;
        setPlotData(prev => ({
          setpointHistory: [...prev.setpointHistory, state.setpoint],
          measuredHistory: [...prev.measuredHistory, state.temperature],
          errorHistory: [...prev.errorHistory, state.setpoint - state.temperature],
          powerHistory: [...prev.powerHistory, state.heaterPower / 1000],
          timeHistory: [...prev.timeHistory, state.time - timeOffsetRef.current]
        }));
        setElapsedTime(state.time);
        setCurrentTemp(state.temperature);
        setSetpointDisplay(state.setpoint);
        setAmbientDisplay(state.ambient);
        setHeaterPower(state.heaterPower);
      }

      if (currentTime - lastRenderRef.current >= RENDER_INTERVAL) {
        render();
        lastRenderRef.current = currentTime;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isRunning, controlMode, userInput, computePIDPower, simulateStep, render]);

  useEffect(() => { render(); }, [render]);

  const handleToggle = () => {
    if (isRunning) {
      setIsRunning(false);
    } else {
      resetSimulation();
      setIsRunning(true);
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const manualControls = (
    <div style={{ padding: '10px 0' }}>
      <h3 style={{ color: colors.text.secondary, fontSize: '12px', marginBottom: '15px', textAlign: 'center' }}>
        HEATER CONTROL
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <span style={{ color: colors.secondary, fontSize: '10px', marginBottom: '5px' }}>MAX</span>
          <input
            type="range"
            min={0}
            max={100}
            value={userInput * 100}
            onChange={e => setUserInput(Number(e.target.value) / 100)}
            style={{
              ...sliderStyles.base,
              accentColor: colors.secondary,
              writingMode: 'vertical-lr',
              direction: 'rtl',
              height: '120px',
              width: '30px'
            }}
          />
          <span style={{ color: colors.info, fontSize: '10px', marginTop: '5px' }}>OFF</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '10px 15px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ color: colors.text.muted, fontSize: '10px', marginBottom: '3px' }}>POWER</div>
            <div style={{ color: colors.secondary, fontSize: '18px', fontWeight: 'bold' }}>
              {(userInput * 15).toFixed(1)} kW
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
            OFF
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
              { label: '🎯 NEW TARGET', onClick: changeSetpoint, variant: 'secondary' },
              { label: '🌡️ CHANGE AMBIENT', onClick: changeAmbient, variant: 'info' }
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
              { label: 'Temperature', value: currentTemp, unit: '°C', color: colors.success },
              { label: 'Target', value: setpointDisplay, unit: '°C', color: colors.setpoint },
              { label: 'Ambient', value: ambientDisplay, unit: '°C', color: colors.info },
              { label: 'Heater', value: heaterPower / 1000, unit: 'kW', color: colors.secondary },
              { label: 'Time', value: formatTime(elapsedTime), color: colors.text.primary }
            ]} />
          }
        />
      </div>

      {/* Bottom Row: Data Tracking */}
      <div style={{ ...panelStyles.base, padding: '15px', width: '100%', boxSizing: 'border-box', position: 'relative' }}>
        <button
          onClick={() => {
            timeOffsetRef.current = stateRef.current.time;
            setPlotData({ setpointHistory: [], measuredHistory: [], errorHistory: [], powerHistory: [], timeHistory: [] });
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
            { data: plotData.setpointHistory, label: 'Setpoint (°C)', color: '#00d4ff', sharedAxis: 'temperature' },
            { data: plotData.measuredHistory, label: 'Measured (°C)', color: '#00ff88', sharedAxis: 'temperature' },
            { data: plotData.errorHistory, label: 'Error (°C)', color: '#ff3366' },
            { data: plotData.powerHistory, label: 'Control (kW)', color: '#ffcc00' }
          ]}
          width={1140}
          height={220}
        />
      </div>

    </div>
  );
};

export default HotTubSimulator;

