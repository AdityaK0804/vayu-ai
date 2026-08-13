"use client";

import React from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { useApp } from "@/lib/store";
import { useWhatIf } from "@/lib/data";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { useT } from "@/lib/i18n";

export default function WhatIfPanel() {
  const { t } = useT();
  const scenarioActive = useApp((s) => s.scenarioActive);
  const scenario = useApp((s) => s.scenario);
  const setScenarioActive = useApp((s) => s.setScenarioActive);
  const setScenario = useApp((s) => s.setScenario);

  const { data: whatif, isFetching } = useWhatIf();

  return (
    <div className="card" style={{ flex: "0 0 320px", display: "flex", flexDirection: "column" }}>
      <div className="panel-header" style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>What-If Simulator</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Test policy interventions</div>
          </div>
          <Switch.Root
            className="SwitchRoot"
            checked={scenarioActive}
            onCheckedChange={setScenarioActive}
            style={{
              width: 42,
              height: 25,
              backgroundColor: scenarioActive ? "var(--aqi-2)" : "var(--surface-3)",
              borderRadius: "9999px",
              position: "relative",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Switch.Thumb
              className="SwitchThumb"
              style={{
                display: "block",
                width: 21,
                height: 21,
                backgroundColor: "white",
                borderRadius: "9999px",
                transition: "transform 100ms",
                transform: `translateX(${scenarioActive ? "19px" : "2px"})`,
              }}
            />
          </Switch.Root>
        </div>
      </div>

      <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: 24, opacity: scenarioActive ? 1 : 0.5, pointerEvents: scenarioActive ? "auto" : "none" }}>
        
        {/* Traffic Delta */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--ink-2)" }}>
            <span>Traffic Emissions</span>
            <span>{Math.round(scenario.traffic_delta * 100)}%</span>
          </div>
          <Slider.Root
            value={[scenario.traffic_delta * 100]}
            onValueChange={([val]) => setScenario({ traffic_delta: val / 100 })}
            max={0}
            min={-100}
            step={5}
            style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: 20 }}
          >
            <Slider.Track style={{ backgroundColor: "var(--surface-3)", position: "relative", flexGrow: 1, borderRadius: 9999, height: 4 }}>
              <Slider.Range style={{ position: "absolute", backgroundColor: "var(--ink-2)", borderRadius: 9999, height: "100%" }} />
            </Slider.Track>
            <Slider.Thumb style={{ display: "block", width: 16, height: 16, backgroundColor: "var(--ink)", borderRadius: 10, outline: "none", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }} />
          </Slider.Root>
        </div>

        {/* Industry Delta */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--ink-2)" }}>
            <span>Industry Output</span>
            <span>{Math.round(scenario.industry_delta * 100)}%</span>
          </div>
          <Slider.Root
            value={[scenario.industry_delta * 100]}
            onValueChange={([val]) => setScenario({ industry_delta: val / 100 })}
            max={0}
            min={-100}
            step={5}
            style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: 20 }}
          >
            <Slider.Track style={{ backgroundColor: "var(--surface-3)", position: "relative", flexGrow: 1, borderRadius: 9999, height: 4 }}>
              <Slider.Range style={{ position: "absolute", backgroundColor: "var(--ink-2)", borderRadius: 9999, height: "100%" }} />
            </Slider.Track>
            <Slider.Thumb style={{ display: "block", width: 16, height: 16, backgroundColor: "var(--ink)", borderRadius: 10, outline: "none", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }} />
          </Slider.Root>
        </div>

        {/* Crop Fire Reduction */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--ink-2)" }}>
            <span>Crop Fire Reduction</span>
            <span>{Math.round(scenario.fire_reduction * 100)}%</span>
          </div>
          <Slider.Root
            value={[scenario.fire_reduction * 100]}
            onValueChange={([val]) => setScenario({ fire_reduction: val / 100 })}
            max={100}
            min={0}
            step={5}
            style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: 20 }}
          >
            <Slider.Track style={{ backgroundColor: "var(--surface-3)", position: "relative", flexGrow: 1, borderRadius: 9999, height: 4 }}>
              <Slider.Range style={{ position: "absolute", backgroundColor: "var(--ink-2)", borderRadius: 9999, height: "100%" }} />
            </Slider.Track>
            <Slider.Thumb style={{ display: "block", width: 16, height: 16, backgroundColor: "var(--ink)", borderRadius: 10, outline: "none", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.3)" }} />
          </Slider.Root>
        </div>

        {/* Ward Sprinkling */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>Ward Water Sprinkling</div>
          <Switch.Root
            checked={scenario.ward_sprinkling}
            onCheckedChange={(c) => setScenario({ ward_sprinkling: c })}
            style={{
              width: 36,
              height: 20,
              backgroundColor: scenario.ward_sprinkling ? "var(--aqi-1)" : "var(--surface-3)",
              borderRadius: "9999px",
              position: "relative",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Switch.Thumb
              style={{
                display: "block",
                width: 16,
                height: 16,
                backgroundColor: "white",
                borderRadius: "9999px",
                transition: "transform 100ms",
                transform: `translateX(${scenario.ward_sprinkling ? "18px" : "2px"})`,
              }}
            />
          </Switch.Root>
        </div>

      </div>

      {/* Impact Stats */}
      {scenarioActive && (
        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--line)", background: "var(--surface-2)", transition: "opacity 200ms", opacity: isFetching ? 0.6 : 1 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.05em", color: "var(--ink-3)", marginBottom: 12, textTransform: "uppercase" }}>Estimated Impact</div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, color: "var(--aqi-1)", fontWeight: 600, lineHeight: 1 }}>
                <NumberTicker value={whatif?.population_protected_est ?? 0} delay={0} />
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 4 }}>Pop. Protected</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, color: "var(--aqi-1)", fontWeight: 600, lineHeight: 1 }}>
                <NumberTicker value={whatif?.schools_protected_est ?? 0} delay={0} />
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 4 }}>Schools Protected</div>
            </div>
          </div>
          {whatif && (
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: whatif.city_mean_delta_pm25 < 0 ? "var(--aqi-1)" : "var(--aqi-3)" }}>
                {whatif.city_mean_delta_pm25 > 0 ? "+" : ""}{whatif.city_mean_delta_pm25.toFixed(1)} µg/m³
              </span>
              <span>City Average Delta</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
