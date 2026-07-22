'use client'
import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Navigation } from '@/components/Navigation'
import { RiskBadge } from '@/components/ui-custom/RiskBadge'
import { ForecastChart } from '@/components/ui-custom/ForecastChart'
import { ShapExplainer } from '@/components/ui-custom/ShapExplainer'
import { CustomSelect } from '@/components/ui-custom/CustomSelect'
import { PvHealthCard } from '@/components/ui-custom/PvHealthCard'
import { WhatIfSimulator } from '@/components/ui-custom/WhatIfSimulator'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { useTranslation, useLanguageStore } from '@/lib/i18n'
import { ArrowLeft, MapPin, Building2, School, HeartPulse, Wifi, WifiOff, Zap, Bell, Clock, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

function deriveRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 70) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 30) return 'MEDIUM'
  return 'LOW'
}

export default function FacilityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [scoringError, setScoringError] = useState<string | null>(null)
  const [selectedSensor, setSelectedSensor] = useState('WATER_LEVEL')
  const { t } = useTranslation()
  const locale = useLanguageStore((s) => s.locale)

  function sensorLabel(type: string): string {
    const key = `sensor.${type}`
    const translated = t(key)
    return translated !== key ? translated : type
  }

  const { data: facilityRaw, isLoading } = trpc.facilities.byId.useQuery({ id })
  // Cast to break deep Prisma+tRPC type instantiation
  const facility = facilityRaw as {
    id: string; name: string; nameHi?: string | null; type: string; district: string; block: string; lat: number; lng: number
    sensors: Array<{ id: string; sensorType: string; value: number; unit: string; timestamp: Date | string }>
    riskScores: Array<{ overallRisk: number; shapValues: Array<{ featureName: string; shapValue: number; rank: number }> }>
    forecasts: Array<{ values: unknown; p10: unknown; p90: unknown; horizonDays: number }>
    alerts: Array<{ id: string; type: string; severity: string; message: string; status: string; triggeredAt: Date | string }>
  } | null | undefined
  const { data: riskScore, refetch: refetchRisk } = trpc.risk.byFacility.useQuery(
    { facilityId: id },
    { enabled: !!id }
  )
  const utils = trpc.useUtils()
  const scoreMutation = trpc.risk.score.useMutation({
    onSuccess: () => {
      refetchRisk()
      utils.risk.byFacility.invalidate({ facilityId: id })
      setScoringError(null)
    },
    onError: (err) => setScoringError(err.message),
  })

  const { data: sensorHistory = [] } = trpc.sensors.history.useQuery(
    { facilityId: id, sensorType: selectedSensor, days: 14 },
    { enabled: !!id }
  )

  // Digital twin state (includes PV health)
  const { data: twinData } = trpc.digitalTwin.state.useQuery(
    { facilityId: id },
    { enabled: !!id }
  )

  const sensorHistoryChartData = useMemo(() =>
    sensorHistory.map((s: { timestamp: Date | string; value: number }) => ({
      time: new Date(s.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      value: s.value,
    })),
    [sensorHistory]
  )

  const sensorTypeOptions = [
    { value: 'WATER_LEVEL', label: 'Water Level' },
    { value: 'SOLAR_OUTPUT', label: 'Solar Output' },
    { value: 'TEMPERATURE', label: 'Temperature' },
    { value: 'CHLORINE', label: 'Chlorine' },
    { value: 'TURBIDITY', label: 'Turbidity' },
    { value: 'HUMIDITY', label: 'Humidity' },
    { value: 'BATTERY', label: 'Battery' },
  ]

  const latestByType = useMemo(() => {
    const map: Record<string, NonNullable<typeof facility>['sensors'][0]> = {}
    for (const s of facility?.sensors ?? []) {
      if (!map[s.sensorType]) map[s.sensorType] = s
    }
    return Object.values(map)
  }, [facility?.sensors])

  if (isLoading) return (
    <div className="min-h-screen bg-mint dark:bg-forest">
      <Navigation />
      <div className="pt-[72px] px-[7vw] py-6">
        <Skeleton className="h-24 w-full rounded-2xl mb-6" />
        <div className="grid lg:grid-cols-12 gap-6">
          <Skeleton className="lg:col-span-5 h-64 rounded-2xl" />
          <Skeleton className="lg:col-span-7 h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  )

  if (!facility) return (
    <div className="min-h-screen bg-mint dark:bg-forest flex items-center justify-center">
      <div className="text-center">
        <Building2 className="w-16 h-16 text-sage/30 mx-auto mb-4" />
        <h2 className="font-sora font-bold text-dark dark:text-white mb-2">{t('facilities.facilityNotFound')}</h2>
        <Link href="/facilities" className="text-teal hover:underline">← {t('facilities.backToFacilities')}</Link>
      </div>
    </div>
  )

  const hasSensors = (facility.sensors?.length ?? 0) > 0
  const statusIcon = hasSensors
    ? <Wifi className="w-4 h-4 text-teal" />
    : <WifiOff className="w-4 h-4 text-danger" />
  const statusLabel = hasSensors ? 'ONLINE' : 'NO DATA'

  const riskLevel = deriveRiskLevel(riskScore?.overallRisk ?? 0)
  const riskScoreVal = riskScore?.overallRisk ?? 0

  return (
    <div className="min-h-screen bg-mint dark:bg-forest">
      <Navigation />
      <div className="pt-[72px]">
        {/* Header */}
        <div className="bg-white dark:bg-forest-light border-b border-sage/10 dark:border-white/10 px-[7vw] py-6">
          <Link href="/facilities" className="flex items-center gap-2 text-sage dark:text-white/50 hover:text-teal mb-4 text-sm">
            <ArrowLeft className="w-4 h-4" /> {t('facilities.backToFacilities')}
          </Link>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', facility.type === 'SCHOOL' ? 'bg-teal/10' : 'bg-amber/10')}>
                {facility.type === 'SCHOOL' ? <School className="w-6 h-6 text-teal" /> : <HeartPulse className="w-6 h-6 text-amber-dark" />}
              </div>
              <div>
                <h1 className="font-sora font-bold text-xl text-dark dark:text-white">{locale === 'hi' && facility.nameHi ? facility.nameHi : facility.name}</h1>
                <div className="flex items-center gap-4 mt-1 text-sm text-sage dark:text-white/50">
                  <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{facility.district}, {facility.block}</span>
                  <span className="flex items-center gap-1">{statusIcon}{statusLabel}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <RiskBadge level={riskLevel} score={Math.round(riskScoreVal)} size="lg" showScore />
              <button
                onClick={() => scoreMutation.mutate({ facilityId: id })}
                disabled={scoreMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-teal/10 hover:bg-teal/20 border border-teal/30 text-teal rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4" />
                {scoreMutation.isPending ? t('facilityDetail.scoring') : t('facilityDetail.scoreRisk')}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-[7vw] py-6">
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left: Sensors + Risk + Location */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glass-card p-6">
                <h2 className="font-sora font-semibold text-dark dark:text-white mb-4">{t('facilityDetail.sensorReadings')}</h2>
                {latestByType.length === 0 ? (
                  <p className="text-sm text-sage dark:text-white/50">{t('facilityDetail.noSensorData')}</p>
                ) : (
                  <div className="space-y-3">
                    {latestByType.map(s => (
                      <div key={s.id} className="bg-charcoal/80 border border-teal/20 rounded-xl p-4 flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-xs text-white/50">{sensorLabel(s.sensorType)}</p>
                          <div className="flex items-baseline gap-1">
                            <span className="font-sora font-semibold text-lg text-white">{s.value.toFixed(1)}</span>
                            <span className="text-sm text-white/50">{s.unit}</span>
                          </div>
                        </div>
                        <div className="text-xs font-mono text-white/50">
                          {new Date(s.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {riskScore && (
                <div className="bg-charcoal/80 border border-teal/20 rounded-xl p-6 space-y-4">
                  <h2 className="font-sora font-semibold text-white">{t('facilityDetail.riskAssessment')}</h2>
                  <div className="space-y-2 text-sm">
                    {([
                      [t('facilityDetail.waterRisk'),    riskScore.waterRisk],
                      [t('facilityDetail.energyRisk'),   riskScore.energyRisk],
                      [t('facilityDetail.sanitation'),    riskScore.sanitationRisk],
                      [t('facilityDetail.diseaseRisk'),  riskScore.diseaseRisk],
                    ] as [string, number][]).map(([label, val]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-white/50">{label}</span>
                        <span className="font-mono text-white">{val.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                  {riskScore.shapValues && riskScore.shapValues.length > 0 && (
                    <>
                      <hr className="border-teal/10" />
                      <div>
                        <p className="text-xs text-white/40 mb-3 font-sora">{t('facilityDetail.featureImpact')}</p>
                        <ShapExplainer shapValues={riskScore.shapValues} />
                      </div>
                    </>
                  )}
                  {scoringError && (
                    <p className="text-xs text-danger mt-2">{scoringError}</p>
                  )}
                </div>
              )}

              <div className="glass-card p-6">
                <h2 className="font-sora font-semibold text-dark dark:text-white mb-2">{t('facilityDetail.location')}</h2>
                <p className="text-sm text-sage dark:text-white/50">
                  {facility.lat.toFixed(4)}°N, {facility.lng.toFixed(4)}°E
                </p>
                <p className="text-sm text-sage dark:text-white/50 mt-1">
                  {t('facilityDetail.lastReading')}: {facility.sensors?.[0]?.timestamp
                    ? new Date(facility.sensors[0].timestamp).toLocaleString('en-IN')
                    : t('facilityDetail.noData')}
                </p>
              </div>

              {/* PV Health Card */}
              {twinData?.pvHealth && (
                <PvHealthCard pvHealth={twinData.pvHealth} />
              )}

              {/* What-if Simulator */}
              <WhatIfSimulator facilityId={id} district={facility.district} />
            </div>

            {/* Right: Forecast + History + Alert Timeline */}
            <div className="lg:col-span-7 space-y-6">
              <div className="glass-card p-6">
                <h2 className="font-sora font-semibold text-dark dark:text-white mb-4">{t('facilityDetail.forecast')}</h2>
                {facility.forecasts?.[0] ? (
                  <ForecastChart forecast={facility.forecasts[0] as any} className="h-[350px]" />
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-white/40 text-sm">
                    {t('facilityDetail.noForecast')}
                  </div>
                )}
              </div>

              {/* Sensor History Chart */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-teal" />
                    <h2 className="font-sora font-semibold text-dark dark:text-white">Sensor History (14 Days)</h2>
                  </div>
                  <CustomSelect
                    value={selectedSensor}
                    onChange={setSelectedSensor}
                    options={sensorTypeOptions}
                    placeholder="Sensor type"
                    className="w-44"
                  />
                </div>
                {sensorHistoryChartData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-sage dark:text-white/40 text-sm">
                    No history data for this sensor type
                  </div>
                ) : (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sensorHistoryChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,157,143,0.15)" />
                        <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#171c27',
                            border: '1px solid rgba(42,157,143,0.2)',
                            borderRadius: 12,
                            color: '#fff',
                          }}
                        />
                        <Line type="monotone" dataKey="value" stroke="#2A9D8F" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Alert Timeline */}
              {facility.alerts && facility.alerts.length > 0 && (
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Bell className="w-5 h-5 text-orange" />
                    <h2 className="font-sora font-semibold text-dark dark:text-white">Recent Alerts</h2>
                    <span className="ml-auto px-2 py-0.5 bg-orange/10 text-orange text-xs rounded-full font-mono">
                      {facility.alerts.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {facility.alerts.map((alert: { id: string; type: string; severity: string; message: string; status: string; triggeredAt: Date | string }) => {
                      const hoursAgo = Math.floor((Date.now() - new Date(alert.triggeredAt).getTime()) / 3_600_000)
                      const timeLabel = hoursAgo < 1 ? 'Just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`
                      return (
                        <div key={alert.id} className="flex items-start gap-3 p-3 bg-charcoal/60 border border-teal/10 rounded-xl">
                          <div className="mt-0.5">
                            <RiskBadge level={alert.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'} size="sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{alert.type.replace(/_/g, ' ')}</span>
                              <span className={cn('text-xs px-1.5 py-0.5 rounded',
                                alert.status === 'ACTIVE' ? 'bg-coral/10 text-coral' :
                                alert.status === 'ACKNOWLEDGED' ? 'bg-amber/10 text-amber' :
                                alert.status === 'RESOLVED' ? 'bg-leaf/10 text-leaf' :
                                'bg-sage/10 text-sage'
                              )}>
                                {alert.status}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 mt-1 line-clamp-2">{alert.message}</p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-white/40 whitespace-nowrap">
                            <Clock className="w-3 h-3" />
                            {timeLabel}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
