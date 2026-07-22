# Codebase Concerns

**Analysis Date:** 2026-03-08

## Tech Debt

**Mock Data Hardcoded in Pages:**
- Issue: Pages use hardcoded mock data from `data/mockData.ts` instead of tRPC queries
- Files: `app/(app)/dashboard/page.tsx`, `app/(app)/alerts/page.tsx`, `app/(app)/facilities/page.tsx`, `app/(app)/analytics/page.tsx`, `app/(app)/facilities/[id]/page.tsx`
- Impact: Dashboard is non-functional with real data; filters and sorting are client-only; no real-time updates; cannot reflect database state
- Fix approach: Replace mock data imports with tRPC queries; use React Query for caching and real-time updates; implement proper loading/error states

**Type Casting with `as any` Throughout codebase:**
- Issue: Multiple instances of `as any` bypass TypeScript type safety
- Files: `server/routers/facilities.ts` (line 11), `server/routers/sensors.ts` (lines 12, 32), `server/trpc.ts` (line 23), `lib/auth.ts` (lines 31-32, 37)
- Impact: Silent bugs at runtime; loss of type safety; difficult to refactor; enables unintended casting of invalid data
- Fix approach: Define proper types in `types/index.ts` and use Zod schemas for validation instead of casting

**Landing Page (`app/page.tsx`) is Default Next.js Template:**
- Issue: Home page shows default "To get started" template instead of custom landing page
- Files: `app/page.tsx`
- Impact: Marketing site doesn't present product; no hero section, features, or CTA flow; inconsistent with CLAUDE.md specification
- Fix approach: Port landing page sections from Vite prototype (`src/sections/`) to `app/(marketing)/page.tsx` with proper Next.js structure

**Missing App Layout with Sidebar:**
- Issue: No authenticated app layout with sidebar navigation found
- Files: `app/(app)/layout.tsx` does not exist
- Impact: All app pages (dashboard, facilities, alerts) have duplicated navigation component; no consistent sidebar; no auth guard at layout level
- Fix approach: Create `app/(app)/layout.tsx` with shared navigation sidebar, auth check, and role-based layout

**Incomplete Client State Management:**
- Issue: Dashboard uses useState for filters but no persistence or real-time sync
- Files: `app/(app)/dashboard/page.tsx` (lines 14-15), `app/(app)/alerts/page.tsx` (lines 27-32)
- Impact: Filters reset on page reload; no multi-tab state sync; no real-time alert updates despite having Supabase in dependencies
- Fix approach: Implement Zustand store (already in `store/` dir but unused); add Supabase realtime subscriptions for alerts

**Prisma Schema Missing Foreign Key Constraints:**
- Issue: Interval relationships exist but lack explicit index on `Intervention.takenById` (references User.id)
- Files: `prisma/schema.prisma` (lines 194-205)
- Impact: Orphaned interventions possible if user deleted; no query optimization for intervention lookups by user
- Fix approach: Add `@@index([takenById])` to Intervention model; consider adding explicit User relation

## Known Bugs

**Admin Procedure Role Check Missing User Type:**
- Issue: `adminProcedure` casts session.user to `any` to access role field
- Files: `server/trpc.ts` (line 23)
- Symptoms: TypeScript doesn't prevent accessing non-existent fields; role could be undefined at runtime
- Workaround: Role is set in NextAuth callback, but no runtime validation
- Fix: Define `type User { role: string }` in NextAuth session type

**Facility Type Mismatch Between Schema and Mock Data:**
- Issue: Prisma schema defines FacilityType as `SCHOOL | PHC | CHC | ANGANWADI`, but mock data uses `SCHOOL | HEALTH_CENTRE`
- Files: `prisma/schema.prisma` (lines 29-34), `data/mockData.ts` (line 16)
- Symptoms: Mock data won't match schema on database; create operations with wrong enum values will fail
- Trigger: Any attempt to seed or sync mock data to real database
- Workaround: None - mock data is disconnected from schema

**Sensor Type Inconsistency:**
- Issue: Mock data has sensor types `AIR_QUALITY`, `TEMPERATURE`, `HUMIDITY`, `WATER_LEVEL`, `POWER`; schema defines `WATER_LEVEL`, `SOLAR_OUTPUT`, `TEMPERATURE`, `CHLORINE`, `TURBIDITY`, `HUMIDITY`, `BATTERY`
- Files: `data/mockData.ts` (lines 20-33), `prisma/schema.prisma` (lines 49-57)
- Symptoms: Mock sensors won't match database; sensor history queries will fail for mock-sourced data
- Trigger: Connecting mock data to real database or expecting schema-driven validation

**Missing Validation on Credentials Auth:**
- Issue: Credentials provider doesn't validate password; just checks email existence
- Files: `lib/auth.ts` (lines 12-26)
- Symptoms: Any user with valid email can login regardless of password; credentials auth is non-functional
- Trigger: Attempting to use credentials login (Google provider works)
- Workaround: Use Google OAuth only

