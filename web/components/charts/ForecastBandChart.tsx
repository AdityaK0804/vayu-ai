"use client";

import { useMemo } from "react";
import { cpcbPm25Css } from "@/lib/aqiScale";

interface ForecastBandChartProps {
  data: number[];
  width?: number;
  height?: number;
  threshold?: number;
}

export default function ForecastBandChart({
  data,
  width = 300,
  height = 100,
  threshold = 60,
}: ForecastBandChartProps) {
  const { pathData, maxVal } = useMemo(() => {
    if (data.length === 0) return { pathData: "", maxVal: 0 };
    const max = Math.max(...data, threshold + 20);
    const min = 0;
    
    const scaleX = (i: number) => (i / (data.length - 1)) * width;
    const scaleY = (v: number) => height - (v / max) * height;

    const points = data.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(" L ");
    
    // Create an area path
    const pathData = `M 0,${height} L 0,${scaleY(data[0])} L ${points} L ${width},${scaleY(data[data.length - 1])} L ${width},${height} Z`;
    
    return { pathData, maxVal: max };
  }, [data, width, height, threshold]);

  if (data.length === 0) return null;

  const thresholdY = height - (threshold / maxVal) * height;

  return (
    <div style={{ position: "relative", width, height }}>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        {/* Fill Area */}
        <path
          d={pathData}
          fill="color-mix(in oklch, var(--accent) 20%, transparent)"
          stroke="none"
        />
        {/* Line */}
        <path
          d={pathData.replace(/M 0,\d+ L 0,[\d.]+ L /, "M 0,").replace(/ L \d+,[\d.]+ L \d+,\d+ Z/, "")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        {/* Threshold Line */}
        <line
          x1={0}
          y1={thresholdY}
          x2={width}
          y2={thresholdY}
          stroke="var(--aqi-4)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <text
          x={width - 5}
          y={thresholdY - 5}
          fill="var(--aqi-4)"
          fontSize="9"
          textAnchor="end"
        >
          {threshold} µg/m³ std
        </text>
        
        {/* Plot points */}
        {data.map((v, i) => (
          <circle
            key={i}
            cx={(i / (data.length - 1)) * width}
            cy={height - (v / maxVal) * height}
            r="3"
            fill="var(--surface)"
            stroke={cpcbPm25Css(v)}
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  );
}
