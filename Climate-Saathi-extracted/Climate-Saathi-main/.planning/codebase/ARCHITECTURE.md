# Architecture

**Analysis Date:** 2026-03-08

## Pattern Overview

**Overall:** Layered MVC with Server + Client separation and Domain-driven structure via tRPC.

**Key Characteristics:**
- Next.js 14 App Router with route group segregation `(marketing)` and `(app)`
- tRPC backend layer with Prisma ORM for type-safe client-server communication
- Authentication via NextAuth with role-based access control
- Real-time capabilities via Supabase (channels for alerts)
- Client state management via Zustand for dashboard filters/selections
- Hybrid rendering: Server Components by default, Client Components for interactivity

## Layers

**Presentation Layer:**
- Purpose: Render UI, handle user interactions, display data
- Location: `app/(marketing)/` for public pages, `app/(app)/` for authenticated pages
- Contains: Page components (`.tsx`), custom components in `components/ui-custom/`
- Depends on: tRPC client, Zustand store, shadcn/ui components
- Used by: Browser (Next.js routes)

**Data Access Layer:**
- Purpose: Abstract database queries and mutations
- Location: `server/routers/` (tRPC routers)
- Contains: `facilitiesRouter`, `sensorsRouter`, `alertsRouter`, `riskRouter`, `analyticsRouter`, `adminRouter`
- Depends on: Prisma client, NextAuth session context
- Used by: Presentation layer via tRPC client (`lib/trpc.ts`)

**Infrastructure Layer:**
- Purpose: Manage external services and system concerns
- Location: `lib/` directory
- Contains: Prisma client singleton (`prisma.ts`), NextAuth config (`auth.ts`), Supabase client (`supabase.ts`), tRPC setup (`trpc.ts`)
- Depends on: Environment variables, PostgreSQL database, external services
- Used by: Data access and presentation layers

**API Routes:**
- Purpose: Provide HTTP endpoints for tRPC and auth
- Location: `app/api/trpc/[...trpc]/route.ts`, `app/api/auth/[...nextauth]/route.ts`
- Contains: Request handlers that bridge HTTP to tRPC/NextAuth
- Depends on: tRPC server, NextAuth
- Used by: Frontend tRPC client

## Data Flow

**Query Flow (Read):**

1. User clicks in UI (page or component)
2. Client calls tRPC procedure via `trpc.useQuery()` or `trpc.useMutation()` hook
3. Request sent to `/api/trpc` endpoint
4. `app/api/trpc/[...trpc]/route.ts` handler processes request
5. `createContext()` in `server/trpc.ts` fetches session via NextAuth
6. Router procedure in `server/routers/[name].ts` receives context + input
7. Procedure calls `ctx.prisma` to query database
8. Prisma Client executes query against PostgreSQL
9. Results returned to client, cached by React Query

**Mutation Flow (Write):**

1. User submits form or triggers action
2. Client calls `trpc.useMutation()` with input
3. Similar flow as query, but `protectedProcedure` checks session
4. If unauthorized, throws `TRPCError({ code: 'UNAUTHORIZED' })`
5. If authorized, procedure updates database
6. Client receives updated data and re-validates related queries
7. UI re-renders with new state

**State Management:**

- **Transient UI state:** Zustand store (`store/useDashboardStore.ts`) for:
  - Selected district in sidebar
  - Selected facility detail
  - Alert filter criteria
  - Map viewport center/zoom
- **Server state:** React Query cache from tRPC queries (automatic)
- **Auth state:** NextAuth session (passed via context to tRPC)

## Key Abstractions

**Procedure (Router Method):**
- Purpose: Define queryable/mutable API endpoints with auth guards
- Examples: `facilitiesRouter.list`, `alertsRouter.acknowledge`, `adminRouter.deleteUser`
- Pattern: Using `publicProcedure` (no auth), `protectedProcedure` (auth required), `adminProcedure` (admin only)
- Located in: `server/trpc.ts` (definitions) and `server/routers/[name].ts` (implementations)

