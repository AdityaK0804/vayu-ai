import { router } from '@/server/trpc'
import { facilitiesRouter } from './facilities'
import { sensorsRouter } from './sensors'
import { alertsRouter } from './alerts'
import { riskRouter } from './risk'
import { analyticsRouter } from './analytics'
import { adminRouter } from './admin'
import { climateRouter } from './climate'
import { chatRouter } from './chat'
import { digitalTwinRouter } from './digitalTwin'

export const appRouter = router({
  facilities: facilitiesRouter,
  sensors:    sensorsRouter,
  alerts:     alertsRouter,
  risk:       riskRouter,
  analytics:  analyticsRouter,
  admin:      adminRouter,
  climate:    climateRouter,
  chat:       chatRouter,
  digitalTwin: digitalTwinRouter,
})

export type AppRouter = typeof appRouter
