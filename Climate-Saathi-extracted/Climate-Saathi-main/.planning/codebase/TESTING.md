# Testing Patterns

**Analysis Date:** 2026-03-08

## Test Framework

**Current Status:** No testing framework configured

**Runner:**
- Not detected in dependencies
- No Jest, Vitest, or other test runner found in `package.json`
- No test configuration files (jest.config.*, vitest.config.*, etc.)

**Assertion Library:**
- Not applicable (no test setup)

**Run Commands:**
```bash
# No test commands currently configured in package.json
# Currently only available:
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server
```

## Test File Organization

**Location:**
- No `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files found in project root or `app/` directory
- Test files only exist in `node_modules/` (third-party dependencies)

**Naming Convention:**
- When tests are implemented, use `*.test.ts` or `*.test.tsx` suffix (Next.js standard)

**Projected Structure:**
```
app/
├── (app)/
│   ├── dashboard/
│   │   ├── page.tsx
│   │   └── page.test.tsx         ← co-located
│   └── facilities/
│       ├── [id]/
│       │   ├── page.tsx
│       │   └── page.test.tsx     ← co-located
└── page.test.tsx                 ← root page tests

components/
├── Navigation.tsx
├── Navigation.test.tsx           ← co-located
└── ui-custom/
    ├── AlertItem.tsx
    └── AlertItem.test.tsx        ← co-located

server/
├── trpc.ts
├── trpc.test.ts                  ← co-located
└── routers/
    ├── facilities.ts
    └── facilities.test.ts        ← co-located

lib/
├── auth.ts
└── auth.test.ts                  ← co-located
```

## Test Structure (Projected Pattern)

**Suite Organization:**
```typescript
// components/Navigation.test.tsx example structure
import { render, screen } from '@testing-library/react'
import { Navigation } from './Navigation'

describe('Navigation Component', () => {
  describe('Rendering', () => {
    it('should render logo and brand name', () => {
      render(<Navigation />)
      expect(screen.getByText('Climate Saathi')).toBeInTheDocument()
    })

    it('should render nav links', () => {
      render(<Navigation />)
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Facilities')).toBeInTheDocument()
    })
  })

  describe('Scroll Behavior', () => {
    it('should update nav background on scroll', () => {
      // scroll behavior test
    })
  })

  describe('Mobile Menu', () => {
    it('should toggle mobile menu on button click', () => {
      // mobile menu test
    })
  })
})
```

**Patterns Observed in Codebase (to mirror):**
- Guard clauses in code suggest testable edge cases: `if (!ctx.session)`, `if (filtered.length === 0)`
- Conditional rendering patterns map to test branches: status checks, risk level filters
- Type-driven behavior suggests test matrices by type: `type === 'SCHOOL'` vs `type === 'HEALTH_CENTRE'`

## Mocking

**Framework:** No mocking framework configured

**Projected Approach:**
```typescript
// Mock external dependencies
vi.mock('@/lib/auth', () => ({
  authOptions: {
    providers: [],
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    facility: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
    },
  },
}))

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    pathname: '/',
  }),
  usePathname: () => '/',
}))

// Mock Zustand store
vi.mock('@/store/useDashboardStore', () => ({
  useDashboardStore: () => ({
    selectedDistrict: null,
    setDistrict: vi.fn(),
  }),
}))
```

**What to Mock:**
- External APIs (Supabase, ML service)
- Prisma client database calls
- NextAuth session/auth
- Next.js routing (useRouter, usePathname)
- Zustand store
- Environment variables
- Mapbox GL initialization
- Recharts animations (to speed up tests)

**What NOT to Mock:**
- React hooks (useState, useEffect) — test via RTL user interactions
- CSS/styling utilities (cn function)
- Type definitions and interfaces
- Business logic in utility functions
- Component composition and rendering

## Fixtures and Factories

**Test Data:**
```typescript
// __fixtures__/alerts.ts
export const mockAlert = (overrides = {}): Alert => ({
  id: 'a1',
  facilityId: 'f1',
  facilityName: 'Test Facility',
  district: 'Raipur',
  type: 'Heat Stress',
  severity: 'HIGH',
  status: 'ACTIVE',
  message: 'Test alert message',
  channels: ['SMS', 'EMAIL'],
  createdAt: '2026-03-08T10:00:00Z',
  ...overrides,
})

export const mockFacility = (overrides = {}): Facility => ({
  id: 'f1',
  name: 'Test School',
  type: 'SCHOOL',
  district: 'Raipur',
  block: 'Raipur Urban',
  latitude: 21.2514,
  longitude: 81.6296,
  riskScore: 50,
  riskLevel: 'MEDIUM',
  sensorStatus: 'ONLINE',
  lastReading: '2026-03-08T10:00:00Z',
  sensors: [],
  ...overrides,
})

