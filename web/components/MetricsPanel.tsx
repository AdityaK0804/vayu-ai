"use client";

import { useMetrics } from "@/lib/data";
import { useApp } from "@/lib/store";

export default function MetricsPanel() {
  const { city } = useApp();
  const { data } = useMetrics(city);
  if (!data) return null;

  const h24 = data.forecast_vs_baselines.find((h) => h.horizon_h === 24);
  const loso = data.zero_station_loso;

  return (
    <div className="px-5 py-4">
      <div className="label mb-3">Proof</div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat
          value={h24?.model_rmse ?? null}
          unit="µg/m³"
          caption="model RMSE @24h"
          accent
        />
        <Stat value={h24?.persistence_rmse ?? null} unit="µg/m³" caption="persistence" />
        <Stat value={h24?.cams_bc_rmse ?? null} unit="µg/m³" caption="CAMS (bias-corr.)" />
        <Stat
          value={loso.rmse_satellite_subset ?? null}
          unit="µg/m³"
          caption="zero-station LOSO"
          accent
        />
      </div>

      <div className="gold-rule mb-3" />

      <table className="w-full text-[11px]">
        <thead>
          <tr className="label">
            <th className="pb-1 text-left font-normal">H</th>
            <th className="pb-1 text-right font-normal">model</th>
            <th className="pb-1 text-right font-normal">vs pers.</th>
            <th className="pb-1 text-right font-normal">vs CAMS</th>
          </tr>
        </thead>
        <tbody className="figure">
          {data.forecast_vs_baselines.map((h) => (
            <tr key={h.horizon_h} className="border-t border-rule">
              <td className="py-1 text-inkdim">{h.horizon_h}h</td>
              <td className="py-1 text-right">{h.model_rmse ?? "—"}</td>
              <td className="py-1 text-right text-accent">
                {h.vs_persistence_pct != null ? `+${h.vs_persistence_pct}%` : "—"}
              </td>
              <td className="py-1 text-right text-accent">
                {h.vs_cams_bc_pct != null ? `+${h.vs_cams_bc_pct}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="gold-rule my-3" />

      <dl className="space-y-1 text-[11px]">
        <Row k="Training rows" v={data.dataset.pooled_target_rows?.toLocaleString() ?? "—"} />
        <Row k="Stations" v={String(data.dataset.stations ?? "—")} />
        <Row
          k="Window"
          v={
            data.dataset.window
              ? `${data.dataset.window[0].slice(0, 7)} → ${data.dataset.window[1].slice(0, 7)}`
              : "—"
          }
        />
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-inkdim">{data.headline}</p>
    </div>
  );
}

function Stat({
  value,
  unit,
  caption,
  accent,
}: {
  value: number | null;
  unit: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-rule bg-surface2 px-3 py-2">
      <div className="flex items-baseline gap-1">
        <span
          className="display text-xl"
          style={{ color: accent ? "var(--accent)" : "var(--ink)" }}
        >
          {value ?? "—"}
        </span>
        <span className="text-[9px] text-inkdim">{unit}</span>
      </div>
      <div className="label mt-0.5">{caption}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-inkdim">{k}</dt>
      <dd className="figure">{v}</dd>
    </div>
  );
}
