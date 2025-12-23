import React, { useState, useEffect, useRef, useCallback } from 'react';

// Physics constants
const WATER_MASS = 1500; // kg (about 1500 liters / 400 gallons)
const SPECIFIC_HEAT = 4186; // J/(kg·K) for water
const THERMAL_MASS = WATER_MASS * SPECIFIC_HEAT; // J/K - energy needed to change temp by 1K
const HEAT_LOSS_COEFFICIENT = 500; // W/K - heat loss per degree difference from ambient
const MAX_HEATER_POWER = 15000; // Watts (15kW heater)
const MIN_HEATER_POWER = 0; // Watts (can't cool actively, only lose heat to ambient)
const DT = 0.1; // simulation timestep (0.1 seconds)
const RENDER_INTERVAL = 16; // render at ~60fps
const TIME_SCALE = 600; // 1 real second = 600 simulated seconds (10 minutes)

// Temperature limits
const MIN_TEMP = 0; // °C
const MAX_TEMP = 50; // °C
const SETPOINT_MIN = 30; // °C
const SETPOINT_MAX = 42; // °C
const AMBIENT_MIN = -10; // °C
const AMBIENT_MAX = 35; // °C

const HotTubSimulator = () => {
  // State
  const [isRunning, setIsRunning] = useState(false);
  const [controlMode, setControlMode] = useState('pid'); // 'user' or 'pid'
  const [userInput, setUserInput] = useState(0); // 0 to 1 for user control

  // PID parameters
  const [kp, setKp] = useState(2000);
  const [ki, setKi] = useState(100);
  const [kd, setKd] = useState(5000);

  // Default PID values for reset
  const DEFAULT_KP = 2000;
  const DEFAULT_KI = 100;
  const DEFAULT_KD = 5000;

  // Physics state
  const stateRef = useRef({
    temperature: 38, // current water temperature °C
    setpoint: 38, // target temperature °C
    ambient: 20, // ambient temperature °C
    integral: 0,
    prevError: 0,
    time: 0,
    heaterPower: 0
  });

  // Display state
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentTemp, setCurrentTemp] = useState(38);
  const [setpoint, setSetpointDisplay] = useState(38);
  const [ambient, setAmbientDisplay] = useState(20);
  const [heaterPower, setHeaterPowerDisplay] = useState(0);

  // Data for plots
  const [plotData, setPlotData] = useState({
    tempHistory: [],
    setpointHistory: [],
    ambientHistory: [],
    powerHistory: [],
    timeHistory: []
  });

  // Reset simulation
  const resetSimulation = useCallback(() => {
    stateRef.current = {
      temperature: 38,
      setpoint: 38,
      ambient: 20,
      integral: 0,
      prevError: 0,
      time: 0,
      heaterPower: 0
    };
    setPlotData({
      tempHistory: [],
      setpointHistory: [],
      ambientHistory: [],
      powerHistory: [],
      timeHistory: []
    });
    setElapsedTime(0);
    setCurrentTemp(38);
    setSetpointDisplay(38);
    setAmbientDisplay(20);
    setHeaterPowerDisplay(0);
  }, []);

  // Change setpoint to random value
  const changeSetpoint = useCallback(() => {
    const newSetpoint = SETPOINT_MIN + Math.random() * (SETPOINT_MAX - SETPOINT_MIN);
    stateRef.current.setpoint = newSetpoint;
    setSetpointDisplay(newSetpoint);
  }, []);

  // Change ambient temperature
  const changeAmbient = useCallback(() => {
    const newAmbient = AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN);
    stateRef.current.ambient = newAmbient;
    setAmbientDisplay(newAmbient);
  }, []);

  // Reset PID gains to defaults
  const resetPIDGains = useCallback(() => {
    setKp(DEFAULT_KP);
    setKi(DEFAULT_KI);
    setKd(DEFAULT_KD);
  }, []);

  // Physics simulation
  const simulateStep = useCallback((heaterPower) => {
    const state = stateRef.current;

    // Clamp heater power
    heaterPower = Math.max(MIN_HEATER_POWER, Math.min(MAX_HEATER_POWER, heaterPower));
    state.heaterPower = heaterPower;

    const { temperature, ambient } = state;

    // Heat loss to environment (W) = coefficient * (T_water - T_ambient)
    const heatLoss = HEAT_LOSS_COEFFICIENT * (temperature - ambient);

    // Net power (W) = heater input - heat loss
    const netPower = heaterPower - heatLoss;

    // Temperature change: dT = (Power * dt) / thermal_mass
    // Power in Watts (J/s), dt in seconds, thermal_mass in J/K
    const dT = (netPower * DT) / THERMAL_MASS;

    // Update temperature
    state.temperature += dT;
    state.time += DT;

    // Clamp temperature to physical limits
    state.temperature = Math.max(MIN_TEMP, Math.min(MAX_TEMP, state.temperature));
  }, []);

  // PID Controller
  const computePIDPower = useCallback(() => {
    const state = stateRef.current;

    // Error is the difference from setpoint
    const error = state.setpoint - state.temperature;

    // Update integral (with anti-windup)
    state.integral += error * DT;
    state.integral = Math.max(-100, Math.min(100, state.integral));

    // Derivative
    const derivative = (error - state.prevError) / DT;
    state.prevError = error;

    // PID output
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

    // Clear canvas with outdoor gradient (day/night based on ambient)
    const skyBrightness = Math.max(0, Math.min(1, (stateRef.current.ambient + 10) / 45));
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, `rgb(${30 + skyBrightness * 100}, ${50 + skyBrightness * 150}, ${100 + skyBrightness * 155})`);
    skyGradient.addColorStop(1, `rgb(${40 + skyBrightness * 60}, ${80 + skyBrightness * 100}, ${60 + skyBrightness * 80})`);
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);

    const state = stateRef.current;

    // Draw ground
    ctx.fillStyle = '#3d5c3d';
    ctx.fillRect(0, height - 80, width, 80);

    // Draw hot tub (side view)
    const tubX = width / 2 - 120;
    const tubY = height - 180;
    const tubWidth = 240;
    const tubHeight = 120;

    // Tub outer shell
    ctx.fillStyle = '#5d4e37';
    ctx.beginPath();
    ctx.roundRect(tubX - 10, tubY - 10, tubWidth + 20, tubHeight + 30, 10);
    ctx.fill();

    // Tub inner
    const waterTemp = state.temperature;
    const tempRatio = (waterTemp - 20) / 30; // 20-50°C range for color
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

    // Steam effect when hot
    if (waterTemp > state.ambient + 10) {
      const steamIntensity = Math.min(1, (waterTemp - state.ambient - 10) / 20);
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

    ctx.fillStyle = waterTemp < state.setpoint - 2 ? '#63b3ed' : waterTemp > state.setpoint + 2 ? '#fc8181' : '#68d391';
    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${waterTemp.toFixed(1)}°`, tubX + tubWidth / 2, tubY + 65);

    // Heater indicator
    const heaterOn = state.heaterPower > 100;
    ctx.fillStyle = heaterOn ? '#ff6b35' : '#444';
    ctx.beginPath();
    ctx.roundRect(tubX + tubWidth + 15, tubY + 40, 30, 60, 5);
    ctx.fill();

    if (heaterOn) {
      // Heater glow
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

    // Ambient temperature indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '28px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Ambient: ${state.ambient.toFixed(1)}°C`, 20, 35);

    // Target temperature indicator
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`Target: ${state.setpoint.toFixed(1)}°C`, 20, 70);

    // Time display (in simulated minutes)
    const simMinutes = Math.floor(state.time / 60);
    const simHours = Math.floor(simMinutes / 60);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(`Time: ${simHours}h ${simMinutes % 60}m`, width - 20, 30);

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
    let lastPlotTime = 0;

    const loop = (currentTime) => {
      const deltaTime = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;
      accumulator += deltaTime * TIME_SCALE; // Speed up simulation

      while (accumulator >= DT * 1000) {
        let power = 0;

        if (controlMode === 'pid') {
          power = computePIDPower();
        } else {
          // User control: direct heater power control
          power = userInput * MAX_HEATER_POWER;
        }

        simulateStep(power);
        accumulator -= DT * 1000;
      }

      // Update display state every simulated minute
      const state = stateRef.current;
      if (state.time - lastPlotTime >= 60) { // Every simulated minute
        lastPlotTime = state.time;
        setPlotData(prev => {
          const maxPoints = 200;
          return {
            tempHistory: [...prev.tempHistory.slice(-maxPoints), state.temperature],
            setpointHistory: [...prev.setpointHistory.slice(-maxPoints), state.setpoint],
            ambientHistory: [...prev.ambientHistory.slice(-maxPoints), state.ambient],
            powerHistory: [...prev.powerHistory.slice(-maxPoints), state.heaterPower / 1000], // kW
            timeHistory: [...prev.timeHistory.slice(-maxPoints), state.time / 60] // minutes
          };
        });
        setElapsedTime(state.time);
        setCurrentTemp(state.temperature);
        setSetpointDisplay(state.setpoint);
        setAmbientDisplay(state.ambient);
        setHeaterPowerDisplay(state.heaterPower);
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
  }, [isRunning, controlMode, userInput, computePIDPower, simulateStep, render]);

  // Initial render
  useEffect(() => {
    render();
  }, [render]);

  // Mini chart component
  const MiniChart = ({ data, data2, data3, label, unit, color, color2, color3, min, max, autoZoom }) => {
    const chartWidth = 200;
    const chartHeight = 80;
    const padding = { left: 35, right: 10, top: 10, bottom: 20 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    if (data.length < 2) return (
      <div className="flex flex-col">
        <span style={{ color: '#8ab', fontSize: '11px', fontFamily: '"JetBrains Mono", monospace' }}>{label}</span>
        <div style={{ width: chartWidth, height: chartHeight, background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }} />
      </div>
    );

    // Calculate min/max for auto-zoom
    let dataMin, dataMax;
    if (autoZoom) {
      const allData = [...data, ...(data2 || []), ...(data3 || [])];
      dataMin = Math.floor(Math.min(...allData));
      dataMax = Math.ceil(Math.max(...allData));
      // Ensure at least 2 degree range
      if (dataMax - dataMin < 2) {
        dataMin -= 1;
        dataMax += 1;
      }
    } else {
      dataMin = min ?? Math.min(...data);
      dataMax = max ?? Math.max(...data);
    }
    const range = dataMax - dataMin || 1;

    const points = data.map((v, i) => {
      const x = padding.left + (i / (data.length - 1)) * plotWidth;
      const y = padding.top + plotHeight - ((v - dataMin) / range) * plotHeight;
      return `${x},${y}`;
    }).join(' ');

    let points2 = '';
    if (data2 && data2.length >= 2) {
      points2 = data2.map((v, i) => {
        const x = padding.left + (i / (data2.length - 1)) * plotWidth;
        const y = padding.top + plotHeight - ((v - dataMin) / range) * plotHeight;
        return `${x},${y}`;
      }).join(' ');
    }

    let points3 = '';
    if (data3 && data3.length >= 2) {
      points3 = data3.map((v, i) => {
        const x = padding.left + (i / (data3.length - 1)) * plotWidth;
        const y = padding.top + plotHeight - ((v - dataMin) / range) * plotHeight;
        return `${x},${y}`;
      }).join(' ');
    }

    const current = data[data.length - 1];

    // Generate Y-axis ticks
    const yTicks = [];
    const tickCount = Math.min(5, Math.max(3, dataMax - dataMin + 1));
    for (let i = 0; i < tickCount; i++) {
      const value = dataMin + (i / (tickCount - 1)) * range;
      const y = padding.top + plotHeight - (i / (tickCount - 1)) * plotHeight;
      yTicks.push({ value: autoZoom ? Math.round(value) : value.toFixed(1), y });
    }

    return (
      <div className="flex flex-col">
        <div className="flex justify-between items-center" style={{ width: chartWidth }}>
          <span style={{ color: '#8ab', fontSize: '11px', fontFamily: '"JetBrains Mono", monospace' }}>{label}</span>
          <span style={{ color: color, fontSize: '12px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 'bold' }}>
            {current.toFixed(1)}{unit}
          </span>
        </div>
        <svg width={chartWidth} height={chartHeight} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
          {/* Y-axis */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + plotHeight}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1"
          />
          {/* X-axis */}
          <line
            x1={padding.left}
            y1={padding.top + plotHeight}
            x2={padding.left + plotWidth}
            y2={padding.top + plotHeight}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1"
          />
          {/* Y-axis ticks and labels */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left - 3}
                y1={tick.y}
                x2={padding.left}
                y2={tick.y}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 5}
                y={tick.y + 3}
                textAnchor="end"
                fill="rgba(255,255,255,0.5)"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                {tick.value}
              </text>
            </g>
          ))}
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <line
              key={`grid-${i}`}
              x1={padding.left}
              y1={tick.y}
              x2={padding.left + plotWidth}
              y2={tick.y}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />
          ))}
          {/* Data lines */}
          {points3 && (
            <polyline
              points={points3}
              fill="none"
              stroke={color3}
              strokeWidth="1"
              strokeDasharray="2"
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
      background: 'linear-gradient(135deg, #1a2a3a 0%, #2a3a4a 50%, #1a3a3a 100%)',
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
          HOT TUB
          <span style={{ color: '#f6ad55', marginLeft: '10px' }}>TEMPERATURE CONTROL</span>
        </h1>
        <p style={{ color: '#718096', fontSize: '13px' }}>
          Maintain target temperature against ambient heat loss
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
            height={350}
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
              style={{
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)',
                color: '#fff',
                letterSpacing: '1px',
                transition: 'transform 0.1s',
                fontFamily: 'inherit'
              }}
            >
              🎯 NEW TARGET
            </button>

            <button
              onClick={changeAmbient}
              style={{
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
                color: '#fff',
                letterSpacing: '1px',
                transition: 'transform 0.1s',
                fontFamily: 'inherit'
              }}
            >
              🌡️ CHANGE AMBIENT
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
                { label: 'Kp (Proportional)', value: kp, set: setKp, min: 0, max: 10000, color: '#f6ad55' },
                { label: 'Ki (Integral)', value: ki, set: setKi, min: 0, max: 500, color: '#68d391' },
                { label: 'Kd (Derivative)', value: kd, set: setKd, min: 0, max: 20000, color: '#63b3ed' }
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
                HEATER CONTROL
              </h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: 1
                }}>
                  <span style={{ color: '#f6ad55', fontSize: '10px', marginBottom: '5px' }}>MAX</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={userInput * 100}
                    onChange={e => setUserInput(Number(e.target.value) / 100)}
                    style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      accentColor: '#f6ad55',
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      height: '150px',
                      width: '30px'
                    }}
                  />
                  <span style={{ color: '#63b3ed', fontSize: '10px', marginTop: '5px' }}>OFF</span>
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
                    <div style={{ color: '#718096', fontSize: '10px', marginBottom: '3px' }}>POWER</div>
                    <div style={{
                      color: '#f6ad55',
                      fontSize: '18px',
                      fontWeight: 'bold'
                    }}>
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
                      color: '#a0aec0',
                      fontFamily: 'inherit'
                    }}
                  >
                    OFF
                  </button>
                </div>
              </div>

              <p style={{ color: '#4a5568', fontSize: '10px', marginTop: '15px', textAlign: 'center' }}>
                Adjust heater power manually<br />
                Heat loss depends on ambient temp
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
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Temperature</span>
                <span style={{ color: '#4ade80', fontSize: '12px', fontWeight: 'bold' }}>{currentTemp.toFixed(1)}°C</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Target</span>
                <span style={{ color: '#ff6b6b', fontSize: '12px', fontWeight: 'bold' }}>{setpoint.toFixed(1)}°C</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Ambient</span>
                <span style={{ color: '#63b3ed', fontSize: '12px', fontWeight: 'bold' }}>{ambient.toFixed(1)}°C</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Heater</span>
                <span style={{ color: '#f6ad55', fontSize: '12px', fontWeight: 'bold' }}>{(heaterPower / 1000).toFixed(1)} kW</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#4a5568', fontSize: '11px' }}>Time</span>
                <span style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 'bold' }}>
                  {Math.floor(elapsedTime / 3600)}h {Math.floor((elapsedTime % 3600) / 60)}m
                </span>
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
              data={plotData.tempHistory}
              data2={plotData.setpointHistory}
              data3={plotData.ambientHistory}
              label="TEMPERATURE"
              unit="°C"
              color="#4ade80"
              color2="#ff6b6b"
              color3="#63b3ed"
              autoZoom={true}
            />
            <MiniChart
              data={plotData.powerHistory}
              label="HEATER POWER"
              unit=" kW"
              color="#f6ad55"
              min={0}
              max={15}
            />
          </div>

          {/* Legend */}
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            fontSize: '10px'
          }}>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '3px', background: '#4ade80' }} />
                <span style={{ color: '#718096' }}>Water Temp</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '3px', background: '#ff6b6b', borderStyle: 'dashed' }} />
                <span style={{ color: '#718096' }}>Target</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '12px', height: '3px', background: '#63b3ed', borderStyle: 'dotted' }} />
                <span style={{ color: '#718096' }}>Ambient</span>
              </div>
            </div>
          </div>

          {/* Physics info */}
          <div style={{
            marginTop: '15px',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            fontSize: '10px',
            color: '#4a5568'
          }}>
            <div style={{ marginBottom: '5px', color: '#718096' }}>SYSTEM PARAMETERS</div>
            <div>Water volume: {WATER_MASS} L</div>
            <div>Heat loss: {HEAT_LOSS_COEFFICIENT} W/°C difference</div>
            <div>Max heater: {MAX_HEATER_POWER / 1000} kW</div>
            <div>Time scale: 1s real = {TIME_SCALE / 60} min sim</div>
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
          Physics: Q̇_loss = k(T_water - T_ambient) • dT/dt = (P_heater - Q̇_loss) / (m·c)
        </p>
      </div>
    </div>
  );
};

export default HotTubSimulator;