export const mockDistrict = (overrides = {}): District => ({
  id: 'd1',
  name: 'Raipur',
  facilitiesCount: 245,
  schoolsCount: 180,
  healthCentresCount: 65,
  averageRiskScore: 42,
  activeAlerts: 12,
  ...overrides,
})
```

**Location:**
- Place in `__fixtures__/` directory at project root or within test directories
- Example: `./__fixtures__/types.ts`, `./app/__fixtures__/data.ts`

## Coverage

**Requirements:** Not enforced (no coverage tool configured)

**Projected Target (when tests implemented):**
- Components: 80%+ line coverage
- Utils/helpers: 90%+ coverage
- API routes: 85%+ coverage
- Server logic (tRPC): 85%+ coverage
- Pages: 70%+ coverage (harder to test, focus on key flows)

**View Coverage (when tools added):**
```bash
npm run test:coverage       # When configured
# or
vitest --coverage           # If Vitest is added
jest --coverage             # If Jest is added
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, components in isolation
- Approach: Test props, state changes, event handlers
- Examples:
  - `SensorCard.test.tsx`: Render with different sensor types, verify correct icon displays
  - `AlertItem.test.tsx`: Test status badge rendering, timeAgo calculation
  - `lib/utils.test.ts`: Test `cn()` utility with various Tailwind class combinations
  - `server/routers/facilities.test.ts`: Test query inputs, verify Prisma call params

**Integration Tests:**
- Scope: Components with child components, page with multiple sections
- Approach: Render page/component tree, interact, verify state propagation
- Examples:
  - `app/(app)/dashboard/page.test.tsx`: Render full dashboard, filter by district, verify map updates
  - `app/(app)/facilities/page.test.tsx`: Render facilities list, search, filter by risk level
  - `server/trpc.test.ts`: Test full tRPC call chain (procedure → context → Prisma → response)

**E2E Tests:**
- Framework: Not used (no Playwright, Cypress, or similar configured)
- Candidates when implemented:
  - User authentication flow (login → redirect → dashboard visible)
  - Full alert lifecycle (trigger → notification → acknowledgement → resolution)
  - Facility search → detail view → sensor data display

## Common Patterns

**Async Testing:**
```typescript
// Component with async data
it('should load facilities on mount', async () => {
  const { getByText } = render(<FacilitiesPage />)

  // Wait for async query to resolve
  const facility = await screen.findByText('Govt. H.S. School Raipur')
  expect(facility).toBeInTheDocument()
})

// Testing useEffect cleanup
it('should remove event listener on unmount', () => {
  const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
  const { unmount } = render(<Navigation />)

  unmount()
  expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
})

// tRPC procedure testing
it('should fetch facilities with filter', async () => {
  const caller = appRouter.createCaller(ctx)
  const result = await caller.facilities.list({ district: 'Raipur' })

  expect(result).toHaveLength(2)
  expect(result[0].district).toBe('Raipur')
})
```

**Error Testing:**
```typescript
// Test authorization errors
it('should throw UNAUTHORIZED for protected procedure without session', async () => {
  const caller = appRouter.createCaller({ session: null, prisma })

  expect(() => caller.admin.listUsers()).rejects.toThrow(TRPCError)
})

// Test validation errors
it('should reject invalid facility ID', async () => {
  const caller = appRouter.createCaller(ctx)

  expect(() => caller.facilities.byId({ id: '' })).rejects.toThrow()
})

// Test component error states
it('should display empty state when no facilities match filters', () => {
  render(<FacilitiesPage />)
  userEvent.type(screen.getByPlaceholderText('Search facilities...'), 'nonexistent')

  expect(screen.getByText('No facilities found')).toBeInTheDocument()
})
```

**User Interaction Testing:**
```typescript
import userEvent from '@testing-library/user-event'

it('should toggle mobile menu', async () => {
  const user = userEvent.setup()
  render(<Navigation />)

  const menuButton = screen.getByRole('button', { name: /menu/i })
  await user.click(menuButton)

  expect(screen.getByText('Dashboard')).toBeVisible()
})

it('should filter facilities by district', async () => {
  const user = userEvent.setup()
  render(<FacilitiesPage />)

  const districtSelect = screen.getByDisplayValue('All Districts')
  await user.selectOption(districtSelect, 'Raipur')

  expect(screen.queryByText('Primary Health Centre Bastar')).not.toBeInTheDocument()
})
```

## Implementation Recommendations

**Next Steps to Add Testing:**

1. **Install test framework:**
   ```bash
   npm install --save-dev vitest @vitest/ui
   npm install --save-dev @testing-library/react @testing-library/jest-dom
   npm install --save-dev jsdom
   npm install --save-dev @vitest/browser
   ```

2. **Create Vitest config** (`vitest.config.ts`):
   ```typescript
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'
   import path from 'path'

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'jsdom',
       globals: true,
       setupFiles: ['./vitest.setup.ts'],
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
       },
     },
     resolve: {
       alias: {
         '@': path.resolve(__dirname, './'),
       },
     },
   })
   ```

3. **Create setup file** (`vitest.setup.ts`):
   ```typescript
   import '@testing-library/jest-dom'
   import { vi } from 'vitest'

   // Mock Next.js modules
   vi.mock('next/navigation', () => ({
     useRouter: () => ({ push: vi.fn() }),
     usePathname: () => '/',
   }))
   ```

4. **Add npm scripts** to `package.json`:
   ```json
   {
     "scripts": {
       "test": "vitest",
       "test:watch": "vitest --watch",
       "test:ui": "vitest --ui",
       "test:coverage": "vitest --coverage"
     }
   }
   ```

5. **Start writing tests** co-located with components:
   - Begin with utility functions (`lib/utils.test.ts`)
   - Move to components (`components/AlertItem.test.tsx`)
   - Then pages and integration tests
   - Finally server logic (`server/routers/*.test.ts`)

---

*Testing analysis: 2026-03-08*
