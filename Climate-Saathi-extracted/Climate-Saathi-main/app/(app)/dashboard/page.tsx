'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { Navigation } from '@/components/Navigation'
import { PulseDot } from '@/components/ui-custom/PulseDot'
import { CustomSelect } from '@/components/ui-custom/CustomSelect'
import { RiskBadge } from '@/components/ui-custom/RiskBadge'
import { trpc } from '@/lib/trpc'
import { useRealtimeAlerts } from '@/hooks/useRealtimeAlerts'
import { useTranslation, useLanguageStore } from '@/lib/i18n'
import { Building2, Bell, MapPin, TrendingUp, TrendingDown, RefreshCw, ArrowRight, Thermometer, CloudRain, Droplets, Sun } from 'lucide-react'
import type { RiskLevel } from '@/types'

const MapboxDistrictMap = dynamic(
  () => import('./_components/MapboxDistrictMap'),
  { ssr: false, loading: () => <div className="flex-1 bg-charcoal/50 animate-pulse rounded" /> }
)

function useTimeAgo() {
  const { t } = useTranslation()
  return (date: string) => {
    const h = Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000)
    if (h < 1) return t('common.justNow')
    if (h < 24) return `${h}${t('common.hAgo')}`
    return `${Math.floor(h / 24)}${t('common.dAgo')}`
  }
}

