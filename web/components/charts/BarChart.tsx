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
 * Composable bar chart.
 *
 * Same reasoning as PieChart in this folder: the API mirrors the Bklit UI spec
 * (BarChart / Bar / BarXAxis / BarYAxis / Grid / ChartTooltip, same props and
 * the same `xDataKey` + `dataKey` data shape), but the implementation is local
 * SVG. The registry package wants @visx/shape, @visx/scale, @visx/responsive,
 * @visx/event, @visx/grid, d3-array, motion and react-use-measure — well over
 * 100 KB gzipped to draw rectangles, on pages we just spent effort halving.
 *
 * Supported from the spec: grouped and stacked bars, horizontal orientation,
 * grow/fade animations with automatic stagger, lineCap, fadedOpacity, barGap,
 * barWidth, margin, aspectRatio, animationDuration, and the loading skeleton.
 * Not implemented: 3D depth layers, square columns, patterns and gradients —
 * nothing here needs them, and unused code is code that rots.
 */

export type Datum = Record<string, unknown>;

interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_MARGIN: Margin = { top: 16, right: 16, bottom: 30, left: 40 };
const EASE = "cubic-bezier(0.85, 0, 0.15, 1)";

interface SeriesMeta {
  dataKey: string;
  fill: string;
  label?: string;
}

interface Ctx {
  data: Datum[];
  xDataKey: string;
  width: number;
  height: number;
  margin: Margin;
  innerW: number;
  innerH: number;
  orientation: "vertical" | "horizontal";
  stacked: boolean;
  barGap: number;
  barWidth?: number;
  animationDuration: number;
  status: "loading" | "ready";
  /** value -> pixel along the measured axis */
  scaleValue: (v: number) => number;
  /** band start for data index i */
  bandStart: (i: number) => number;
  bandWidth: number;
  maxValue: number;
  series: SeriesMeta[];
  registerSeries: (s: SeriesMeta) => void;
  hovered: number | null;
  setHovered: (i: number | null) => void;
  hoveredKey: string | null;
  setHoveredKey: (k: string | null) => void;
}

const ChartCtx = createContext<Ctx | null>(null);

export function useChart() {
  const c = useContext(ChartCtx);
  if (!c) throw new Error("chart components must be rendered inside <BarChart>");
  return c;
}

const num = (d: Datum, k: string) => {
  const v = d[k];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

/** Rounded-rect path with only the "far end" corners capped. */
function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  orientation: "vertical" | "horizontal",
) {
  const rr = Math.max(0, Math.min(r, orientation === "vertical" ? w / 2 : h / 2, orientation === "vertical" ? h : w));
  if (rr <= 0.5) return `M${x},${y}h${w}v${h}h${-w}Z`;
  if (orientation === "vertical") {
    // cap the top
    return (
      `M${x},${y + h}V${y + rr}a${rr},${rr} 0 0 1 ${rr},${-rr}` +
      `h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}V${y + h}Z`
    );
  }
  // cap the right
  return (
    `M${x},${y}h${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}` +
    `v${h - 2 * rr}a${rr},${rr} 0 0 1 ${-rr},${rr}H${x}Z`
  );
}

/* ------------------------------------------------------------------- root */

