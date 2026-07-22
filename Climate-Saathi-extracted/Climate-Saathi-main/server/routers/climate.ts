import { z } from 'zod'
import { router, publicProcedure } from '@/server/trpc'
import {
  getDistrictClimateSummaries,
  getDistrictMonthlyHistory,
  getDistrictYearlyHistory,
  getDistrictNames,
  getDistrictRecentDaily,
} from '@/server/services/climateData'

export const climateRouter = router({
  /** All districts with their latest-year climate averages */
  districts: publicProcedure.query(() => {
    return getDistrictClimateSummaries()
  }),

  /** List of all district names */
  districtNames: publicProcedure.query(() => {
    return getDistrictNames()
  }),

  /** Monthly averages for a district within a year range */
  monthlyHistory: publicProcedure
    .input(
      z.object({
        district: z.string(),
        startYear: z.number().optional(),
        endYear: z.number().optional(),
      })
    )
    .query(({ input }) => {
      return getDistrictMonthlyHistory(input.district, input.startYear, input.endYear)
    }),

  /** Yearly averages for a district across all years */
  yearlyHistory: publicProcedure
    .input(z.object({ district: z.string() }))
    .query(({ input }) => {
      return getDistrictYearlyHistory(input.district)
    }),

  /** Recent daily data (last N days of available data) */
  recentDaily: publicProcedure
    .input(
      z.object({
        district: z.string(),
        days: z.number().min(7).max(365).default(30),
      })
    )
    .query(({ input }) => {
      return getDistrictRecentDaily(input.district, input.days)
    }),
})
