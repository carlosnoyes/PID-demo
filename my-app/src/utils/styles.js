/**
 * Shared styles and theme utilities
 */

export const colors = {
  // Primary colors
  primary: '#6a9fd4',
  secondary: '#f6ad55',
  success: '#48bb78',
  danger: '#e53e3e',
  warning: '#fbbf24',
  info: '#63b3ed',

  // PID colors
  proportional: '#6af',
  integral: '#68d391',
  derivative: '#fa6',

  // Data colors
  setpoint: '#ff6b6b',
  error: '#fbbf24',
  control: '#f6ad55',

  // UI colors
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

export const fonts = {
  mono: '"JetBrains Mono", "Fira Code", monospace'
};

// Button variants
export const buttonStyles = {
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

// Panel styles
export const panelStyles = {
  base: {
    background: colors.background.panel,
    borderRadius: '12px',
    padding: '20px',
    border: `1px solid ${colors.border}`,
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)'
  },

  header: {
    color: colors.text.primary,
    fontSize: '14px',
    marginBottom: '15px',
    letterSpacing: '2px',
    fontWeight: '600'
  }
};

// Create a button style by merging base with variant
export function getButtonStyle(variant = 'primary', isDisabled = false) {
  if (isDisabled) {
    return { ...buttonStyles.base, ...buttonStyles.disabled };
  }
  return { ...buttonStyles.base, ...(buttonStyles[variant] || buttonStyles.primary) };
}

// Slider styles
export const sliderStyles = {
  base: {
    width: '100%',
    height: '6px',
    borderRadius: '3px',
    cursor: 'pointer'
  }
};

export default {
  colors,
  fonts,
  buttonStyles,
  panelStyles,
  getButtonStyle,
  sliderStyles
};
