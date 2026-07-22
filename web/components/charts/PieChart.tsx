"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Composable pie / donut chart.
 *
 * The API mirrors the Bklit UI spec (PieChart / PieSlice / PieCenter / Legend,
 * same props and data shape) but the implementation is local SVG rather than
 * the registry package. Reason: that package pulls @visx/shape, @visx/group,
 * @visx/responsive, @visx/pattern, @visx/gradient and d3-shape — roughly 90 KB
 * gzipped of dependency to draw arcs, on a page we are actively trying to make
 * load faster. The arc maths is ~40 lines, so we own it instead.
 *
 * Angles follow the spec's convention: 0 rad points right, -PI/2 points up, and
 * the default sweep runs -PI/2 -> 3PI/2 (a full circle starting at 12 o'clock).
 * SVG's y-axis points down, so cos/sin map directly with no extra flip.
 */

export interface PieData {
  label: string;
  value: number;
  color?: string;
  fill?: string;
  /** optional free-form text shown by PieCenter on hover */
  note?: string;
}

/** Falls back to these when a datum carries no colour, per the spec's palette. */
const PALETTE = [
  "var(--chart-1, #38bdf8)",
  "var(--chart-2, #34d399)",
  "var(--chart-3, #f59e0b)",
  "var(--chart-4, #a78bfa)",
  "var(--chart-5, #f43f5e)",
];

interface Computed {
  start: number;
  end: number;
  frac: number;
}

interface Ctx {
  data: PieData[];
  arcs: Computed[];
  size: number;
  innerRadius: number;
  padAngle: number;
  cornerRadius: number;
  total: number;
  hovered: number | null;
  setHovered: (i: number | null) => void;
  progress: number;
}

const PieCtx = createContext<Ctx | null>(null);

function usePie(component: string) {
  const ctx = useContext(PieCtx);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <PieChart>`);
  return ctx;
}

/** Point on a circle at `angle`, radius `r`, centred on the chart. */
function pt(cx: number, cy: number, r: number, angle: number) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
}

/**
 * Path for one annular sector. With innerRadius 0 this degenerates to a wedge
 * drawn from the centre, which is what a solid pie needs.
 */
function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  a0: number,
  a1: number,
): string {
  const sweep = a1 - a0;
  if (sweep <= 0.0001) return "";

  // A single <path> arc cannot span a full turn, so a lone 100% slice is drawn
  // as two half-circles.
  if (sweep >= Math.PI * 2 - 0.0001) {
    const mid = a0 + Math.PI;
    return (
      arcPath(cx, cy, rOuter, rInner, a0, mid - 0.0001) +
      " " +
      arcPath(cx, cy, rOuter, rInner, mid, a0 + Math.PI * 2 - 0.0001)
    );
  }

  const large = sweep > Math.PI ? 1 : 0;
  const [x0o, y0o] = pt(cx, cy, rOuter, a0);
  const [x1o, y1o] = pt(cx, cy, rOuter, a1);

  if (rInner <= 0) {
    return `M ${cx} ${cy} L ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} Z`;
  }

  const [x1i, y1i] = pt(cx, cy, rInner, a1);
  const [x0i, y0i] = pt(cx, cy, rInner, a0);
  return (
    `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} ` +
    `L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i} Z`
  );
}

/** Mount sweep, eased. Honours prefers-reduced-motion by snapping to 1. */
function useSweep(enabled: boolean, ms = 700) {
  const [p, setP] = useState(enabled ? 0 : 1);
  const raf = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setP(1);
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setP(1 - Math.pow(1 - k, 3)); // ease-out cubic
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [enabled, ms]);

  return p;
}

/* ------------------------------------------------------------------- root */

export function PieChart({
  data,
  size = 240,
  innerRadius = 0,
  padAngle = 0,
  cornerRadius = 0,
  startAngle = -Math.PI / 2,
  endAngle = (3 * Math.PI) / 2,
  hoveredIndex,
  onHoverChange,
  animate = true,
  className = "",
  children,
}: {
  data: PieData[];
  size?: number;
  innerRadius?: number;
  padAngle?: number;
  cornerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  hoveredIndex?: number | null;
  onHoverChange?: (i: number | null) => void;
  animate?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [internalHover, setInternalHover] = useState<number | null>(null);
  const controlled = hoveredIndex !== undefined;
  const hovered = controlled ? hoveredIndex! : internalHover;

  const setHovered = (i: number | null) => {
    if (!controlled) setInternalHover(i);
    onHoverChange?.(i);
  };

  const total = useMemo(() => data.reduce((a, d) => a + Math.max(0, d.value), 0), [data]);

  const arcs = useMemo(() => {
    const span = endAngle - startAngle;
    let cursor = startAngle;
    return data.map((d) => {
      const frac = total > 0 ? Math.max(0, d.value) / total : 0;
      const start = cursor;
      const end = cursor + frac * span;
      cursor = end;
      return { start, end, frac };
    });
  }, [data, total, startAngle, endAngle]);

  const progress = useSweep(animate);

  return (
    <PieCtx.Provider
      value={{
        data,
        arcs,
        size,
        innerRadius,
        padAngle,
        cornerRadius,
        total,
        hovered,
        setHovered,
        progress,
      }}
    >
      <div
        className={className}
        style={{ position: "relative", width: size, height: size, flex: "none" }}
        onMouseLeave={() => setHovered(null)}
      >
        <svg width={size} height={size} style={{ overflow: "visible", display: "block" }}>
          {children}
        </svg>
      </div>
    </PieCtx.Provider>
  );
}

/* ------------------------------------------------------------------ slice */

export function PieSlice({
  index,
  color,
  fill,
  showGlow = true,
  hoverEffect = "translate",
  hoverOffset = 10,
}: {
  index: number;
  color?: string;
  fill?: string;
  animate?: boolean;
  showGlow?: boolean;
  hoverEffect?: "translate" | "grow" | "none";
  hoverOffset?: number;
}) {
  const { data, arcs, size, innerRadius, padAngle, cornerRadius, hovered, setHovered, progress } =
    usePie("PieSlice");

  const d = data[index];
  const a = arcs[index];
  if (!d || !a) return null;

  const isHovered = hovered === index;
  const dimmed = hovered !== null && !isHovered;
  const c = fill ?? d.fill ?? color ?? d.color ?? PALETTE[index % PALETTE.length];

  const cx = size / 2;
  const cy = size / 2;
  // cornerRadius is drawn as a round-joined stroke of the same colour, so the
  // rounding eats into the slice rather than growing it.
  const inset = cornerRadius / 2;
  const grow = hoverEffect === "grow" && isHovered ? hoverOffset : 0;
  const rOuter = size / 2 - inset + grow;
  const rInner = innerRadius > 0 ? Math.max(0, innerRadius + inset) : 0;

  // sweep in: each slice reveals across its own span as progress advances
  const start = a.start + padAngle / 2;
  const full = Math.max(start, a.end - padAngle / 2);
  const end = start + (full - start) * progress;

  const path = arcPath(cx, cy, rOuter, rInner, start, end);
  if (!path) return null;

  let translate = "";
  if (hoverEffect === "translate" && isHovered) {
    const mid = (start + full) / 2;
    translate = `translate(${Math.cos(mid) * hoverOffset}px, ${Math.sin(mid) * hoverOffset}px)`;
  }

  return (
    <g
      style={{
        transform: translate,
        transition: "transform .28s cubic-bezier(.34,1.56,.64,1), opacity .2s",
        opacity: dimmed ? 0.35 : 1,
        cursor: "pointer",
      }}
      onMouseEnter={() => setHovered(index)}
    >
      <path
        d={path}
        fill={c}
        stroke={cornerRadius > 0 ? c : "none"}
        strokeWidth={cornerRadius > 0 ? cornerRadius : 0}
        strokeLinejoin="round"
        style={{
          filter: showGlow && isHovered ? `drop-shadow(0 0 12px ${c})` : "none",
          transition: "filter .2s",
        }}
      />
      <title>{`${d.label}: ${d.value}`}</title>
    </g>
  );
}

/* ----------------------------------------------------------------- centre */

/**
 * Centre readout for donut charts. Rendered in a <foreignObject> so the label
 * is real HTML — it wraps, inherits our fonts and stays selectable, none of
 * which SVG <text> gives us. Only renders when innerRadius > 0, per the spec.
 */
export function PieCenter({
  defaultLabel = "Total",
  prefix,
  suffix,
  decimals = 0,
  children,
  className = "",
}: {
  defaultLabel?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  children?: (args: { label: string; value: number; index: number | null }) => ReactNode;
  className?: string;
}) {
  const { data, size, innerRadius, total, hovered } = usePie("PieCenter");
  if (innerRadius <= 0) return null;

  const label = hovered != null ? data[hovered]?.label ?? defaultLabel : defaultLabel;
  const value = hovered != null ? data[hovered]?.value ?? total : total;

  // square inscribed in the inner circle, so text never overlaps the ring
  const box = innerRadius * 1.42;

  return (
    <foreignObject
      x={size / 2 - box / 2}
      y={size / 2 - box / 2}
      width={box}
      height={box}
      style={{ pointerEvents: "none", overflow: "visible" }}
    >
      <div
        className={className}
        style={{
          width: box,
          height: box,
          display: "grid",
          placeContent: "center",
          textAlign: "center",
        }}
      >
        {children ? (
          children({ label, value, index: hovered })
        ) : (
          <>
            <div
              className="figure"
              style={{ fontSize: 24, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}
            >
              {prefix ?? ""}
              {value.toFixed(decimals)}
              {suffix ?? ""}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.25 }}>
              {label}
            </div>
          </>
        )}
      </div>
    </foreignObject>
  );
}

/* ----------------------------------------------------------------- legend */

export function Legend({
  data,
  hovered,
  onHover,
  formatValue = (v) => String(v),
  columns = 1,
}: {
  data: PieData[];
  hovered?: number | null;
  onHover?: (i: number | null) => void;
  formatValue?: (v: number, d: PieData) => string;
  columns?: number;
}) {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
        gap: 6,
        minWidth: 0,
        flex: 1,
      }}
      onMouseLeave={() => onHover?.(null)}
    >
      {data.map((d, i) => {
        const on = hovered === i;
        const off = hovered != null && !on;
        return (
          <button
            key={d.label}
            onMouseEnter={() => onHover?.(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11.5,
              padding: "4px 7px",
              borderRadius: 8,
              border: "1px solid transparent",
              background: on ? "var(--surface-2)" : "transparent",
              borderColor: on ? "var(--line)" : "transparent",
              opacity: off ? 0.45 : 1,
              transition: ".18s",
              cursor: "default",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: d.color ?? d.fill ?? PALETTE[i % PALETTE.length],
                flex: "none",
              }}
            />
            <span
              style={{
                color: "var(--ink-2)",
                flex: 1,
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {d.label}
            </span>
            <span className="figure" style={{ color: "var(--ink)", flex: "none" }}>
              {formatValue(d.value, d)}
            </span>
            <span
              className="figure"
              style={{ color: "var(--ink-3)", fontSize: 10, flex: "none", width: 32, textAlign: "right" }}
            >
              {Math.round((Math.max(0, d.value) / total) * 100)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Chart + legend side by side with hover synced both ways — the arrangement
 * every card in Analytics wants, so it lives here rather than being repeated.
 */
export function PieWithLegend({
  data,
  size = 190,
  innerRadius = 58,
  centerLabel = "Total",
  centerSuffix,
  centerDecimals = 0,
  formatValue,
  hoverEffect = "translate",
  legendColumns = 1,
}: {
  data: PieData[];
  size?: number;
  innerRadius?: number;
  centerLabel?: string;
  centerSuffix?: string;
  centerDecimals?: number;
  formatValue?: (v: number, d: PieData) => string;
  hoverEffect?: "translate" | "grow" | "none";
  legendColumns?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="sub" style={{ padding: "20px 0" }}>
        No data yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <PieChart
        data={data}
        size={size}
        innerRadius={innerRadius}
        padAngle={0.03}
        cornerRadius={3}
        hoveredIndex={hovered}
        onHoverChange={setHovered}
      >
        {data.map((_, i) => (
          <PieSlice key={i} index={i} hoverEffect={hoverEffect} hoverOffset={9} />
        ))}
        <PieCenter defaultLabel={centerLabel} suffix={centerSuffix} decimals={centerDecimals} />
      </PieChart>
      <Legend
        data={data}
        hovered={hovered}
        onHover={setHovered}
        formatValue={formatValue}
        columns={legendColumns}
      />
    </div>
  );
}
