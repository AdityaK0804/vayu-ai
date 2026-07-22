"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler";
import { Particles } from "@/components/magicui/particles";
import ShinyLink from "@/components/magicui/shiny-link";
import Chatbot from "@/components/Chatbot";
import LangToggle from "@/components/LangToggle";
import { useT } from "@/lib/i18n";
import { bandFor } from "@/lib/aqi";
import { useLive, usePriority } from "@/lib/data";
import { useApp } from "@/lib/store";

const PAD = "clamp(16px,2.5vw,36px)";

const NAV = [
  { href: "/live-cities", label: "Live Cities" },
  { href: "/platform", label: "Platform" },
  { href: "/how-ai-works", label: "How AI Works" },
];

/* ------------------------------------------------------- scroll progress */
function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const upd = () => {
      const st = window.scrollY || document.documentElement.scrollTop;
      const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (ref.current) ref.current.style.width = `${h > 0 ? Math.min(100, (st / h) * 100) : 0}%`;
    };
    upd();
    window.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    return () => {
      window.removeEventListener("scroll", upd);
      window.removeEventListener("resize", upd);
    };
  }, []);
  return (
    <div
      aria-hidden
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 25, pointerEvents: "none" }}
    >
      <div
        ref={ref}
        style={{
          height: "100%",
          width: "0%",
          background: "linear-gradient(90deg,var(--accent),var(--accent-2))",
          boxShadow: "0 0 10px var(--accent)",
          transition: "width .08s linear",
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------- alert ticker */
function AlertTicker() {
  const { data: live } = useLive();
  const { data: korba } = usePriority("korba");

  // The design hard-codes eight alert strings (AQI 312, "Station CG-041", …).
  // These are generated from the real live feed and the real dossiers instead —
  // same motion and look, but nothing asserted that we did not measure.
  const alerts = useMemo(() => {
    const out: { color: string; text: string }[] = [];
    for (const c of live ?? []) {
      if (c.current_pm25 == null) continue;
      const b = bandFor(c.current_pm25);
      out.push({
        color: b.hex,
        text: `${c.name}: PM2.5 ${c.current_pm25} µg/m³ (US AQI ${c.current_us_aqi}) — ${b.label}`,
      });
    }
    if (korba) {
      out.push({
        color: "var(--accent)",
        text: `Korba: ${korba.cells_over_threshold.toLocaleString()} of ${korba.cells_scored.toLocaleString()} cells forecast over ${korba.threshold_ug_m3} µg/m³`,
      });
      for (const d of korba.dossiers.slice(0, 3)) {
        out.push({
          color: bandFor(d.predicted_pm25).hex,
          text: `${d.ward}: forecast ${d.predicted_pm25} µg/m³ · ${d.top_source}-driven · ${d.population_affected.toLocaleString()} residents${
            d.named_upwind_source ? ` · upwind ${d.named_upwind_source}` : ""
          }`,
        });
      }
    }
    return out.length ? out : [{ color: "var(--ink-3)", text: "Loading live air quality…" }];
  }, [live, korba]);

  // The CSS-keyframe marquee proved unreliable in the browser (the rule and
  // @keyframes were served correctly, yet the track never advanced), so the
  // transform is driven directly by rAF instead. Deterministic, gives an exact
  // px/sec speed, and makes pause-on-hover a one-liner.
  const trackRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLSpanElement | null>(null);
  const pausedRef = useRef(false);
  const SPEED = 70; // px per second, right -> left

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let x = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speed = reduce ? SPEED * 0.45 : SPEED;

    const step = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05); // clamp after tab-switch
      last = t;
      const w = copyRef.current?.offsetWidth ?? 0;
      if (!pausedRef.current && w > 0) {
        x -= speed * dt;
        if (x <= -w) x += w; // one full copy consumed -> seamless reset
        if (trackRef.current) trackRef.current.style.transform = `translate3d(${x}px,0,0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [alerts]);

  const Track = ({ innerRef }: { innerRef?: React.Ref<HTMLSpanElement> }) => (
    <span ref={innerRef} style={{ display: "inline-flex", alignItems: "center", flex: "0 0 auto" }}>
      {alerts.map((a, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "0 6px",
            fontSize: 13,
            color: "#dbe6e2",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: a.color }} />
          {a.text}
          <span style={{ color: "rgba(255,255,255,.22)", margin: "0 14px" }}>|</span>
        </span>
      ))}
    </span>
  );

  return (
    <div
      id="vayuTicker"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      style={{
        position: "absolute",
        top: 72,
        left: 0,
        right: 0,
        zIndex: 19,
        height: 42,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        background: "rgba(8,15,13,0.92)",
        backdropFilter: "blur(10px)",
        borderTop: "1px solid rgba(255,255,255,.06)",
        borderBottom: "1px solid rgba(255,255,255,.06)",
      }}
    >
      <div
        style={{
          position: "relative",
          flex: 1,
          overflow: "hidden",
          height: "100%",
          maskImage:
            "linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent)",
        }}
      >
        <div
          ref={trackRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            display: "flex",
            alignItems: "center",
            width: "max-content",
            willChange: "transform",
          }}
        >
          <Track innerRef={copyRef} />
          <Track />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- site nav */
function SiteNav() {
  const pathname = usePathname();
  const { t } = useT();
  const navRef = useRef<HTMLElement | null>(null);

  // Nav condenses into a floating dark pill once scrolled, exactly as the design does.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const on: Record<string, string> = {
      maxWidth: "1500px",
      width: "calc(100% - 40px)",
      margin: "12px auto",
      borderRadius: "26px",
      background: "rgba(10,17,15,0.86)",
      backdropFilter: "blur(16px)",
      borderColor: "rgba(255,255,255,0.08)",
      boxShadow: "0 18px 44px -18px rgba(0,0,0,0.65)",
      padding: "12px clamp(18px,2.4vw,30px)",
    };
    const off: Record<string, string> = {
      maxWidth: "none",
      width: "auto",
      margin: "0 auto",
      borderRadius: "0px",
      background: "transparent",
      backdropFilter: "none",
      borderColor: "transparent",
      boxShadow: "none",
      padding: `18px ${PAD}`,
    };
    const sc = () => {
      const y = window.scrollY > 24;
      Object.assign(el.style, y ? on : off);
      el.querySelectorAll<HTMLElement>(".nav-txt").forEach((a) => {
        if (a.dataset.active === "true") return;
        a.style.color = y ? "#c7d3cf" : "var(--ink-2)";
      });
      el.querySelectorAll<HTMLElement>(".nav-brand, .nav-brand *").forEach((b) => {
        b.style.color = y ? "#ffffff" : "";
      });
      const t = el.querySelector<HTMLElement>(".nav-theme");
      if (t) {
        // stays transparent in both states so it reads as part of the bar
        t.style.color = y ? "#c7d3cf" : "var(--ink-2)";
        t.style.borderColor = y
          ? "rgba(255,255,255,0.16)"
          : "color-mix(in oklch, var(--ink-2), transparent 78%)";
        t.style.background = "transparent";
      }
    };
    sc();
    window.addEventListener("scroll", sc, { passive: true });
    return () => window.removeEventListener("scroll", sc);
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      id="siteNav"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `18px ${PAD}`,
        background: "transparent",
        border: "1px solid transparent",
        transition:
          "background .35s ease,box-shadow .35s ease,margin .35s ease,padding .35s ease,border-radius .35s ease,border-color .35s ease,max-width .35s ease",
      }}
    >
      <Link href="/" className="nav-brand" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 38,
            height: 38,
            borderRadius: 11,
            background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
            boxShadow: "0 6px 18px -6px var(--accent)",
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 0 0 5px rgba(255,255,255,.28)",
            }}
          />
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span className="display" style={{ fontWeight: 700, fontSize: 19, letterSpacing: ".16em" }}>
            Vayu AI
          </span>

        </span>
      </Link>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "clamp(14px,2.4vw,34px)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className="nav-txt hidden sm:inline"
              data-active={active ? "true" : "false"}
              style={{
                color: active ? "var(--accent)" : "var(--ink-2)",
                fontWeight: active ? 600 : 500,
              }}
            >
              {t(n.label)}
            </Link>
          );
        })}
        <LangToggle compact />
        <AnimatedThemeToggler
          className="nav-theme grid place-items-center cursor-pointer"
          style={undefined}
        />
        <ShinyLink
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 10,
            background: "var(--ink)",
            color: "var(--bg)",
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {t("Open Dashboard →")}
        </ShinyLink>
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- footer */
export function SiteFooter() {
  const { t } = useT();
  return (
    <footer
      style={{
        position: "relative",
        zIndex: 1,
        borderTop: "1px solid var(--line)",
        padding: `34px ${PAD}`,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />
        </span>
        <span className="display" style={{ fontWeight: 700, letterSpacing: ".08em" }}>
          Vayu AI
        </span>
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{t("Urban Air Quality Intelligence")}</span>
      </div>
      <div className="figure" style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: "62ch" }}>
        Real data · CPCB stations · Open-Meteo &amp; CAMS · Sentinel-5P / MODIS · EDGAR v8.1 ·
        WorldPop · GPPD
      </div>
    </footer>
  );
}

/* ------------------------------------------------- page shell (backdrops) */
export default function SiteShell({ children }: { children: React.ReactNode }) {
  const theme = useApp((st) => st.theme);
  const particleColor = theme === "dark" ? "#ffffff" : "#000000";
  return (
    <div style={{ position: "relative", overflowX: "hidden", minHeight: "100vh" }}>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(1100px 520px at 78% -6%,var(--glow),transparent 60%),radial-gradient(900px 480px at 8% 8%,color-mix(in oklch,var(--accent-2),transparent 88%),transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="grid-bg"
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.5 }}
      />
      <div
        aria-hidden
        className="hatch"
        style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.6 }}
      />
      {/* Magic UI Particles. The demo picks colour via next-themes; this app's
          theme lives in Zustand (no localStorage), so it reads from there. */}
      <Particles
        className="fixed inset-0 z-0"
        quantity={100}
        ease={80}
        color={particleColor}
        refresh
      />
      <SiteNav />
      <ScrollProgress />
      <AlertTicker />
      {children}
      <SiteFooter />
      {/* the design mounts the assistant on the marketing pages too */}
      <Chatbot />
    </div>
  );
}

/* ------------------------------------------------- shared page furniture */
export function PageHero({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
}) {
  const { t } = useT();
  return (
    <header
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1220,
        margin: "0 auto",
        padding: `clamp(124px,13vw,156px) ${PAD} 30px`,
      }}
    >
      <div
        className="figure"
        style={{
          fontSize: 12,
          letterSpacing: ".18em",
          color: "var(--accent)",
          marginBottom: 14,
          animation: "vayuRise .6s both",
        }}
      >
        {t(eyebrow)}
      </div>
      <h1
        className="display"
        style={{
          fontWeight: 700,
          fontSize: "clamp(34px,5.4vw,60px)",
          lineHeight: 1.04,
          maxWidth: "18ch",
          animation: "vayuRise .7s .05s both",
        }}
      >
        {typeof title === "string" ? t(title) : title}
      </h1>
      <p
        style={{
          fontSize: "clamp(15px,1.8vw,19px)",
          lineHeight: 1.6,
          color: "var(--ink-2)",
          maxWidth: "58ch",
          margin: "22px 0 0",
          animation: "vayuRise .7s .12s both",
        }}
      >
        {t(sub)}
      </p>
    </header>
  );
}

/** The design's dashed "workflow slot" — kept as the intentional placeholder. */
export function WorkflowSlot({ label }: { label: string }) {
  const { t } = useT();
  return (
    <section
      style={{ position: "relative", zIndex: 1, maxWidth: 1220, margin: "0 auto", padding: `20px ${PAD} 40px` }}
    >
      <div
        style={{
          border: "1.5px dashed var(--line)",
          borderRadius: 20,
          padding: "clamp(28px,5vw,56px)",
          textAlign: "center",
          background: "color-mix(in oklch,var(--surface),transparent 30%)",
        }}
      >
        <div
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            marginBottom: 16,
            fontSize: 22,
          }}
        >
          🧩
        </div>
        <h3 className="display" style={{ fontSize: 20, marginBottom: 8 }}>
          {t(label)} {t("workflow slot")}
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: "52ch", margin: "0 auto" }}>
          {t(
            "This page is ready for the custom workflow you'll define. Tell me what to show here and I'll build it into this space.",
          )}
        </p>
      </div>
    </section>
  );
}

export { PAD };
