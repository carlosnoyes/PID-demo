import React, { useMemo, useState } from 'react';
import { colors, fonts } from '../utils/styles';

/**
 * Data Chart Component with multiple independent Y-axes
 * Supports up to 4 data series, each with its own Y-axis
 * Clickable legend to toggle series visibility
 *
 * @param {Object} props
 * @param {Array} props.timeHistory - Array of time values for x-axis
 * @param {Array} props.series - Array of { data, label, color, sharedAxis } objects
 * @param {number} props.width - Chart width (default: 300)
 * @param {number} props.height - Chart height (default: 200)
 */
const DataChart = ({
  timeHistory = [],
  series = [],
  width = 300,
  height = 200
}) => {
  // Track visibility of each series
  const [visibleSeries, setVisibleSeries] = useState(
    series.reduce((acc, _, i) => ({ ...acc, [i]: true }), {})
  );

  const toggleSeries = (index) => {
    setVisibleSeries(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const axisSpacing = 45; // Space between each Y-axis
  const baseLeftPadding = 50; // Base left padding
  const rightPadding = 20;
  const topPadding = 20;
  const bottomPadding = 35;

  // Calculate total left padding based on number of series
  const leftPadding = baseLeftPadding + (series.length * axisSpacing);
  const plotWidth = width - leftPadding - rightPadding;
  const plotHeight = height - topPadding - bottomPadding;

  // Calculate bounds for each series independently or shared
  const seriesBounds = useMemo(() => {
    // Group series by sharedAxis identifier
    const sharedAxisGroups = {};
    series.forEach(({ sharedAxis }, index) => {
      if (sharedAxis) {
        if (!sharedAxisGroups[sharedAxis]) {
          sharedAxisGroups[sharedAxis] = [];
        }
        sharedAxisGroups[sharedAxis].push(index);
      }
    });

    return series.map(({ data, label, sharedAxis }, index) => {
      if (!data || data.length === 0) return { min: 0, max: 1 };

      const margin = 0.1; // 10% margin

      // If this series shares an axis, compute combined bounds
      if (sharedAxis && sharedAxisGroups[sharedAxis]) {
        const groupIndices = sharedAxisGroups[sharedAxis];
        const allValues = groupIndices.flatMap(i => series[i].data || []);
        let min = Math.min(...allValues);
        let max = Math.max(...allValues);

        // Center Error (index 2) and Control (index 3) at 0
        const isErrorOrControl = label.includes('Error') || label.includes('Control');
        if (isErrorOrControl) {
          const absMax = Math.max(Math.abs(min), Math.abs(max));
          const rangeWithMargin = absMax * (1 + margin);
          return { min: -rangeWithMargin, max: rangeWithMargin };
        }

        // Best fit for shared series
        const range = max - min || 1;
        min -= range * margin;
        max += range * margin;

        return { min, max };
      }

      // Independent bounds
      let min = Math.min(...data);
      let max = Math.max(...data);

      // Center Error (index 2) and Control (index 3) at 0
      const isErrorOrControl = label.includes('Error') || label.includes('Control');
      if (isErrorOrControl) {
        const absMax = Math.max(Math.abs(min), Math.abs(max));
        const rangeWithMargin = absMax * (1 + margin);
        return { min: -rangeWithMargin, max: rangeWithMargin };
      }

      // Best fit for Setpoint and Measured
      const range = max - min || 1;
      min -= range * margin;
      max += range * margin;

      return { min, max };
    });
  }, [series]);

  // X-axis bounds
  const xBounds = useMemo(() => {
    const xMin = 0;
    const xMax = timeHistory.length > 0 ? Math.max(...timeHistory) : 10;
    return { min: xMin, max: xMax };
  }, [timeHistory]);

  // Generate points for a data series
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

  // Calculate decimal places needed for a value
  const getDecimalPlaces = (value, range) => {
    if (range > 10) return 0;
    if (range > 1) return 1;
    if (range > 0.1) return 2;
    return 3;
  };

  // Generate Y-axis ticks for a specific series
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

  // Generate X-axis ticks
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
        {/* Grid lines (use first visible series for grid) */}
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

        {/* X-axis */}
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

        {/* Y-axes (one for each series, stacked on the left) */}
        {series.map(({ color }, seriesIndex) => {
          if (!visibleSeries[seriesIndex]) return null;

          const axisX = baseLeftPadding + (seriesIndex * axisSpacing);
          const ticks = generateTicks(seriesBounds[seriesIndex]);

          return (
            <g key={`axis-${seriesIndex}`}>
              {/* Axis line */}
              <line
                x1={axisX}
                y1={topPadding}
                x2={axisX}
                y2={topPadding + plotHeight}
                stroke={color}
                strokeWidth="2"
              />
              {/* Tick marks and labels */}
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

        {/* Data lines */}
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

        {/* Zero line (if any series crosses zero) */}
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

      {/* Legend (clickable) */}
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

export default DataChart;