## Security Considerations

**Credentials Provider Has No Password Validation:**
- Risk: Anyone knowing an email address can login without password
- Files: `lib/auth.ts` (lines 18-23)
- Current mitigation: Credentials provider is defined but effectively broken (returns null if no email)
- Recommendations: Either implement proper password hashing with bcrypt and comparison, or remove credentials provider entirely and use Google OAuth only

**No Role-Based Access Control on Public tRPC Procedures:**
- Risk: Sensitive data (facility details, risk scores, SHAP values) exposed via `publicProcedure`
- Files: `server/routers/facilities.ts` (line 5), `server/routers/sensors.ts` (line 4), `server/routers/risk.ts` (lines 4, 15), `server/routers/alerts.ts` (line 5)
- Current mitigation: None - all queries return data without auth check
- Recommendations: Change `publicProcedure` to `protectedProcedure` for sensitive queries; add district-level filtering based on user's assigned district

**Insufficient Input Validation:**
- Risk: String inputs not validated; could enable SQL injection or invalid enum casts
- Files: `server/routers/facilities.ts` (line 6), `server/routers/alerts.ts` (line 6), `server/routers/sensors.ts` (line 23)
- Current mitigation: Zod schemas exist but use generic `z.string()` without constraints
- Recommendations: Add min/max length constraints; use `z.enum()` for known values instead of string casting

**No Rate Limiting on API Endpoints:**
- Risk: DOS attack potential; unlimited queries per user
- Files: `app/api/trpc/[...trpc]/route.ts`
- Current mitigation: None
- Recommendations: Add tRPC rate limiting middleware or Next.js middleware for request throttling

## Performance Bottlenecks

**N+1 Query in Facilities List:**
- Problem: Each facility fetch includes `riskScores` relation; dashboard district selector maps over all districts each rendering
- Files: `server/routers/facilities.ts` (lines 13-15), `app/(app)/dashboard/page.tsx` (line 24)
- Cause: Inefficient Prisma query design; no aggregation or single batch query
- Improvement path: Use Prisma aggregation for risk metrics; memoize district options; implement pagination for facility list

**Unmemoized District Options Dropdown:**
- Problem: Districts array and options object regenerated on every component render
- Files: `app/(app)/alerts/page.tsx` (line 58), `app/(app)/dashboard/page.tsx` (lines 24-27), `app/(app)/facilities/page.tsx` (line 33)
- Cause: Options created inline without useMemo
- Improvement path: Move static district options to a constant or compute once with useMemo

**Client-Side Filtering on Alert List:**
- Problem: All alerts fetched to client, then filtered in JavaScript
- Files: `app/(app)/alerts/page.tsx` (lines 34-47)
- Cause: No server-side filtering via tRPC; mock data forces client filtering
- Improvement path: Implement server-side filtering in `alertsRouter.list`; use React Query pagination

**No Image Optimization:**
- Problem: Referenced images (Vercel, Next.js SVGs) are not optimized
- Files: `app/page.tsx` (lines 7-50)
- Cause: Default Next.js template uses standard `<Image>` without optimization context
- Improvement path: Remove template images; optimize actual landing page assets when ported

## Fragile Areas

**Dashboard Page Tightly Coupled to Mock Data:**
- Files: `app/(app)/dashboard/page.tsx`
- Why fragile: Direct import and filter of mock data; changes to mock data structure break rendering; no separation of data fetching
- Safe modification: Replace mock imports with tRPC query hooks; keep component focused on rendering
- Test coverage: No tests; page will break silently if data structure changes

**Alerts Page Filter Logic is Hardcoded:**
- Files: `app/(app)/alerts/page.tsx` (lines 34-47)
- Why fragile: Filter matches are inline and duplicated; severity filter uses mock data enums; CSV export format is hardcoded
- Safe modification: Extract filtering to custom hook; use tRPC input validation for filters
- Test coverage: None; filter logic untested

**Type Definitions Lag Behind Schema:**
- Files: `types/index.ts`, `prisma/schema.prisma`
- Why fragile: Types are partially defined (missing relationships, incomplete fields); don't match Prisma schema
- Safe modification: Generate types from Prisma schema using `prisma-client` exported types; remove manual definitions
- Test coverage: None; type mismatches not caught

**Authentication Setup Missing User Type Extension:**
- Files: `lib/auth.ts`
- Why fragile: Session callbacks use `as any` to access role; NextAuth type definitions not extended
- Safe modification: Extend NextAuth session/jwt types in `types/next-auth.d.ts`; remove casts
- Test coverage: None; role assignment not validated

## Scaling Limits

**No Pagination on Query Results:**
- Current capacity: tRPC procedures return `take: 50` hardcoded or all results
- Limit: 1243 facilities * 7 facility queries (sensors, forecasts, alerts, risk scores) = 8701+ rows per full dashboard load
- Scaling path: Implement cursor-based pagination in all routers; use React Query's useInfiniteQuery; cache frequently accessed facility subsets

