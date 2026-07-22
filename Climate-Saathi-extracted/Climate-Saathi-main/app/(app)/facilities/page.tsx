'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Navigation } from '@/components/Navigation'
import { RiskBadge } from '@/components/ui-custom/RiskBadge'
import { CustomSelect } from '@/components/ui-custom/CustomSelect'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { useTranslation, useLanguageStore } from '@/lib/i18n'
import { Building2, School, HeartPulse, MapPin, Search, Filter, ChevronRight, ChevronLeft, Activity, Wifi, WifiOff, AlertTriangle } from 'lucide-react'

function deriveRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 70) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 30) return 'MEDIUM'
  return 'LOW'
}

function getStatusIcon(status: string) {
  if (status === 'ONLINE')   return <Wifi className="w-4 h-4 text-leaf" />
  if (status === 'OFFLINE')  return <WifiOff className="w-4 h-4 text-coral" />
  if (status === 'DEGRADED') return <AlertTriangle className="w-4 h-4 text-amber" />
  return null
}

export default function FacilitiesPage() {
  const [searchInput,      setSearchInput]      = useState('')
  const [searchQuery,      setSearchQuery]      = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('all')
  const [selectedType,     setSelectedType]     = useState('all')
  const [selectedRisk,     setSelectedRisk]     = useState('all')
  const [page,             setPage]             = useState(1)
  const { t } = useTranslation()
  const locale = useLanguageStore((s) => s.locale)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [selectedDistrict, selectedType])

  const { data: districtsRaw } = trpc.facilities.districts.useQuery()
  const districts = (districtsRaw ?? []) as string[]

  const { data, isLoading } = trpc.facilities.list.useQuery({
    district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
    type: selectedType !== 'all' ? selectedType : undefined,
    search: searchQuery || undefined,
    page,
    limit: 50,
  })

  const facilities = (data?.items ?? []) as Array<{
    id: string; name: string; nameHi: string | null; type: string; district: string; block: string
    lat: number; lng: number; riskScores: Array<{ overallRisk: number }>; alerts: Array<{ id: string }>
  }>
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  const districtOptions = [
    { value: 'all', label: t('dashboard.allDistricts') },
    ...districts.map(n => ({ value: n, label: n }))
  ]

  const typeOptions = [
    { value: 'all',        label: t('facilities.allTypes') },
    { value: 'SCHOOL',     label: t('facilities.schools')  },
    { value: 'PHC',        label: 'PHC'                    },
    { value: 'CHC',        label: 'CHC'                    },
    { value: 'ANGANWADI',  label: 'Anganwadi'              },
  ]

  const riskOptions = [
    { value: 'all',      label: t('facilities.allRisk')   },
    { value: 'LOW',      label: t('risk.LOW')             },
    { value: 'MEDIUM',   label: t('risk.MEDIUM')          },
    { value: 'HIGH',     label: t('risk.HIGH')            },
    { value: 'CRITICAL', label: t('risk.CRITICAL')        },
  ]

  return (
    <div className="min-h-screen bg-mint dark:bg-forest">
      <Navigation />
      <div className="pt-[72px]">
        <div className="bg-white dark:bg-forest-light border-b border-sage/10 dark:border-white/10 px-[7vw] py-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-heading font-sora font-bold text-dark dark:text-white mb-1">{t('facilities.title')}</h1>
              <p className="text-sage dark:text-white/50">
                {facilities.length} {t('facilities.of')} {total.toLocaleString()} {t('dashboard.facilities')}
                {totalPages > 1 && <span> &middot; Page {page} of {totalPages}</span>}
              </p>
            </div>
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-sage dark:text-white/50" />
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                placeholder={t('facilities.searchPlaceholder')}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-mint-dark dark:bg-forest border border-sage/20 dark:border-white/10 text-dark dark:text-white placeholder:text-sage/60 dark:placeholder:text-white/40 focus:outline-none focus:border-teal transition-colors" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <div className="flex items-center gap-2 text-sage dark:text-white/50"><Filter className="w-4 h-4" /><span className="text-sm">{t('facilities.filters')}</span></div>
            <CustomSelect value={selectedDistrict} onChange={setSelectedDistrict} options={districtOptions} placeholder={t('dashboard.allDistricts')} className="w-44" />
            <CustomSelect value={selectedType}     onChange={setSelectedType}     options={typeOptions}     placeholder={t('facilities.allTypes')}     className="w-40" />
            <CustomSelect value={selectedRisk}     onChange={setSelectedRisk}     options={riskOptions}     placeholder={t('facilities.allRisk')}      className="w-44" />
          </div>
        </div>

        <div className="px-[7vw] py-6">
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {facilities.map(f => {
                const riskLevel = deriveRiskLevel(f.riskScores[0]?.overallRisk ?? 0)
                const riskScore = f.riskScores[0]?.overallRisk ?? 0
                const sensorStatus: string = f.alerts.length > 0 ? 'DEGRADED' : 'ONLINE'
                return (
                  <Link key={f.id} href={`/facilities/${f.id}`}
                    className="glass-card p-5 hover:-translate-y-1 hover:shadow-glass-lg transition-all duration-300 group">
                    <div className="flex items-start justify-between mb-4">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
                        f.type === 'SCHOOL' ? 'bg-teal/10' : 'bg-amber/10')}>
                        {f.type === 'SCHOOL'
                          ? <School className="w-5 h-5 text-teal" />
                          : <HeartPulse className="w-5 h-5 text-amber-dark" />}
                      </div>
                      <RiskBadge level={riskLevel} score={Math.round(riskScore)} size="sm" />
                    </div>
                    <h3 className="font-sora font-semibold text-dark dark:text-white mb-2 line-clamp-2 group-hover:text-teal transition-colors">{locale === 'hi' && f.nameHi ? f.nameHi : f.name}</h3>
                    {f.nameHi && locale !== 'hi' && <p className="text-sm text-sage dark:text-white/40 mb-1 line-clamp-1">{f.nameHi}</p>}
                    {locale === 'hi' && f.name !== f.nameHi && <p className="text-sm text-sage dark:text-white/40 mb-1 line-clamp-1">{f.name}</p>}
                    <div className="flex items-center gap-1.5 text-sm text-sage dark:text-white/50 mb-4"><MapPin className="w-4 h-4" />{f.district}</div>
                    <div className="flex items-center justify-between pt-4 border-t border-sage/10 dark:border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Activity className="w-4 h-4 text-sage dark:text-white/50" />
                          <span className="text-dark dark:text-white font-mono">{f.alerts.length}</span>
                          <span className="text-xs text-sage dark:text-white/50">{t('facilities.alerts')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          {getStatusIcon(sensorStatus)}
                          <span className={cn('text-xs',
                            sensorStatus === 'ONLINE'   && 'text-leaf',
                            sensorStatus === 'OFFLINE'  && 'text-coral',
                            sensorStatus === 'DEGRADED' && 'text-amber-dark')}>
                            {sensorStatus}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-sage dark:text-white/50 group-hover:text-teal group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white dark:bg-forest-light border border-sage/20 dark:border-white/10 text-dark dark:text-white disabled:opacity-40 hover:border-teal transition-colors">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="px-4 py-2 text-sm text-sage dark:text-white/50">
                {page} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white dark:bg-forest-light border border-sage/20 dark:border-white/10 text-dark dark:text-white disabled:opacity-40 hover:border-teal transition-colors">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isLoading && facilities.length === 0 && (
            <div className="text-center py-16">
              <Building2 className="w-16 h-16 text-sage/30 mx-auto mb-4" />
              <h3 className="font-sora font-semibold text-dark dark:text-white mb-2">{t('facilities.noFacilities')}</h3>
              <p className="text-sage dark:text-white/50">{t('facilities.adjustFilters')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
