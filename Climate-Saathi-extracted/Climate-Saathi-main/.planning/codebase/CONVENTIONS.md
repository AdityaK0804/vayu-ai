# Coding Conventions

**Analysis Date:** 2026-03-08

## Naming Patterns

**Files:**
- Page files follow Next.js App Router convention: `page.tsx` for routes
- Components use PascalCase: `Navigation.tsx`, `AlertItem.tsx`, `SensorCard.tsx`
- Utility/helper files use camelCase: `mockData.ts`, `useDashboardStore.ts`
- Custom hooks use camelCase with `use` prefix: `useDashboardStore.ts`
- Type/interface files: `index.ts` in `types/` directory, exported as named exports

**Functions:**
- React component functions use PascalCase (same as filename): `export function Navigation()`, `export default function DashboardPage()`
- Helper/utility functions use camelCase: `timeAgo()`, `getStatusIcon()`, `handleRefresh()`
- Type predicates and guards use camelCase: `createContext()`, `initTRPC()`

**Variables:**
- State variables use camelCase: `selectedDistrict`, `isRefreshing`, `searchQuery`
- Constants use UPPER_SNAKE_CASE in some cases (alert status configs): `statusConfig`, `sensorIcons`
- Boolean variables prefix with `is`, `has`, or `can`: `isScrolled`, `isMobileMenuOpen`, `isLanding`
- Event handler callbacks follow `handle[Event]` pattern: `handleRefresh()`, `handleScroll()`, `handleExport()`
- Callbacks passed as props follow `on[Event]` pattern in prop interfaces: `onClick`, `onChange`, `onOpenChange`

**Types:**
- Interface names are PascalCase: `Alert`, `Facility`, `District`, `AlertFilters`
- Type definitions use PascalCase: `RiskLevel`, `FacilityType`, `AlertStatus`
- Generic constraint contexts use `Context`: exported as `Context` type for tRPC
- Union types use UPPER_CASE for literal values: `'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'`

## Code Style

**Formatting:**
- No linting/formatting tool configured (no ESLint, Prettier, or Biome config found)
- Consistent indentation: 2 spaces (observed throughout codebase)
- Line length: appears to follow reasonable limits (~120 chars observed)
- No semicolons at end of statements (follows Next.js/React convention)

**Tailwind Classes:**
- Classes are passed via `cn()` utility for conditional merging: `cn('base-class', condition && 'conditional-class')`
- Use `@apply` directive in CSS for reusable utility classes: `.glass-card`, `.btn-primary`, `.btn-secondary`, `.risk-low`, etc.
- Dark mode classes prefixed with `dark:`: `dark:bg-forest-light`, `dark:text-white`, `dark:border-white/10`
- Responsive prefixes follow Tailwind convention: `lg:`, `md:`, `xl:`, `sm:`, etc.
- Color naming: forest, teal, amber, mint, leaf, coral, sage (from design tokens)

**Component Props:**
- Props are destructured inline in function parameters
- Optional props marked with `?` in interface definitions
- Callback props typed explicitly with function signatures
- Spread operator used for pass-through props: `{ ...props }`

**String Formatting:**
- Template literals used for dynamic values in JSX: `href={`/facilities/${f.id}`}`
- Consistent quote style: single quotes for imports/exports, JSX attributes use double quotes
- CSV export escapes quoted strings in data: `"${a.message}"`

## Import Organization

**Order:**
1. External libraries (React, Next, third-party packages): `import { useState } from 'react'`, `import Link from 'next/link'`
2. Internal absolute imports via `@/` alias: `import { cn } from '@/lib/utils'`, `import { Navigation } from '@/components/Navigation'`
3. Type imports separated: `import type { Alert } from '@/types'`
4. Component-specific imports last

**Path Aliases:**
- `@/*` resolves to project root (configured in `tsconfig.json`)
- All imports use this alias, no relative paths observed
- Examples: `@/components/`, `@/lib/`, `@/types/`, `@/data/`, `@/server/`

**Import Style:**
- Named exports preferred: `import { cn } from '@/lib/utils'`
- Default exports used for pages and components: `export default function DashboardPage()`
- Type imports explicitly marked: `import type { Alert } from '@/types'`

## Error Handling

**Patterns:**
- Try-catch not observed in codebase (likely handled at API layer)
- tRPC error handling via `TRPCError`: `throw new TRPCError({ code: 'UNAUTHORIZED' })` or `throw new TRPCError({ code: 'FORBIDDEN' })`
- Null checks used defensively: `if (!ctx.session)`, `if (!credentials?.email) return null`
- Optional chaining employed throughout: `(ctx.session.user as any)?.role`, `input?.district`
- Error states managed via conditional rendering: `if (filtered.length === 0) { <div>No results</div> }`

**API Routes:**
- tRPC procedures enforce auth via middleware: `protectedProcedure`, `adminProcedure` return errors for unauthorized access
- NextAuth callbacks handle JWT/session errors silently (return null or modified session)
- Input validation via Zod: `z.object({ id: z.string() }).optional()`