**Context:**
- Purpose: Pass request metadata (session, database client) to procedures
- Examples: `ctx.session` (current user), `ctx.prisma` (database client)
- Pattern: Created in `createContext()` at `server/trpc.ts`, injected by tRPC handler
- Used by: All procedures to check auth and access database

**Route Groups:**
- Purpose: Organize pages with shared layout without affecting URL structure
- Examples: `(marketing)` for `/` landing page, `(app)` for `/dashboard`, `/facilities`, etc.
- Pattern: Group directories in parentheses, share `layout.tsx` within group
- Located in: `app/(marketing)/layout.tsx` and `app/(app)/layout.tsx`

**Model Relations:**
- Purpose: Express domain relationships in type system
- Examples: `Facility` has many `SensorReading`, `Alert`, `RiskScore`; `RiskScore` has many `ShapValue`
- Pattern: Defined in `prisma/schema.prisma` as Prisma relations
- Used by: Type-safe queries in routers, automatic foreign key management

## Entry Points

**Public Landing Page:**
- Location: `app/(marketing)/page.tsx`
- Triggers: User visits `/` (root)
- Responsibilities: Render hero, features, impact metrics, call-to-action. *Currently placeholder, design pending.*

**Dashboard:**
- Location: `app/(app)/dashboard/page.tsx`
- Triggers: Authenticated user visits `/dashboard`
- Responsibilities: Display KPI bar, district sidebar, risk map, live alert feed. Uses Zustand for local filter state. Client component (`'use client'`).

**Facility Detail:**
- Location: `app/(app)/facilities/[id]/page.tsx`
- Triggers: User navigates to `/facilities/[id]`
- Responsibilities: Show facility sensors, risk score SHAP values, forecasts, alert timeline. Dynamic route with ID parameter.

**Alerts Centre:**
- Location: `app/(app)/alerts/page.tsx`
- Triggers: User visits `/alerts`
- Responsibilities: Display filterable alert table (severity, type, district, status), detail sheet. Uses Zustand for filter state.

**Analytics:**
- Location: `app/(app)/analytics/page.tsx`
- Triggers: User visits `/analytics`
- Responsibilities: Display aggregate charts (risk trends, alert resolution rate, sensor uptime). Currently a stub.

**Admin:**
- Location: `app/(app)/admin/page.tsx`
- Triggers: ADMIN role user visits `/admin`
- Responsibilities: CRUD forms for users, facilities, intervention logs. Gated by `adminProcedure`.

## Error Handling

**Strategy:** tRPC error codes + client-side toast notifications (Sonner).

**Patterns:**

- **Authentication error:** Procedure throws `TRPCError({ code: 'UNAUTHORIZED' })` if session missing
- **Authorization error:** `adminProcedure` throws `TRPCError({ code: 'FORBIDDEN' })` if role is not ADMIN
- **Validation error:** Zod schema throws error if input shape invalid; automatically returns 400
- **Database error:** Caught by tRPC error handling, returns 500 with sanitized message
- **Client-side:** tRPC React Query integration auto-returns error; components can call `mutation.error` or `query.isError`

## Cross-Cutting Concerns

**Logging:** Prisma client configured for development mode in `lib/prisma.ts`:
- Development: logs queries, errors, warnings
- Production: logs errors only

**Validation:** Zod schemas in router procedure inputs (`server/routers/[name].ts`):
- Example: `z.object({ id: z.string(), severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional() })`
- Automatic coercion and error reporting

**Authentication:** NextAuth with dual providers (`lib/auth.ts`):
- Google OAuth (via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)
- Email/credentials (custom: queries User table, no password hashing yet)
- Session callback injects `user.role` into JWT token
- Default redirect post-login: `/dashboard`

**Database Indexing:** Key Prisma indexes for performance (`prisma/schema.prisma`):
- `SensorReading`: compound index on `[facilityId, timestamp]` for time-series queries
- Essential for Facility Detail page sensor history queries

---

*Architecture analysis: 2026-03-08*
