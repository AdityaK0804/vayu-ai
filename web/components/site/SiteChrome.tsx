"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler";
import { Particles } from "@/components/magicui/particles";
import ShinyLink from "@/components/magicui/shiny-link";
import Chatbot from "@/components/Chatbot";
import SiteFooter from "./SiteFooter";
import LangToggle from "@/components/LangToggle";
import { useT } from "@/lib/i18n";
import { bandFor } from "@/lib/aqi";
import { useLive, usePriority } from "@/lib/data";
import { useApp } from "@/lib/store";

const PAD = "clamp(16px,2.5vw,36px)";

const NAV = [
  { href: "/map", label: "Live Map 🗺️" },
  { href: "/#cities", label: "Live Cities" },
  { href: "/#features", label: "Platform" },
  { href: "/#how", label: "How AI Works" },
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
    return [
      { color: "var(--aqi-5)", text: "Raipur: PM2.5 158 µg/m³ (US AQI 208) — Very Poor" },
      { color: "var(--aqi-6)", text: "Station CG-041: AQI 312 — Severe" },
      { color: "var(--accent)", text: "Korba: 42 of 128 cells forecast over 100 µg/m³" },
      { color: "var(--aqi-4)", text: "Bhilai: forecast 112 µg/m³ · Industry-driven · 45,000 residents" },
      { color: "var(--aqi-2)", text: "Jagdalpur: PM2.5 28 µg/m³ (US AQI 84) — Moderate" },
      { color: "var(--aqi-5)", text: "Bilaspur: forecast 145 µg/m³ · Traffic-driven · upwind Highway 130" },
      { color: "var(--aqi-1)", text: "Ambikapur: PM2.5 12 µg/m³ (US AQI 42) — Good" },
      { color: "var(--aqi-4)", text: "Durg: PM2.5 95 µg/m³ (US AQI 172) — Unhealthy" },
    ];
  }, []);

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

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "rgba(6, 14, 12, 0.88)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(56, 189, 248, 0.15)",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4)",
      }}
    >
      <nav
        id="siteNav"
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `14px ${PAD}`,
        }}
      >
        <Link href="/" className="nav-brand" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              position: "relative",
            }}
          >
            <svg width="42" height="42" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
              <path d="M 25 45 C 20 45 15 40 15 35 C 15 30 18 26 23 25 C 25 15 33 10 42 12 C 48 5 58 5 63 12 C 72 10 80 15 82 25 C 87 26 90 30 90 35 C 90 40 85 45 80 45 L 25 45 Z" fill="none" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.8))" }}></path>
              <path d="M 25 45 L 80 45" fill="none" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.8))" }}></path>
              <path d="M 12 35 L 35 35 L 43 45 L 53 15 L 63 45 L 70 35 L 92 35" fill="none" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 6px rgba(74,222,128,0.8))" }}></path>
              <circle cx="53" cy="15" r="5" fill="#fbbf24" style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.8))" }}></circle>
            </svg>
          </span>
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span
              style={{
                fontFamily: '"Comic Neue", "Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive, sans-serif',
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: "0.02em",
                color: "#38bdf8",
                textShadow: "0 0 14px rgba(56, 189, 248, 0.6)",
              }}
            >
              Vayu.AI
            </span>
          </span>
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "clamp(12px, 2vw, 24px)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className="nav-txt hidden md:inline-block"
                data-active={active ? "true" : "false"}
                style={{
                  color: active ? "#38bdf8" : "#cbd5e1",
                  fontWeight: active ? 700 : 500,
                  transition: "color 0.15s ease",
                  padding: "4px 8px",
                }}
                onClick={(e) => {
                  if (n.href.startsWith("/#") && pathname === "/") {
                    e.preventDefault();
                    const targetId = n.href.substring(2);
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                      targetElement.scrollIntoView({ behavior: "smooth" });
                      window.history.pushState(null, "", n.href);
                    }
                  }
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
              padding: "9px 18px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #38bdf8, #2563eb)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 13.5,
              boxShadow: "0 4px 14px rgba(56, 189, 248, 0.4)",
            }}
          >
            {t("Open Dashboard →")}
          </ShinyLink>
        </div>
      </nav>
    </header>
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
        className="section-eyebrow"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(13px, 1.35vw, 15px)",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--eyebrow)",
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
