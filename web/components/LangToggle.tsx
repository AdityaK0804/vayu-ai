"use client";

import { useLangStore, type Lang } from "@/lib/i18n";

const OPTS: { id: Lang; short: string; full: string }[] = [
  { id: "en", short: "EN", full: "English" },
  { id: "hi", short: "हिं", full: "हिन्दी" },
];

export default function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLangStore();
  return (
    <div
      className="seg"
      role="group"
      aria-label="Language"
      style={{ padding: 2, flex: "none" }}
    >
      {OPTS.map((o) => (
        <button
          key={o.id}
          onClick={() => setLang(o.id)}
          aria-pressed={lang === o.id}
          title={o.full}
          className={lang === o.id ? "on" : ""}
          style={{ padding: compact ? "5px 9px" : "6px 11px", fontSize: 12 }}
        >
          {compact ? o.short : o.full}
        </button>
      ))}
    </div>
  );
}
