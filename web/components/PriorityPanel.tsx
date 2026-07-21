"use client";

import { bandFor } from "@/lib/aqi";
import { usePriority } from "@/lib/data";
import { useApp } from "@/lib/store";

export default function PriorityPanel() {
  const { city, selectedCell, selectCell, setLayer } = useApp();
  const { data, isLoading } = usePriority(city);

  if (isLoading) return <div className="px-5 py-4 label">Loading dossiers…</div>;
  if (!data) return null;

  const noExceedance = data.cells_over_threshold === 0;

  return (
    <div className="px-5 py-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">Enforcement priority</span>
        <span className="figure text-[10px] text-inkdim">
          {data.signal_to_dossier_seconds}s to dossier
        </span>
      </div>
      <div className="figure mb-3 text-[10px] text-inkdim">
        {data.cells_over_threshold.toLocaleString()} of {data.cells_scored.toLocaleString()} cells
        over {data.threshold_ug_m3} µg/m³
      </div>

      {/* Honest empty-state: a ranked list with no exceedances is not an action list. */}
      {noExceedance && (
        <p className="mb-3 border-l-2 border-accentdim pl-3 text-[11.5px] leading-relaxed text-inkdim">
          No cell exceeds the standard in this window — these are ranked for context, not
          enforcement.
        </p>
      )}

      <ol className="thin-scroll max-h-[38vh] space-y-px overflow-y-auto">
        {data.dossiers.map((d) => {
          const active = d.cell === selectedCell;
          const band = bandFor(d.predicted_pm25);
          return (
            <li key={d.cell}>
              <button
                onClick={() => {
                  selectCell(d.cell);
                  setLayer("priority");
                }}
                className="w-full border-l-2 px-3 py-2 text-left transition"
                style={{
                  borderColor: active ? "var(--accent)" : "transparent",
                  background: active ? "var(--surface-2)" : "transparent",
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="figure text-[11px] text-inkdim">
                    {String(d.rank).padStart(2, "0")}
                  </span>
                  <span className="flex-1 truncate text-[12px]">{d.ward}</span>
                  <span className="figure text-[12px]" style={{ color: band.hex }}>
                    {d.predicted_pm25}
                  </span>
                </div>
                <div className="mt-0.5 flex justify-between pl-6">
                  <span className="text-[10px] text-inkdim">
                    {d.top_source} · {d.population_affected.toLocaleString()} people ·{" "}
                    {d.vulnerable_sites} sites
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
