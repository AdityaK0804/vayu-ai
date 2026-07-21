"use client";

import { useStations } from "@/lib/data";
import { useApp } from "@/lib/store";

/**
 * The Jagdalpur moment: the city has zero ground sensors, so we first show the
 * empty map (what a sensor-based system can say: nothing), then reveal the
 * predicted field.
 */
export default function RevealToggle() {
  const { city, revealed, setRevealed } = useApp();
  const { data: stations } = useStations(city);

  if (city !== "jagdalpur") return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      {!revealed ? (
        <div className="pointer-events-auto max-w-md border border-rule bg-surface/95 p-7 text-center backdrop-blur accent-glow">
          <div className="label mb-3">Jagdalpur</div>
          <h2 className="display mb-3 text-2xl leading-snug">
            Zero ground sensors.
          </h2>
          <p className="mb-1 text-[12.5px] leading-relaxed text-inkdim">
            {stations?.note ??
              "No CPCB monitoring station exists in this city."}
          </p>
          <p className="mb-6 text-[12.5px] leading-relaxed text-inkdim">
            A sensor-based system reports nothing here. AirSight forecasts it blind, from
            satellite, meteorology and emissions geography alone.
          </p>
          <button
            onClick={() => setRevealed(true)}
            className="border border-accent px-5 py-2 text-[11px] uppercase tracking-[0.16em] text-accent transition hover:bg-accent hover:text-carbon"
          >
            Predict it anyway
          </button>
        </div>
      ) : (
        <button
          onClick={() => setRevealed(false)}
          className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 border border-rule bg-surface/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-inkdim backdrop-blur transition hover:text-accent"
        >
          Reset reveal
        </button>
      )}
    </div>
  );
}
