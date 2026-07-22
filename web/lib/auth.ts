"use client";

import { create } from "zustand";

/**
 * Demo access control for the command centre.
 *
 * ⚠️ THIS IS NOT AUTHENTICATION. The credentials below ship inside the client
 * bundle, the check runs in the browser, and anyone can flip the role from the
 * devtools console. It gates the *UI* so a demo can show the citizen view and
 * the enforcement view separately — nothing more. Real deployment needs the
 * account list and the session on a server, with the enforcement endpoints
 * refusing unauthenticated requests regardless of what the UI renders.
 *
 * State is in memory only (no localStorage / sessionStorage, per the build
 * rules), so a refresh signs you out. That is intentional for a demo.
 */

export type Role = "citizen" | "admin";

export interface Account {
  /** the ID typed into the sign-in form */
  adminId: string;
  password: string;
  name: string;
  org: string;
  role: Role;
}

/** Demo accounts. See the warning above — these are not secrets. */
export const DEMO_ACCOUNTS: Account[] = [
  {
    adminId: "VAYU-ADMIN-01",
    password: "vayu2026",
    name: "A. Verma",
    org: "CECB · Enforcement",
    role: "admin",
  },
  {
    adminId: "VAYU-ADMIN-02",
    password: "korba2026",
    name: "S. Nayak",
    org: "Korba Municipal Corp.",
    role: "admin",
  },
];

interface AuthState {
  role: Role;
  account: Account | null;
  error: string | null;
  /** the sign-in sheet is open */
  loginOpen: boolean;

  openLogin: () => void;
  closeLogin: () => void;
  signIn: (adminId: string, password: string) => boolean;
  signOut: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  // everyone starts as a citizen — the public views need no sign-in at all
  role: "citizen",
  account: null,
  error: null,
  loginOpen: false,

  openLogin: () => set({ loginOpen: true, error: null }),
  closeLogin: () => set({ loginOpen: false, error: null }),

  signIn: (adminId, password) => {
    const id = adminId.trim().toUpperCase();
    const hit = DEMO_ACCOUNTS.find((a) => a.adminId === id && a.password === password);
    if (!hit) {
      set({ error: "Unknown admin ID or password." });
      return false;
    }
    set({ role: hit.role, account: hit, error: null, loginOpen: false });
    return true;
  },

  signOut: () => set({ role: "citizen", account: null, error: null }),
}));
