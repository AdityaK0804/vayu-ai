"use client";

import { SOURCE_LABEL, bandFor } from "@/lib/aqi";
import { useAttribution, useForecast, usePriority } from "@/lib/data";
import { useApp } from "@/lib/store";
import { selectFrame, type SourceKey } from "@/lib/types";

const ORDER: SourceKey[] = ["industry", "traffic", "fire", "dust"];

export default function AttributionCard() {
  const { city, selectedCell, timeIndex, selectCell } = useApp();
  const { data: attribution } = useAttribution(city);
  const { data: priority } = usePriority(city);
  const { data: forecast } = useForecast(city);

  if (!selectedCell) {
    return (
      <div className="px-5 py-4">
        <div className="label mb-2">Source attribution</div>
        <p className="text-[12px] leading-relaxed text-inkdim">
          Select a hexagon on the map, or a ward from the ranked list, to decompose its
          predicted PM2.5 into likely sources.
        </p>
      </div>
    );
  }

  const attr = attribution?.cells.find((c) => c.cell === selectedCell);
  const dossier = priority?.dossiers.find((d) => d.cell === selectedCell);
  const cellNow = selectFrame(forecast, timeIndex).find((c) => c.h3 === selectedCell);

  // A cell can be on the map but outside the top-N attributed set — say so
  // plainly rather than rendering an empty chart.
  if (!attr) {
    return (
      <div className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="label">Source attribution</div>
          <button onClick={() => selectCell(null)} className="label hover:text-accent">
            clear
          </button>
        </div>
        <div className="figure mb-1 text-[11px] text-inkdim">{selectedCell}</div>
        {cellNow && (
          <div className="mb-3 flex items-baseline gap-2">
            <span className="display text-3xl" style={{ color: bandFor(cellNow.pm25).hex }}>
              {Math.round(cellNow.pm25)}
            </span>
            <span className="label">µg/m³ · {bandFor(cellNow.pm25).label}</span>
          </div>
        )}
        <p className="text-[12px] leading-relaxed text-inkdim">
          Attribution is baked for the top-ranked cells only. This cell is outside that set.
        </p>
      </div>
    );
  }

  const band = bandFor(attr.predicted_pm25);

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="label">Source attribution</div>
        <button onClick={() => selectCell(null)} className="label hover:text-accent">
          clear
        </button>
      </div>

      <div className="figure mb-1 text-[11px] text-inkdim">{attr.ward}</div>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="display text-3xl" style={{ color: band.hex }}>
          {attr.predicted_pm25}
        </span>
        <span className="label">µg/m³ · {band.label}</span>
      </div>

      <div className="gold-rule mb-3" />

      <div className="mb-1 flex items-center justify-between">
        <span className="label">Top source</span>
        <span className="text-[12px] font-medium text-accent">
          {SOURCE_LABEL[attr.top_source] ?? attr.top_source}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {ORDER.filter((k) => attr.shares[k] !== undefined).map((k) => {
          const pct = (attr.shares[k] ?? 0) * 100;
          return (
            <div key={k}>
              <div className="mb-1 flex justify-between">
                <span className="text-[11px] text-inkdim">{SOURCE_LABEL[k]}</span>
                <span className="figure text-[11px]" style={{ color: "var(--ink)" }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-[3px] w-full bg-rule">
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    background: k === attr.top_source ? "var(--accent)" : "var(--accent-dim)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="gold-rule my-4" />

      <dl className="space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <dt className="text-inkdim">EDGAR inventory agrees</dt>
          <dd className={attr.edgar_match ? "text-accent" : "text-inkdim"}>
            {attr.edgar_match ? `yes · ${attr.edgar_top}` : `no · ${attr.edgar_top}`}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-inkdim">Confidence</dt>
          <dd className="figure">{(attr.confidence * 100).toFixed(0)}%</dd>
        </div>
        {attr.named_upwind_source && (
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-inkdim">Upwind</dt>
            <dd className="truncate text-right">{attr.named_upwind_source}</dd>
          </div>
        )}
      </dl>

      {dossier && (
        <p className="mt-4 border-l-2 border-accentdim pl-3 text-[11.5px] leading-relaxed text-inkdim">
          {dossier.recommended_action}
        </p>
      )}
    </div>
  );
}
