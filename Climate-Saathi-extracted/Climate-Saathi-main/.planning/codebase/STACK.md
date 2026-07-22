# Technology Stack

**Analysis Date:** 2026-03-08

## Languages

**Primary:**
- TypeScript 5.x - Full codebase type safety for Next.js app, server, and client code

**Secondary:**
- JavaScript (ESM) - PostCSS configuration and build utilities

## Runtime

**Environment:**
- Node.js 20+ (inferred from project context)

**Package Manager:**
- npm (implicit from package.json)
- Lockfile: present

## Frameworks

**Core:**
- Next.js 16.1.6 - Production framework with App Router
- React 19.2.3 - UI rendering and component library
- React DOM 19.2.3 - React DOM binding

**Data & State:**
- @trpc/server 11.12.0 - Type-safe RPC server implementation
- @trpc/client 11.12.0 - Type-safe RPC client for frontend
- @trpc/react-query 11.12.0 - React Query integration for tRPC
- @trpc/next 11.12.0 - Next.js HTTP adapter for tRPC
- @tanstack/react-query 5.90.21 - Server state management and caching
- Zustand 5.0.11 - Lightweight client state management (global stores)

**Database & ORM:**
- Prisma 5.22.0 - ORM for PostgreSQL data access
- @prisma/client 5.22.0 - Prisma runtime client

**Authentication:**
- next-auth 4.24.13 - Session-based auth with NextAuth

**UI & Visualization:**
- recharts 3.8.0 - React charts for analytics dashboards
- mapbox-gl 3.19.1 - Native Mapbox library for mapping
- react-map-gl 8.1.0 - React wrapper for mapbox-gl
- framer-motion 12.35.1 - Animation framework for UI interactions
- shadcn - Component library (re-initialized for Next.js)
- Lucide-react - Icon library (577 icons available)
- sonner 2.0.7 - Toast notification component

**Realtime:**
- @supabase/supabase-js 2.98.0 - Supabase client for real-time subscriptions

**Styling & Themes:**
- TailwindCSS 4.x - Utility-first CSS framework via @tailwindcss/postcss 4
- Tailwind Merge 3.5.0 - Merge utility class conflicts
- tw-animate-css 1.4.0 - Animation utilities
- next-themes 0.4.6 - Dark mode theme provider

**Utilities:**
- date-fns 4.1.0 - Date manipulation and formatting
- Zod 4.3.6 - Runtime schema validation
- clsx 2.1.1 - Conditional className utility
- class-variance-authority 0.7.1 - Component variant CSS management
- @base-ui/react 1.2.0 - Unstyled accessible components

## Key Dependencies

**Critical:**
- Prisma + @prisma/client 5.22.0 - Core data layer connecting to PostgreSQL, handles 9-table schema with relationships
- tRPC stack (@trpc/server, @trpc/client, @trpc/react-query, @trpc/next) 11.12.0 - Type-safe API endpoints between server and client
- React Query (@tanstack/react-query) 5.90.21 - Server state synchronization and caching across routes
- Next.js 16.1.6 - Production App Router with file-based routing, server/client component boundary

**Infrastructure:**
- Mapbox GL + react-map-gl - Geographic visualization (Chhattisgarh district + facility locations)
- Recharts - Multi-chart dashboard for analytics and risk metrics
- Supabase client - Real-time alert feed via Postgres CDC channels
- NextAuth - Role-based access control (ADMIN, STATE_OFFICER, DISTRICT_OFFICER, etc.)

## Configuration

**Environment:**
- Configuration via `.env.local` (secrets and API credentials)
- Critical vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_*`, `ML_API_*`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_SUPABASE_*`

**Build:**
- `next.config.ts` - Next.js build configuration (minimal, with custom config hook available)
- `tsconfig.json` - TypeScript strict mode with path aliasing `@/*`
- `postcss.config.mjs` - PostCSS pipeline for Tailwind CSS 4 + @tailwindcss/postcss plugin
- `tailwind.config.*` - Tailwind theming (colors, fonts, animations, keyframes defined in `app/globals.css` via @theme)

**Styling:**
- `app/globals.css` - Central design system with Tailwind v4 `@theme` block defining:
  - Climate Saathi color tokens (forest, teal, amber, mint, leaf, sky, coral, sage, dark)
  - Font variables (Sora, DM Sans, JetBrains Mono via next/font/google)
  - Animations (float, ticker, pulse-dot, accordion)
  - Component layer utilities (glass-card, risk-level badges, buttons, text sizes)
  - Dark mode CSS variables
  - Light/dark theme values via HSL notation

**Fonts:**
- Next.js built-in font optimization (`next/font/google`)
- Sora: weights 300, 400, 600, 700, 800
- DM Sans: weights 300, 400, 500, 600
- JetBrains Mono: monospace fallback (CSS var, not Google font)

## Platform Requirements

**Development:**
- Node.js 20+
- npm package manager
- TypeScript 5.x compiler
- Bash shell or equivalent (for npm scripts)

**Production:**
- Hosted on Vercel (Next.js native platform) or self-hosted Node.js server
- PostgreSQL database (v12+, required by Prisma)
- Environment variables for: Database URL, NextAuth secrets, Google OAuth credentials, Mapbox token, Supabase credentials, ML API endpoint
- Outbound network access to Mapbox API, Google OAuth, Supabase, and internal ML API service

**Database:**
- PostgreSQL with Prisma client
- Schema: 9 tables (Facility, SensorReading, RiskScore, Forecast, Alert, AlertChannel, ShapValue, User, Intervention)
- TimescaleDB extension recommended (for SensorReading time-series optimization)
- Indexes: facility_id + timestamp on SensorReadings

---

*Stack analysis: 2026-03-08*