export function BarChart({
  data,
  xDataKey = "name",
  margin,
  animationDuration = 1100,
  aspectRatio = "2 / 1",
  barGap = 0.2,
  barWidth,
  orientation = "vertical",
  stacked = false,
  status = "ready",
  height,
  className = "",
  children,
}: {
  data: Datum[];
  xDataKey?: string;
  margin?: Partial<Margin>;
  animationDuration?: number;
  aspectRatio?: string;
  barGap?: number;
  barWidth?: number;
  orientation?: "vertical" | "horizontal";
  stacked?: boolean;
  status?: "loading" | "ready";
  /** fixed pixel height; overrides aspectRatio when given */
  height?: number;
  className?: string;
  children?: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<number | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesMeta[]>([]);

  // ResizeObserver rather than react-use-measure — one browser API, no dep
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const registerSeries = useMemo(
    () => (s: SeriesMeta) =>
      setSeries((prev) =>
        prev.some((p) => p.dataKey === s.dataKey && p.fill === s.fill && p.label === s.label)
          ? prev
          : [...prev.filter((p) => p.dataKey !== s.dataKey), s],
      ),
    [],
  );

  const m: Margin = { ...DEFAULT_MARGIN, ...margin };
  const width = box.w;
  const h = height ?? box.h;
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = Math.max(0, h - m.top - m.bottom);

  const keys = series.map((s) => s.dataKey);
  const maxValue = useMemo(() => {
    if (!data.length || !keys.length) return 1;
    const totals = data.map((d) =>
      stacked ? keys.reduce((a, k) => a + num(d, k), 0) : Math.max(...keys.map((k) => num(d, k))),
    );
    return Math.max(1, ...totals);
  }, [data, keys.join("|"), stacked]);

  // vertical: value maps to height; horizontal: value maps to width
  const axisLen = orientation === "vertical" ? innerH : innerW;
  const scaleValue = (v: number) => (maxValue > 0 ? (v / maxValue) * axisLen : 0);

  const bandLen = orientation === "vertical" ? innerW : innerH;
  const band = data.length ? bandLen / data.length : 0;
  const bandStart = (i: number) => i * band;

  const ctx: Ctx = {
    data,
    xDataKey,
    width,
    height: h,
    margin: m,
    innerW,
    innerH,
    orientation,
    stacked,
    barGap,
    barWidth,
    animationDuration,
    status,
    scaleValue,
    bandStart,
    bandWidth: band,
    maxValue,
    series,
    registerSeries,
    hovered,
    setHovered,
    hoveredKey,
    setHoveredKey,
  };

  return (
    <ChartCtx.Provider value={ctx}>
      <div
        ref={wrap}
        className={className}
        style={{
          position: "relative",
          width: "100%",
          ...(height ? { height } : { aspectRatio }),
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {width > 0 && h > 0 && (
          <svg width={width} height={h} style={{ display: "block", overflow: "visible" }}>
            <g transform={`translate(${m.left},${m.top})`}>{children}</g>
          </svg>
        )}
      </div>
    </ChartCtx.Provider>
  );
}

/** Turnkey shortcut for <BarChart status="loading" />. */
export function BarChartLoading(props: {
  margin?: Partial<Margin>;
  aspectRatio?: string;
  height?: number;
  className?: string;
}) {
  return (
    <BarChart data={[]} status="loading" {...props}>
      <Grid horizontal />
    </BarChart>
  );
}

/* ------------------------------------------------------------------- grid */

export function Grid({
  horizontal = true,
  vertical = false,
  ticks = 4,
}: {
  horizontal?: boolean;
  vertical?: boolean;
  fadeHorizontal?: boolean;
  fadeVertical?: boolean;
  ticks?: number;
}) {
  const { innerW, innerH, data, bandStart, bandWidth, maxValue } = useChart();
  const lines: ReactNode[] = [];

  if (horizontal) {
    for (let i = 0; i <= ticks; i++) {
      const y = innerH - (i / ticks) * innerH;
      lines.push(
        <g key={`h${i}`}>
          <line
            x1={0}
            x2={innerW}
            y1={y}
            y2={y}
            stroke="var(--line)"
            strokeWidth={1}
            opacity={i === 0 ? 0.9 : 0.4}
          />
          <text
            x={-8}
            y={y}
            textAnchor="end"
            dominantBaseline="middle"
            style={{ fontSize: 9.5, fill: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
          >
            {Math.round((i / ticks) * maxValue)}
          </text>
        </g>,
      );
    }
  }
  if (vertical) {
    data.forEach((_, i) => {
      const x = bandStart(i) + bandWidth;
      lines.push(
        <line key={`v${i}`} x1={x} x2={x} y1={0} y2={innerH} stroke="var(--line)" opacity={0.3} />,
      );
    });
  }
  return <g>{lines}</g>;
}

/* -------------------------------------------------------------------- bar */

export function Bar({
  dataKey,
  fill = "var(--accent)",
  label,
  lineCap = "round",
  animate = true,
  animationType = "grow",
  fadedOpacity = 0.3,
  staggerDelay,
}: {
  dataKey: string;
  fill?: string;
  /** legend/tooltip name; defaults to dataKey */
  label?: string;
  lineCap?: "round" | "butt" | number;
  animate?: boolean;
  animationType?: "grow" | "fade";
  fadedOpacity?: number;
  staggerDelay?: number;
}) {
  const c = useChart();
  const {
    data,
    series,
    registerSeries,
    orientation,
    stacked,
    barGap,
    barWidth,
    bandStart,
    bandWidth,
    scaleValue,
    innerH,
    hovered,
    setHovered,
    hoveredKey,
    animationDuration,
    status,
  } = c;

  useEffect(() => {
    registerSeries({ dataKey, fill, label });
  }, [dataKey, fill, label, registerSeries]);

  const idx = series.findIndex((s) => s.dataKey === dataKey);
  const n = Math.max(1, series.length);
  if (status === "loading" || idx < 0) return null;

  const inner = bandWidth * (1 - barGap);
  const slot = stacked ? inner : inner / n;
  const w = barWidth ?? slot;
  const radius = lineCap === "round" ? Math.min(w / 2, 6) : lineCap === "butt" ? 0 : lineCap;
  const stagger = staggerDelay ?? Math.min(0.06, (animationDuration / 1000) * 0.25 / Math.max(1, data.length));

  return (
    <g>
      {data.map((d, i) => {
        const v = num(d, dataKey);
        const len = scaleValue(v);

        // stacked bars sit on the running total of the series below them
        const below = stacked
          ? series.slice(0, idx).reduce((a, s) => a + scaleValue(num(d, s.dataKey)), 0)
          : 0;

        const off = bandStart(i) + (bandWidth - inner) / 2 + (stacked ? 0 : idx * slot);
        const dim = hovered !== null && hovered !== i;
        const dimKey = hoveredKey !== null && hoveredKey !== dataKey;
        const opacity = dim || dimKey ? fadedOpacity : 1;

        const x = orientation === "vertical" ? off + (slot - w) / 2 : below;
        const y =
          orientation === "vertical" ? innerH - len - below : off + (slot - w) / 2;
        const bw = orientation === "vertical" ? w : len;
        const bh = orientation === "vertical" ? len : w;

        return (
          <path
            key={`${dataKey}-${i}`}
            d={barPath(x, y, bw, bh, radius, orientation)}
            fill={fill}
            onMouseEnter={() => setHovered(i)}
            style={{
              opacity,
              transition: `opacity .18s`,
              transformBox: "fill-box",
              transformOrigin: orientation === "vertical" ? "bottom" : "left",
              ...(animate
                ? animationType === "grow"
                  ? {
                      animation: `barGrow${orientation === "vertical" ? "V" : "H"} ${
                        animationDuration
                      }ms ${EASE} ${i * stagger}s both`,
                    }
                  : { animation: `barFade ${animationDuration}ms ease ${i * stagger}s both` }
                : {}),
            }}
          >
            <title>{`${label ?? dataKey}: ${v}`}</title>
          </path>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------- axes */

export function BarXAxis({ maxLabels = 12, showAllLabels = false }: { maxLabels?: number; showAllLabels?: boolean }) {
  const { data, xDataKey, bandStart, bandWidth, innerH } = useChart();
  const step = showAllLabels ? 1 : Math.max(1, Math.ceil(data.length / maxLabels));
  return (
    <g>
      {data.map((d, i) =>
        i % step === 0 ? (
          <text
            key={i}
            x={bandStart(i) + bandWidth / 2}
            y={innerH + 18}
            textAnchor="middle"
            style={{
              fontSize: 10,
              fill: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              letterSpacing: ".08em",
            }}
          >
            {String(d[xDataKey] ?? "")}
          </text>
        ) : null,
      )}
    </g>
  );
}

export function BarYAxis({ maxLabels = 20 }: { maxLabels?: number }) {
  const { data, xDataKey, bandStart, bandWidth } = useChart();
  const step = Math.max(1, Math.ceil(data.length / maxLabels));
  return (
    <g>
      {data.map((d, i) =>
        i % step === 0 ? (
          <text
            key={i}
            x={-8}
            y={bandStart(i) + bandWidth / 2}
            textAnchor="end"
            dominantBaseline="middle"
            style={{ fontSize: 10, fill: "var(--ink-3)" }}
          >
            {String(d[xDataKey] ?? "")}
          </text>
        ) : null,
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- tooltip */

export function ChartTooltip({
  showCrosshair = true,
  formatValue = (v: number) => String(v),
  unit = "",
}: {
  showCrosshair?: boolean;
  formatValue?: (v: number) => string;
  unit?: string;
}) {
  const { data, xDataKey, series, hovered, setHovered, bandStart, bandWidth, innerH, innerW } =
    useChart();

  return (
    <g>
      {/* invisible hit bands: hovering anywhere in a column selects it */}
      {data.map((_, i) => (
        <rect
          key={i}
          x={bandStart(i)}
          y={0}
          width={bandWidth}
          height={innerH}
          fill="transparent"
          onMouseEnter={() => setHovered(i)}
        />
      ))}

      {hovered != null && data[hovered] && (
        <>
          {showCrosshair && (
            <line
              x1={bandStart(hovered) + bandWidth / 2}
              x2={bandStart(hovered) + bandWidth / 2}
              y1={0}
              y2={innerH}
              stroke="var(--ink-3)"
              strokeDasharray="3 3"
              opacity={0.5}
              pointerEvents="none"
            />
          )}
          {(() => {
            const w = 148;
            const rows = series.length;
            const hgt = 26 + rows * 17;
            const cx = bandStart(hovered) + bandWidth / 2;
            // flip to the left near the right edge so it never clips
            const x = Math.min(Math.max(0, cx + 12), Math.max(0, innerW - w));
            return (
              <foreignObject x={x} y={6} width={w} height={hgt} pointerEvents="none">
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "7px 9px",
                    boxShadow: "var(--shadow)",
                    fontSize: 11,
                  }}
                >
                  <div className="crumb" style={{ fontSize: 9.5, marginBottom: 5 }}>
                    {String(data[hovered][xDataKey] ?? "")}
                  </div>
                  {series.map((s) => (
                    <div
                      key={s.dataKey}
                      style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}
                    >
                      <span
                        style={{ width: 8, height: 8, borderRadius: 2, background: s.fill, flex: "none" }}
                      />
                      <span style={{ color: "var(--ink-2)", flex: 1, minWidth: 0 }}>
                        {s.label ?? s.dataKey}
                      </span>
                      <span className="figure" style={{ color: "var(--ink)" }}>
                        {formatValue(num(data[hovered], s.dataKey))}
                        {unit}
                      </span>
                    </div>
                  ))}
                </div>
              </foreignObject>
            );
          })()}
        </>
      )}
    </g>
  );
}

/**
 * Series legend. Lives outside <BarChart> (it is HTML, not SVG) and so takes
 * its series explicitly rather than reading chart context.
 */
export function BarLegend({ series }: { series: { label: string; fill: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
      {series.map((s) => (
        <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: s.fill, flex: "none" }} />
          <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
        </span>
      ))}
    </div>
  );
}