export default function DashboardPage() {
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { t } = useTranslation()
  const locale = useLanguageStore((s) => s.locale)
  const timeAgo = useTimeAgo()
  useRealtimeAlerts()

  const { data: summary } = trpc.analytics.summary.useQuery({})
  const { data: activeAlertsRaw = [], isLoading: alertsLoading } = trpc.alerts.list.useQuery({
    status: 'ACTIVE',
    limit: 50,
    ...(selectedDistrict !== 'all' && { district: selectedDistrict }),
  })
  // Climate data for selected district
  const { data: climateSummaries = [] } = trpc.climate.districts.useQuery()
  const selectedClimate = climateSummaries.find(
    (c) => c.district === selectedDistrict
  ) ?? climateSummaries[0]
  // Cast to break deep Prisma+tRPC type instantiation
  const activeAlerts = activeAlertsRaw as Array<{
    id: string; type: string; severity: string; message: string; status: string
    triggeredAt: Date | string; facility: { name: string; nameHi?: string | null; district?: string | null } | null
  }>
  const { data: facilityRisks = [] } = trpc.risk.dashboard.useQuery(
    selectedDistrict !== 'all' ? { district: selectedDistrict } : {}
  )
  const { data: districtRiskData = [] } = trpc.analytics.districtRisk.useQuery()

  const districtList = useMemo(() => {
    if (districtRiskData.length > 0) {
      return districtRiskData.map(d => ({
        name: d.name,
        averageRisk: Math.round(d.risk),
        facilitiesCount: d.facilities,
      }))
    }
    const map: Record<string, { risk: number; count: number }> = {}
    for (const f of facilityRisks) {
      const d = f.district?.toUpperCase()
      if (!d) continue
      if (!map[d]) map[d] = { risk: 0, count: 0 }
      map[d].risk += f.overallRisk
      map[d].count++
    }
    const titleCase = (s: string) =>
      s.toLowerCase().replace(/(?:^|\s|-)\S/g, c => c.toUpperCase())
    return Object.entries(map).map(([key, { risk, count }]) => ({
      name: titleCase(key),
      averageRisk: Math.round(risk / count),
      facilitiesCount: count,
    }))
  }, [facilityRisks, districtRiskData])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  const districtOptions = [
    { value: 'all', label: t('dashboard.allDistricts') },
    ...districtList.map(d => ({ value: d.name, label: d.name })),
  ]

  return (
    <div className="min-h-screen bg-mint dark:bg-forest">
      <Navigation />
      <div className="pt-[72px]">
        {/* KPI Bar */}
        <div className="bg-white dark:bg-forest-light border-b border-sage/10 dark:border-white/10 px-[7vw] py-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label text-sage dark:text-white/50">{t('dashboard.totalFacilities')}</span>
                <Building2 className="w-4 h-4 text-teal" />
              </div>
              <div className="flex items-end justify-between">
                <span className="font-sora font-bold text-2xl text-dark dark:text-white">
                  {summary?.totalFacilities ?? '--'}
                </span>
                <span className="flex items-center text-xs text-leaf">
                  <TrendingUp className="w-3 h-3 mr-0.5" />{t('dashboard.live')}
                </span>
              </div>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label text-sage dark:text-white/50">{t('dashboard.activeAlerts')}</span>
                <div className="flex items-center gap-1.5"><PulseDot color="coral" size="sm" /><Bell className="w-4 h-4 text-coral" /></div>
              </div>
              <div className="flex items-end justify-between">
                <span className="font-sora font-bold text-2xl text-dark dark:text-white">
                  {summary?.activeAlerts ?? '--'}
                </span>
                <span className="flex items-center text-xs text-coral">
                  <TrendingDown className="w-3 h-3 mr-0.5" />{t('dashboard.live')}
                </span>
              </div>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label text-sage dark:text-white/50">{t('dashboard.criticalAlerts')}</span>
                <TrendingUp className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex items-end justify-between">
                <span className="font-sora font-bold text-2xl text-dark dark:text-white">
                  {summary?.criticalAlerts ?? '--'}
                </span>
                <span className="flex items-center text-xs text-red-500">
                  <TrendingUp className="w-3 h-3 mr-0.5" />{t('dashboard.live')}
                </span>
              </div>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label text-sage dark:text-white/50">{t('dashboard.monitoredDistricts')}</span>
                <TrendingDown className="w-4 h-4 text-amber-dark" />
              </div>
              <div className="flex items-end justify-between">
                <span className="font-sora font-bold text-2xl text-dark dark:text-white">
                  {districtList.length > 0 ? districtList.length : '--'}
                </span>
                <span className="flex items-center text-xs text-leaf">
                  <TrendingDown className="w-3 h-3 mr-0.5" />{t('dashboard.live')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Climate Data Strip */}
        {selectedClimate && (
          <div className="bg-white/60 dark:bg-forest-light/60 backdrop-blur-sm border-b border-sage/10 dark:border-white/10 px-[7vw] py-3">
            <div className="flex items-center gap-2 mb-2">
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium text-dark dark:text-white">
                Climate: {selectedClimate.district} (2024 avg)
              </span>
              <span className="text-[10px] text-sage dark:text-white/40 ml-auto">NASA POWER Dataset</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 bg-coral/5 dark:bg-coral/10 rounded-lg px-3 py-2">
                <Thermometer className="w-4 h-4 text-coral shrink-0" />
                <div>
                  <p className="text-xs text-sage dark:text-white/50">{t('climate.temperature')}</p>
                  <p className="font-sora font-semibold text-sm text-dark dark:text-white">{selectedClimate.temperature}°C</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-blue-400/5 dark:bg-blue-400/10 rounded-lg px-3 py-2">
                <CloudRain className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <p className="text-xs text-sage dark:text-white/50">{t('climate.rainfall')}</p>
                  <p className="font-sora font-semibold text-sm text-dark dark:text-white">{selectedClimate.rainfall} mm/day</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-teal/5 dark:bg-teal/10 rounded-lg px-3 py-2">
                <Droplets className="w-4 h-4 text-teal shrink-0" />
                <div>
                  <p className="text-xs text-sage dark:text-white/50">{t('climate.humidity')}</p>
                  <p className="font-sora font-semibold text-sm text-dark dark:text-white">{selectedClimate.humidity}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-amber-500/5 dark:bg-amber-500/10 rounded-lg px-3 py-2">
                <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs text-sage dark:text-white/50">{t('climate.ghi')}</p>
                  <p className="font-sora font-semibold text-sm text-dark dark:text-white">{selectedClimate.ghi} kWh/m²</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="px-[7vw] py-6">
          <div className="flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-220px)]">
            {/* Left Sidebar - Districts */}
            <div className="lg:w-[280px] shrink-0 glass-card flex flex-col min-h-[300px] lg:min-h-0 lg:h-full">
              <div className="p-4 border-b border-sage/10 dark:border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-teal" />
                  <h3 className="font-sora font-semibold text-dark dark:text-white">{t('dashboard.districts')}</h3>
                </div>
                <CustomSelect value={selectedDistrict} onChange={setSelectedDistrict} options={districtOptions} placeholder={t('dashboard.selectDistrict')} />
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-2 scrollbar-thin">
                {districtList.length === 0 ? (
                  <div className="text-center py-8">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-sage/40 dark:text-white/20" />
                    <p className="text-sage dark:text-white/40 text-sm">{t('dashboard.noDistrictData')}</p>
                  </div>
                ) : districtList.map(d => (
                  <button key={d.name} onClick={() => setSelectedDistrict(d.name)}
                    className={cn('w-full p-3 rounded-xl text-left transition-all',
                      selectedDistrict === d.name
                        ? 'bg-teal/10 dark:bg-teal/20 border border-teal/30'
                        : 'hover:bg-mint-dark dark:hover:bg-forest border border-transparent')}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-dark dark:text-white text-sm">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-sage dark:text-white/50">
                      <span>{d.facilitiesCount} {t('dashboard.facilities')}</span>
                      <span className={cn(d.averageRisk > 60 ? 'text-coral' : d.averageRisk > 40 ? 'text-amber-dark' : 'text-leaf')}>
                        {t('dashboard.risk')}: {d.averageRisk}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Center - Map */}
            <div className="flex-1 glass-card flex flex-col min-h-[400px] lg:min-h-0 lg:h-full">
              <div className="p-4 border-b border-sage/10 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-teal" />
                  <h3 className="font-sora font-semibold text-dark dark:text-white">{t('dashboard.riskMap')}</h3>
                </div>
                <button onClick={handleRefresh}
                  className={cn('p-2 rounded-lg hover:bg-mint-dark dark:hover:bg-forest transition-colors', isRefreshing && 'animate-spin')}>
                  <RefreshCw className="w-4 h-4 text-sage dark:text-white/50" />
                </button>
              </div>
              <MapboxDistrictMap
                districtRisks={districtRiskData}
                onDistrictClick={(districtName) => setSelectedDistrict(districtName)}
              />
            </div>

            {/* Right Panel - Alerts */}
            <div className="lg:w-[320px] shrink-0 glass-card flex flex-col min-h-[400px] lg:min-h-0 lg:h-full">
              <div className="p-4 border-b border-sage/10 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-amber" />
                    <h3 className="font-sora font-semibold text-dark dark:text-white">{t('dashboard.liveAlerts')}</h3>
                  </div>
                  <span className="px-2 py-0.5 bg-coral/10 text-coral text-xs rounded-full font-mono">
                    {activeAlerts.length}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3 scrollbar-thin">
                {alertsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 bg-charcoal/30 animate-pulse rounded-xl" />
                    ))}
                  </div>
                ) : activeAlerts.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-leaf/10 flex items-center justify-center mx-auto mb-3">
                      <Bell className="w-6 h-6 text-leaf" />
                    </div>
                    <p className="text-sage dark:text-white/50 text-sm">{t('dashboard.noActiveAlerts')}</p>
                  </div>
                ) : activeAlerts.map(alert => (
                  <div key={alert.id} className="bg-charcoal/80 border border-teal/20 rounded-xl backdrop-blur-sm p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <RiskBadge level={alert.severity as RiskLevel} size="sm" />
                      <span className="text-xs font-mono text-white/50">
                        {timeAgo(alert.triggeredAt.toString())}
                      </span>
                    </div>
                    <p className="text-sm font-sora font-semibold text-white">{alert.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-white/60 line-clamp-2">{alert.message}</p>
                    <p className="text-xs text-white/50">{locale === 'hi' && alert.facility?.nameHi ? alert.facility.nameHi : alert.facility?.name}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-sage/10 dark:border-white/10">
                <Link href="/alerts"
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal/10 hover:bg-teal/20 text-teal rounded-xl transition-colors text-sm font-medium">
                  {t('dashboard.viewAllAlerts')} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
