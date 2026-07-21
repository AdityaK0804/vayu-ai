"use client";

import { useEffect } from "react";
import { useForecast } from "@/lib/data";
import { useApp } from "@/lib/store";

const FRAME_MS = 900;

export default function TimeSlider() {
  const { city, timeIndex, setTimeIndex, playing, togglePlaying, setPlaying } = useApp();
  const { data } = useForecast(city);

  const n = data?.timestamps.length ?? 0;
  const step = data?.frame_step_hours ?? 6;

  // advance frames while playing; stop cleanly at the end
  useEffect(() => {
    if (!playing || n === 0) return;
    const id = setInterval(() => {
      const next = useApp.getState().timeIndex + 1;
      if (next >= n) {
        setPlaying(false);
        setTimeIndex(n - 1);
      } else {
        setTimeIndex(next);
      }
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [playing, n, setTimeIndex, setPlaying]);

  if (!data) return null;

  const ts = data.timestamps[timeIndex];
  const hoursOut = timeIndex * step;
  const pretty = ts?.replace(" ", " · ").slice(0, 16) ?? "";

  return (
    <div className="rule-t bg-surface/95 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlaying}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accentdim text-accent transition hover:bg-accent hover:text-carbon"
        >
          {playing ? (
            <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
              <rect x="0" y="0" width="3.5" height="12" />
              <rect x="7" y="0" width="3.5" height="12" />
            </svg>
          ) : (
            <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
              <path d="M0 0 L11 6 L0 12 Z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="label">Forecast horizon</span>
            <span className="figure text-[11px] text-inkdim">
              {pretty} &nbsp;·&nbsp; <span className="text-accent">T+{hoursOut}h</span>
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, n - 1)}
            value={timeIndex}
            onChange={(e) => {
              setPlaying(false);
              setTimeIndex(Number(e.target.value));
            }}
            className="h-1 w-full cursor-pointer appearance-none rounded bg-rule accent-[color:var(--accent)]"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${
                (timeIndex / Math.max(1, n - 1)) * 100
              }%, var(--rule) ${(timeIndex / Math.max(1, n - 1)) * 100}%, var(--rule) 100%)`,
            }}
          />

          <div className="mt-1 flex justify-between">
            {data.timestamps.map((_, i) => (
              <span
                key={i}
                className="figure text-[9px]"
                style={{ color: i === timeIndex ? "var(--accent)" : "var(--rule)" }}
              >
                {i * step}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
