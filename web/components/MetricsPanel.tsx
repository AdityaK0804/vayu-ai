"use client";

import { useMetrics } from "@/lib/data";
import { useApp } from "@/lib/store";

/**
 * Proof panel — model skill metrics, NOT live AQI.
 * Live AQI (28 / 50 / etc.) is ambient air. This panel shows how wrong the
 * forecast is on average (RMSE). Lower RMSE after v2.1 = better model.
 */
export default function MetricsPanel() {
  const { city } = useApp();
  const { data } = useMetrics(city);
  if (!data) return null;

  const h24 = data.forecast_vs_baselines.find((h) => h.horizon_h === 24);
  const loso = data.zero_station_loso;
  const ver = data.model_version ?? "v2.1";

  return (
    <div className="px-5 py-4">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="label">Proof (model skill)</div>
        <span className="rounded border border-rule px-1.5 py-0.5 text-[9px] text-accent">
          {ver}
        </span>
      </div>
      <p className="mb-3 text-[10px] leading-snug text-inkdim">
        Numbers below are forecast error (µg/m³ RMSE) — not live AQI. Map AQI can
        stay ~30–50 while the model still gets more accurate.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat
          value={h24?.model_rmse ?? null}
          unit="µg/m³"
          caption="model RMSE @24h"
          accent
        />
        <Stat
          value={h24?.v1_rmse ?? null}
          unit="µg/m³"
          caption="v1 RMSE @24h (old)"
        />
        <Stat
          value={h24?.vs_v1_pct ?? null}
          unit="%"
          caption="better than v1"
          accent
          prefix="+"
        />
        <Stat
          value={h24?.vs_persistence_pct ?? null}
          unit="%"
          caption="better than persistence"
          accent
          prefix="+"
        />
        <Stat value={h24?.persistence_rmse ?? null} unit="µg/m³" caption="persistence" />
        <Stat value={h24?.cams_bc_rmse ?? null} unit="µg/m³" caption="CAMS (bias-corr.)" />
        <Stat
          value={loso.rmse_satellite_subset ?? null}
          unit="µg/m³"
          caption="zero-station LOSO"
          accent
        />
        <Stat
          value={
            h24?.quantile_picp != null
              ? Math.round(h24.quantile_picp * 1000) / 10
              : null
          }
          unit="%"
          caption="band coverage (PICP)"
        />
      </div>

      <div className="gold-rule mb-3" />

      <table className="w-full text-[11px]">
        <thead>
          <tr className="label">
            <th className="pb-1 text-left font-normal">H</th>
            <th className="pb-1 text-right font-normal">model</th>
            <th className="pb-1 text-right font-normal">v1</th>
            <th className="pb-1 text-right font-normal">vs v1</th>
            <th className="pb-1 text-right font-normal">vs pers.</th>
          </tr>
        </thead>
        <tbody className="figure">
          {data.forecast_vs_baselines.map((h) => (
            <tr key={h.horizon_h} className="border-t border-rule">
              <td className="py-1 text-inkdim">{h.horizon_h}h</td>
              <td className="py-1 text-right text-accent">{h.model_rmse ?? "—"}</td>
              <td className="py-1 text-right text-inkdim">{h.v1_rmse ?? "—"}</td>
              <td className="py-1 text-right text-accent">
                {h.vs_v1_pct != null ? `+${h.vs_v1_pct}%` : "—"}
              </td>
              <td className="py-1 text-right">
                {h.vs_persistence_pct != null ? `+${h.vs_persistence_pct}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="gold-rule my-3" />

      <dl className="space-y-1 text-[11px]">
        <Row k="Training rows" v={data.dataset.pooled_target_rows?.toLocaleString() ?? "—"} />
        <Row k="Stations" v={String(data.dataset.stations ?? "—")} />
        <Row k="Features" v={String(data.dataset.n_features ?? "93")} />
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
  prefix = "",
}: {
  value: number | null;
  unit: string;
  caption: string;
  accent?: boolean;
  prefix?: string;
}) {
  return (
    <div className="border border-rule bg-surface2 px-3 py-2">
      <div className="flex items-baseline gap-1">
        <span
          className="display text-xl"
          style={{ color: accent ? "var(--accent)" : "var(--ink)" }}
        >
          {value != null ? `${prefix}${value}` : "—"}
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