**Prisma Query Complexity Without Aggregation:**
- Current capacity: Database returns full objects including nested relations for dashboard
- Limit: With 1243 facilities and forecasts/alerts, dashboard query could return MB of data
- Scaling path: Create database views or materialized tables for pre-computed risk scores; use select queries to fetch only needed fields

**Sensor Data Time Series Without TimescaleDB:**
- Current capacity: SensorReading table grows unbounded without hypertable compression
- Limit: 1243 facilities * 7 sensor types * ~1440 readings/day = ~12.4M rows/month
- Scaling path: Implement TimescaleDB hypertable as noted in CLAUDE.md; add compression policy for readings > 30 days

**No Caching Layer for Expensive Computations:**
- Current capacity: Risk scores recomputed on every query
- Limit: ML API calls for 1243 facilities could timeout if called serially
- Scaling path: Add Redis cache for SHAP values and risk scores with 1-hour TTL; use background job for score updates

## Dependencies at Risk

**Next 16.1.6 — Latest Major Version:**
- Risk: Recently released with potential breaking changes; limited production track record
- Impact: Could have undiscovered bugs; type definitions may change
- Migration plan: Consider pinning to stable 15.x until 16.x matures; test thoroughly in staging

**React 19.2.3 — Latest Unstable Release:**
- Risk: Pre-release version; breaking changes possible between patch versions
- Impact: Dependencies may not support React 19 yet; hydration issues on SSR
- Migration plan: Pin to stable 18.3.x until React 19 is officially released and ecosystem stabilizes

**Recharts Integration Without Error Boundary:**
- Risk: Recharts crashes can unmount entire dashboard; no fallback rendering
- Impact: Single bad data point crashes Risk Map and Analytics
- Migration plan: Wrap chart components in error boundary; add data validation before charting

**MapBox GL Conditional Loading:**
- Risk: Map initialization skipped if `NEXT_PUBLIC_MAPBOX_TOKEN` missing; UI shows placeholder but no error handling
- Impact: Users see placeholder indefinitely without knowing why; no feedback mechanism
- Migration plan: Add error state to map container; provide admin panel to configure token; add error toast

## Missing Critical Features

**No Realtime Alert Updates:**
- Problem: Alert feed is static; Supabase dependency installed but not used
- Blocks: Users won't see new critical alerts until page refresh; live monitoring is impossible
- Implementation: Subscribe to Supabase `postgres_changes` in `AlertFeed` component using existing Supabase client

**No Intervention Tracking UI:**
- Problem: Intervention model exists in schema but no page/forms to log interventions
- Blocks: Cannot track response actions or calculate intervention success rates
- Implementation: Add `/interventions` page; create intervention creation form in alert detail sheet

**No Admin Panel:**
- Problem: Admin router exists with user/facility CRUD but no UI pages
- Blocks: Cannot manage users, facilities, or view system metrics
- Implementation: Create `/admin` pages for user management, facility management, system health

**No Export/Import Functionality:**
- Problem: Alerts page has CSV export button but implementation is incomplete; no facility/user import
- Blocks: Data analysis and migration workflows
- Implementation: Complete alert export; add facility bulk import; add data validation before import

**No Forecast Model Comparison:**
- Problem: ForecastChart shows point forecast without comparing model versions
- Blocks: Cannot track forecast accuracy improvement; no A/B testing
- Implementation: Add model version selection; compare confidence intervals across models

## Test Coverage Gaps

**No Unit Tests:**
- What's not tested: tRPC routers, type validation, auth callbacks, utility functions
- Files: `server/routers/`, `lib/auth.ts`, `lib/utils.ts`
- Risk: Silent failures in business logic; can't refactor with confidence
- Priority: **High** - Core data layer has zero test coverage

**No Integration Tests:**
- What's not tested: tRPC client + Prisma queries, NextAuth flow, API routes
- Files: `app/api/`, server routers with Prisma calls
- Risk: Schema changes break queries; auth changes cause security holes
- Priority: **High** - Data and auth layers interact without tests

**No Component Tests:**
- What's not tested: Filter logic, form handling, error states
- Files: `app/(app)/alerts/page.tsx`, `app/(app)/facilities/page.tsx`, all custom components
- Risk: UI breaks silently; edge cases missed
- Priority: **Medium** - Affects user experience but lower risk than backend

**No E2E Tests:**
- What's not tested: Full user journeys (login → dashboard → view facility → acknowledge alert)
- Files: None
- Risk: Regression on critical paths; no confidence in deployments
- Priority: **Medium** - Manual testing sufficient for current maturity level

**No API Contract Tests:**
- What's not tested: tRPC query/mutation signatures, response shapes
- Files: `server/routers/`
- Risk: Frontend breaks when API changes; undocumented breaking changes
- Priority: **Medium** - TypeScript provides some safety but explicit tests would help

---

*Concerns audit: 2026-03-08*
