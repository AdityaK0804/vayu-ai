# External Integrations

**Analysis Date:** 2026-03-08

## APIs & External Services

**Authentication:**
- Google OAuth 2.0 - Third-party sign-in via NextAuth
  - SDK/Client: next-auth GoogleProvider
  - Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (env vars)

**Mapping & Location:**
- Mapbox GL - Geographic visualization and facility location mapping
  - SDK/Client: mapbox-gl 3.19.1, react-map-gl 8.1.0
  - Auth: `NEXT_PUBLIC_MAPBOX_TOKEN` (public, embedded in client)
  - Usage: Chhattisgarh district map view with facility markers and risk indicators

**ML & Prediction:**
- ML API Service (internal) - Risk forecasting and SHAP value computation
  - Endpoint: `ML_API_URL` environment variable
  - Auth: `ML_API_KEY` (server-side only)
  - Implementation: Fetched server-side in tRPC risk router (`server/routers/risk.ts`)
  - Response: Risk scores (waterRisk, energyRisk, sanitationRisk, diseaseRisk, overallRisk)

**Notifications & Real-time:**
- Supabase Realtime - Alert feed updates and facility monitoring
  - SDK/Client: @supabase/supabase-js 2.98.0
  - Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, for client-side subscriptions)
  - Usage: Postgres changes subscriptions on alerts table (INSERT events)
  - Pattern: Client components subscribe to alert channels, invalidate React Query on new alerts

## Data Storage

**Databases:**
- PostgreSQL - Primary transactional database
  - Connection: `DATABASE_URL` environment variable (Server-side only)
  - Client: Prisma ORM (v5.22.0)
  - Schema: 9 tables (Facility, SensorReading, RiskScore, Forecast, Alert, AlertChannel, ShapValue, User, Intervention)
  - Indexes: `facilityId`, `timestamp` on SensorReadings
  - Extensions: TimescaleDB recommended for time-series sensor data optimization

**File Storage:**
- Local filesystem only - No cloud storage service configured
- Assets served from Next.js `/public` directory

**Caching:**
- React Query (@tanstack/react-query) - Client-side server state cache
- Zustand - Local client state store (global dashboard filters and map view)
- Next.js: No explicit Redis/memcached configured; build-time caching via next build

## Authentication & Identity

**Auth Provider:**
- NextAuth 4.24.13 - Custom session-based authentication

**Implementation:**
- Location: `lib/auth.ts` - NextAuth configuration
- Providers: Google OAuth + Credentials provider
- Callbacks: JWT token generation, session enrichment with user role
- Session storage: HTTP-only secure cookies (NextAuth default)
- Routes:
  - Handler: `app/api/auth/[...nextauth]/route.ts`
  - Sign-in: `/login`

**Authorization:**
- Role-based access control via `user.role` claim in JWT token
- Roles: ADMIN, STATE_OFFICER, DISTRICT_OFFICER, BLOCK_ENGINEER, HEADMASTER, ANM, VIEWER
- Enforcement: tRPC procedures use `protectedProcedure` (auth required) and `adminProcedure` (admin only)
- Server: `server/trpc.ts` defines protected/admin procedure wrappers

## Monitoring & Observability

**Error Tracking:**
- Not configured - Errors logged to console/Prisma query logs only
- Development: Prisma logs queries, errors, warnings to console

**Logs:**
- Console logging via Prisma query logs (development mode: `['query', 'error', 'warn']`)
- Production mode: `['error']` only
- Implementation: `lib/prisma.ts` singleton with NODE_ENV-based log configuration

## CI/CD & Deployment

**Hosting:**
- Optimized for Vercel (Next.js native)
- Can self-host on Node.js servers with PostgreSQL backend

**CI Pipeline:**
- Not explicitly configured in codebase
- Next.js build: `npm run build` → `.next` directory
- Dev server: `npm run dev` → localhost:3000
- Production: `npm run start` → Node.js server

## Environment Configuration

**Required env vars:**

| Variable | Purpose | Scope |
|----------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection string | Server-side |
| `NEXTAUTH_URL` | NextAuth callback URL (e.g., http://localhost:3000) | Server-side |
| `NEXTAUTH_SECRET` | Session encryption key (generate: `openssl rand -base64 32`) | Server-side |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Server-side |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Server-side |
| `ML_API_URL` | Internal ML service endpoint | Server-side |
| `ML_API_KEY` | ML service authentication key | Server-side |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox GL public token | Client-side (embedded) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Client-side (embedded) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Client-side (embedded) |

**Secrets location:**
- `.env.local` (development) - Listed in `.gitignore`
- Production: Environment variables set in Vercel dashboard or deployment platform

## Webhooks & Callbacks

**Incoming:**
- None explicitly configured

**Outgoing:**
- Supabase Postgres CDC - Realtime subscriptions (not traditional webhooks, but event-driven)
  - Channel: `alerts-feed`
  - Trigger: INSERT on alerts table
  - Handler: Client component re-fetches alerts via React Query invalidation

**NextAuth Callbacks:**
- `/api/auth/[...nextauth]` - Handles OAuth redirect and session creation
- Sign-in redirect: `/login` page or callback to referrer

## Data Flow Patterns

**Real-time Alert Delivery:**
```
Alert inserted in PostgreSQL
→ Supabase detects change via CDC
→ Client channel subscribed via Supabase
→ Supabase pushes INSERT event to client
→ Client invalidates React Query 'alerts' key
→ AlertFeed component refetches via tRPC
```

**Risk Score Computation:**
```
Scheduled job (external) calls ML_API_URL
→ ML API computes risk metrics + SHAP values
→ POST results to internal endpoint (not exposed in codebase)
→ Data persisted in Prisma: RiskScore + ShapValue records
→ tRPC risk router queries latest score per facility
```

**Authentication Flow:**
```
User navigates to /login
→ NextAuth sign-in page (Google or Credentials)
→ OAuth callback → NextAuth creates JWT token
→ Token stored in secure HTTP-only cookie
→ Session available in tRPC context via getServerSession()
→ Protected procedures check ctx.session
→ Admin procedures check ctx.session.user.role === 'ADMIN'
```

---

*Integration audit: 2026-03-08*
