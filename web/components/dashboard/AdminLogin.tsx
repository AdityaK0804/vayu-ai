"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MagicCard } from "@/components/ui/magic-card";
import { DEMO_ACCOUNTS, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";

/**
 * Admin sign-in sheet.
 *
 * Only officials need to sign in — citizens use the dashboard as-is. See
 * lib/auth.ts for why this is a UI gate and not real authentication.
 */
export default function AdminLogin() {
  const { t } = useT();
  const theme = useApp((s) => s.theme);
  const { loginOpen, closeLogin, signIn, error } = useAuth();

  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");

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
      role="dialog"
      aria-modal="true"
      aria-label={t("Administrator sign-in")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeLogin();
      }}
    >
      <Card className="w-full max-w-sm border-none p-0 shadow-none login-card">
        <MagicCard gradientColor={theme === "dark" ? "#262626" : "#D9D9D955"} className="p-0">
          <CardHeader className="border-border border-b p-4 [.border-b]:pb-4">
            <CardTitle>{t("Administrator sign-in")}</CardTitle>
            <CardDescription>
              {t("Enforcement tools are restricted to authorised officials.")}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4">
            <form onSubmit={submit} id="admin-login-form">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="adminId">{t("Admin ID")}</Label>
                  <Input
                    id="adminId"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="VAYU-ADMIN-01"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">{t("Password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="login-error" role="alert">
                    {t(error)}
                  </p>
                )}

                {/* SSO placeholder. Wired to nothing on purpose — a button that
                    silently fakes a Google sign-in would be worse than one that
                    says it is not connected. */}
                <button type="button" className="login-sso" disabled title={t("Not configured in the demo build")}>
                  <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden>
                    <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.9-1.5 4.7-4.4 6.6l6.7 5.2C42.2 35.5 45 30.3 45 24z" />
                    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8 41 15.4 46 24 46z" />
                    <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z" />
                    <path fill="#EA4335" d="M24 10.6c3.3 0 5.5 1.4 6.8 2.6l6-5.9C33.1 3.9 29.1 2 24 2 15.4 2 8 7 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9 12.5-9z" />
                  </svg>
                  {t("Continue with Google")}
                  <span className="login-sso-tag">{t("not configured")}</span>
                </button>
              </div>
            </form>
          </CardContent>

          <CardFooter className="border-border border-t p-4 [.border-t]:pt-4 login-foot">
            <Button className="w-full" type="submit" form="admin-login-form">
              {t("Sign in")}
            </Button>

            <div className="login-demo">
              <span className="login-demo-title">{t("Demo credentials")}</span>
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
                  <code>{a.adminId}</code>
                  <code>{a.password}</code>
                  <span>{a.org}</span>
                </button>
              ))}
              <p className="login-warn">
                {t(
                  "Demo gate only — it hides UI, it does not secure data. Credentials ship in the client bundle.",
                )}
              </p>
            </div>

            <button type="button" className="login-cancel" onClick={closeLogin}>
              {t("Continue as citizen")}
            </button>
          </CardFooter>
        </MagicCard>
      </Card>
    </div>
  );
}
