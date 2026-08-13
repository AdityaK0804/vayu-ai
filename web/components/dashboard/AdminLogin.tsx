"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MagicCard } from "@/components/ui/magic-card";
import { DEMO_ACCOUNTS, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";

/**
 * Admin sign-in modal — wide card (form | demo), no internal scrollbar.
 * MagicCard only supplies the mouse-follow border/spotlight; layout is ours.
 * UI gate only; see lib/auth.ts.
 */
export default function AdminLogin() {
  const { t } = useT();
  const theme = useApp((s) => s.theme);
  const { loginOpen, closeLogin, signIn, error } = useAuth();
  const titleId = useId();
  const descId = useId();

  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loginOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLogin();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [loginOpen, closeLogin]);

  if (!loginOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (signIn(adminId, password)) {
      setAdminId("");
      setPassword("");
    }
  };

  return (
    <div
      className="login-scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeLogin();
      }}
    >
      <div
        className="login-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <MagicCard
          className="login-magic p-0"
          gradientColor={theme === "dark" ? "#262626" : "#D9D9D955"}
          gradientFrom="#40d6c5"
          gradientTo="#60a5fa"
          gradientSize={280}
          gradientOpacity={0.55}
        >
          <div className="login-modal">
            <header className="login-modal-head">
              <div className="login-modal-head-text">
                <p className="login-kicker">{t("Command centre")}</p>
                <h2 id={titleId} className="login-title">
                  {t("Administrator sign-in")}
                </h2>
                <p id={descId} className="login-sub">
                  {t("Enforcement tools are restricted to authorised officials.")}
                </p>
              </div>
              <button
                type="button"
                className="login-close"
                onClick={closeLogin}
                aria-label={t("Close")}
              >
                ✕
              </button>
            </header>

            <div className="login-modal-body">
              <form className="login-form" onSubmit={submit} noValidate>
                <div className="login-field">
                  <Label htmlFor="adminId">{t("Admin ID")}</Label>
                  <Input
                    id="adminId"
                    autoFocus
                    autoComplete="username"
                    spellCheck={false}
                    placeholder="VAYU-ADMIN-01"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                  />
                </div>

                <div className="login-field">
                  <Label htmlFor="password">{t("Password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="login-error" role="alert">
                    {t(error)}
                  </p>
                )}

                <Button type="submit" className="login-submit">
                  {t("Sign in")}
                </Button>

                <div className="login-divider" aria-hidden>
                  <span>{t("or")}</span>
                </div>

                <button
                  type="button"
                  className="login-sso"
                  disabled
                  title={t("Not configured in the demo build")}
                >
                  <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.9-1.5 4.7-4.4 6.6l6.7 5.2C42.2 35.5 45 30.3 45 24z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8 41 15.4 46 24 46z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z"
                    />
                    <path
                      fill="#EA4335"
                      d="M24 10.6c3.3 0 5.5 1.4 6.8 2.6l6-5.9C33.1 3.9 29.1 2 24 2 15.4 2 8 7 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9 12.5-9z"
                    />
                  </svg>
                  <span>{t("Continue with Google")}</span>
                  <span className="login-sso-tag">{t("not configured")}</span>
                </button>
              </form>

              <aside className="login-demo" aria-label={t("Demo credentials")}>
                <span className="login-demo-title">{t("Demo credentials")}</span>
                <div className="login-demo-list">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.adminId}
                      type="button"
                      className="login-demo-row"
                      onClick={() => {
                        setAdminId(a.adminId);
                        setPassword(a.password);
                      }}
                    >
                      <span className="login-demo-codes">
                        <code>{a.adminId}</code>
                        <code>{a.password}</code>
                      </span>
                      <span className="login-demo-org">{a.org}</span>
                    </button>
                  ))}
                </div>
                <p className="login-warn">
                  {t(
                    "Demo gate only — it hides UI, it does not secure data. Credentials ship in the client bundle.",
                  )}
                </p>
              </aside>
            </div>

            <footer className="login-modal-foot">
              <button type="button" className="login-cancel" onClick={closeLogin}>
                {t("Continue as citizen")}
              </button>
            </footer>
          </div>
        </MagicCard>
      </div>
    </div>
  );
}
