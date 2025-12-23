import { useRef, useEffect, useCallback, useState } from 'react';

/**
 * Custom hook for physics simulation loop
 * Provides consistent timing, state management, and data recording
 *
 * @param {Object} config - Configuration object
 * @param {number} config.dt - Physics timestep in seconds (default: 0.001)
 * @param {number} config.renderInterval - Render interval in ms (default: 16)
 * @param {number} config.timeScale - Time scaling factor (default: 1)
 * @param {number} config.plotInterval - How often to record plot data in simulated seconds (default: 0.05)
 * @param {Function} config.onPhysicsStep - Called each physics step with (state, dt) => controlSignal
 * @param {Function} config.onRender - Called each render frame with (state)
 * @param {Object} config.initialState - Initial physics state
 */
export function usePhysicsSimulation({
  dt = 0.001,
  renderInterval = 16,
  timeScale = 1,
  plotInterval = 0.05,
  onPhysicsStep,
  onRender,
  initialState = {}
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [plotData, setPlotData] = useState({ timeHistory: [] });
  const [displayState, setDisplayState] = useState({});

  const stateRef = useRef({ time: 0, ...initialState });
  const animationRef = useRef(null);
  const lastRenderRef = useRef(0);
  const lastPlotTimeRef = useRef(0);

  // Reset simulation to initial state
  const reset = useCallback((newInitialState = initialState) => {
    stateRef.current = { time: 0, ...newInitialState };
    lastPlotTimeRef.current = 0;
    setPlotData({ timeHistory: [] });
    setDisplayState({});
  }, [initialState]);

  // Get current state
  const getState = useCallback(() => {
    return stateRef.current;
  }, []);

  // Update state
  const updateState = useCallback((updates) => {
    Object.assign(stateRef.current, updates);
  }, []);

  // Record data point for plotting
  const recordDataPoint = useCallback((dataPoint) => {
    setPlotData(prev => {
      const newData = { ...prev };
      for (const [key, value] of Object.entries(dataPoint)) {
        if (!newData[key]) newData[key] = [];
        newData[key] = [...newData[key], value];
      }
      newData.timeHistory = [...(newData.timeHistory || []), stateRef.current.time];
      return newData;
    });
  }, []);

  // Update display state (for UI updates)
  const updateDisplayState = useCallback((updates) => {
    setDisplayState(prev => ({ ...prev, ...updates }));
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
      const deltaTime = Math.min(currentTime - lastTime, 50);
      lastTime = currentTime;
      accumulator += deltaTime * timeScale;

      // Physics updates at fixed timestep
      while (accumulator >= dt * 1000) {
        if (onPhysicsStep) {
          onPhysicsStep(stateRef.current, dt);
        }
        stateRef.current.time += dt;
        accumulator -= dt * 1000;
      }

      // Record plot data at specified interval
      if (stateRef.current.time - lastPlotTimeRef.current >= plotInterval) {
        lastPlotTimeRef.current = stateRef.current.time;
      }

      // Render at display refresh rate
      if (currentTime - lastRenderRef.current >= renderInterval) {
        if (onRender) {
          onRender(stateRef.current);
        }
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
  }, [isRunning, dt, renderInterval, timeScale, plotInterval, onPhysicsStep, onRender]);

  return {
    isRunning,
    setIsRunning,
    plotData,
    setPlotData,
    displayState,
    stateRef,
    reset,
    getState,
    updateState,
    recordDataPoint,
    updateDisplayState
  };
}

export default usePhysicsSimulation;