**User Feedback:**
- Toaster component used for notifications: `<Toaster />` imported from `@/components/ui/sonner`
- Empty state UI shows helpful message: building icon + "No facilities found" text

## Logging

**Framework:** No logging framework detected; no console.log statements in codebase

**Patterns:**
- Development environment logs configured at Prisma client level: `log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']`
- No application-level logging observed in pages or components
- Server actions likely logged via Prisma + tRPC error handling

## Comments

**When to Comment:**
- Minimal comments observed in source code
- Comments used for section dividers in CSS: `/* ── Climate Saathi Design Tokens ─────────────────────────────── */`
- Inline code comments for clarification: `// 🚧 Landing page — redesign pending`
- Environment-specific hints in components: `{/* Mapbox map — add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to enable */}`

**JSDoc/TSDoc:**
- Not used in codebase
- Type definitions are self-documenting via TypeScript interfaces
- Component props documented via TypeScript interfaces, not JSDoc blocks

## Function Design

**Size:**
- Most functions kept to single responsibility: `timeAgo()` only formats dates, `getStatusIcon()` only maps status to icon
- Longer functions acceptable when managing page state: DashboardPage ~170 lines, AlertsPage ~172 lines
- Helper functions extracted when logic shared: `timeAgo()` duplicated in AlertItem and AlertsPage (consolidation opportunity)

**Parameters:**
- Props destructured in component function signature: `function AlertItem({ alert, onClick, className })`
- Optional parameters marked with `?`: `onClick?: () => void`, `className?: string`
- Callback parameters explicitly typed: `onChange: (value: string) => void`
- Default values used for state: `const [status, setStatus] = useState<AlertStatus | 'all'>('all')`

**Return Values:**
- React components return JSX: `return <div>...</div>`
- Utility functions return simple values: `return matchSearch && matchDist && matchType && matchRisk`
- Event handlers return void or Promise: `onClick={() => setSelectedAlert(a)}`
- Callbacks return void: `(v: string) => void`

## Module Design

**Exports:**
- Default exports used for pages: `export default function DashboardPage()`
- Named exports used for components/utilities: `export function Navigation()`, `export const useDashboardStore = create(...)`
- Type exports separated: `export type AppRouter = typeof appRouter`, `export type Context = Awaited<ReturnType<typeof createContext>>`

**Barrel Files:**
- Not used in codebase
- Direct imports from specific files preferred: `import { Navigation } from '@/components/Navigation'` not from `@/components/index`

**Component Composition:**
- Custom components composed from shadcn/ui components: `AlertItem` uses `cn()` from utils
- Status configurations extracted as objects: `statusConfig`, `sensorIcons` define mappings
- Reusable UI classes defined in CSS: `.glass-card`, `.btn-primary` in globals.css

## Conditional Rendering

**Pattern:**
- Ternary operators for simple conditions: `selectedDistrict === d.id ? 'active style' : 'inactive style'`
- Logical AND for simple presence checks: `{d.activeAlerts > 0 && <span>...</span>}`
- If-else for complex filtering logic: `if (f.sensorStatus === 'ONLINE') return ...`
- Mapping over arrays with conditional content: `{filtered.map(a => <AlertItem key={a.id} />)}`

**Empty States:**
- Explicit empty state UI provided: icon + heading + description text
- Examples: "No facilities found", "No alerts found", "No active alerts"

## State Management

**Client State:**
- `useState` hooks for local component state: `const [selectedDistrict, setSelectedDistrict] = useState<string>('all')`
- Zustand store for global app state: `useDashboardStore` with methods `setDistrict()`, `updateFilters()`
- URL state preferred over component state where possible (not fully implemented)

**Server State:**
- tRPC queries for data fetching (scaffold only, no actual queries in pages)
- React Query integration configured via `@trpc/react-query` (not actively used in components yet)

## CSS-in-JS & Styling

**Approach:**
- Tailwind CSS for all styling
- CSS custom properties for design tokens: `--color-forest`, `--font-sora`, `--shadow-glass`
- CSS `@layer` directives for component, base, and utility layers
- Keyframe animations for interactive elements: `@keyframes float`, `@keyframes pulse-dot`

**Dark Mode:**
- `.dark` class on `<html>` element controls dark mode
- `dark:` prefix for dark mode utilities: `dark:bg-forest`, `dark:text-white`
- Theme toggle component: `ThemeProvider` wraps app, `ThemeToggle` controls toggle

## Type Safety

**TypeScript:**
- Strict mode enabled: `"strict": true` in tsconfig.json
- Component props typed via interfaces: `interface AlertItemProps { alert: Alert; onClick?: () => void; className?: string }`
- React elements typed: `React.ReactNode` for children
- Zod for runtime validation in tRPC: `z.object({ district: z.string().optional() })`
- Type casting used sparingly, documented with comments: `(ctx.session.user as any)?.role`

---

*Convention analysis: 2026-03-08*
