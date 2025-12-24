/**
 * PID Controller utility
 * Shared across all simulators for consistent control logic
 */

/**
 * Compute PID control output
 * @param {Object} params - PID parameters
 * @param {number} params.error - Current error (setpoint - measured)
 * @param {number} params.integral - Accumulated integral term
 * @param {number} params.prevError - Previous error for derivative
 * @param {number} params.kp - Proportional gain
 * @param {number} params.ki - Integral gain
 * @param {number} params.kd - Derivative gain
 * @param {number} params.dt - Time step
 * @param {number} params.integralMin - Minimum integral value (anti-windup)
 * @param {number} params.integralMax - Maximum integral value (anti-windup)
 * @returns {Object} { output, integral, prevError }
 */
export function computePID({
  error,
  integral,
  prevError,
  kp,
  ki,
  kd,
  dt,
  integralMin = -Infinity,
  integralMax = Infinity
}) {
  // Update integral with anti-windup clamping
  const newIntegral = Math.max(
    integralMin,
    Math.min(integralMax, integral + error * dt)
  );

  // Derivative term
  const derivative = (error - prevError) / dt;

  // PID output
  const output = kp * error + ki * newIntegral + kd * derivative;

  return {
    output,
    integral: newIntegral,
    prevError: error
  };
}

/**
 * Create a PID controller instance with state management
 * @param {Object} config - Initial configuration
 * @returns {Object} PID controller with compute and reset methods
 */
export function createPIDController(config = {}) {
  let state = {
    integral: 0,
    prevError: 0
  };

  const defaults = {
    integralMin: -Infinity,
    integralMax: Infinity,
    ...config
  };

  return {
    compute(error, gains, dt) {
      const result = computePID({
        error,
        integral: state.integral,
        prevError: state.prevError,
        kp: gains.kp,
        ki: gains.ki,
        kd: gains.kd,
        dt,
        integralMin: defaults.integralMin,
        integralMax: defaults.integralMax
      });

      state.integral = result.integral;
      state.prevError = result.prevError;

      return result.output;
    },

    reset() {
      state.integral = 0;
      state.prevError = 0;
    },

    resetIntegral() {
      state.integral = 0;
    },

    getState() {
      return { ...state };
    }
  };
}

export default { computePID, createPIDController };
