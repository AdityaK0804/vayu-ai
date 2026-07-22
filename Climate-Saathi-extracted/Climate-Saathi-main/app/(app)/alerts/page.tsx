'use client'
import { useState, useMemo } from 'react'
import { Navigation } from '@/components/Navigation'
import { RiskBadge } from '@/components/ui-custom/RiskBadge'
import { CustomSelect } from '@/components/ui-custom/CustomSelect'
import { trpc } from '@/lib/trpc'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation, useLanguageStore } from '@/lib/i18n'
import { Bell, Search, Download, CheckCircle2, MessageSquare, AlertCircle, Calendar, MapPin, Building2, Send, Phone } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
// Manual type to avoid TS2589 deep instantiation with Prisma+tRPC
type TrpcAlert = {
  id: string
  facilityId: string
  type: string
  severity: string
  message: string
  status: string
  confidence: number
  triggeredAt: Date | string
  resolvedAt: Date | string | null
  facility: { id: string; name: string; nameHi?: string | null; type: string; district: string; block: string; lat: number; lng: number; phone?: string | null } | null
  channels: { id: string; channel: string; recipient: string; language: string; status: string; sentAt: Date | string | null }[]
}

type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED'
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

function StatusIcon({ status }: { status: AlertStatus }) {
  if (status === 'ACTIVE')       return <AlertCircle className="w-4 h-4 text-coral" />
  if (status === 'ACKNOWLEDGED') return <MessageSquare className="w-4 h-4 text-amber" />
  return <CheckCircle2 className="w-4 h-4 text-leaf" />
}

export default function AlertsPage() {
  const [search,        setSearch]        = useState('')
  const [status,        setStatus]        = useState<AlertStatus | 'all'>('all')
  const [severity,      setSeverity]      = useState<RiskLevel | 'all'>('all')
  const [district,      setDistrict]      = useState('all')
  const [sortBy,        setSortBy]        = useState<'newest' | 'oldest'>('newest')
  const [selectedAlert, setSelectedAlert] = useState<TrpcAlert | null>(null)
  const selectAlert = (a: TrpcAlert | null) => {
    setSelectedAlert(a)
    setWhatsappPhone(a?.facility?.phone ?? '')
    setShowResolveForm(false)
  }
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [interventionForm, setInterventionForm] = useState({ actionTaken: '', outcome: '', cost: '' })
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [whatsappLang, setWhatsappLang] = useState<'ENGLISH' | 'HINDI'>('ENGLISH')
  const { t } = useTranslation()
  const locale = useLanguageStore((s) => s.locale)
  const fName = (f: TrpcAlert['facility']) => locale === 'hi' && f?.nameHi ? f.nameHi : f?.name ?? '—'

  function timeAgo(date: string) {
    const h = Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000)
    if (h < 1) return t('common.justNow')
    if (h === 1) return `1${t('common.hAgo')}`
    if (h < 24) return `${h}${t('common.hAgo')}`
    return `${Math.floor(h / 24)}${t('common.dAgo')}`
  }

  function alertTypeLabel(type: string): string {
    const key = `alertType.${type}`
    const translated = t(key)
    return translated !== key ? translated : type.replace(/_/g, ' ')
  }

  const { data: alerts = [], isLoading } = trpc.alerts.list.useQuery({
    severity: severity !== 'all' ? (severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') : undefined,
    status:   status   !== 'all' ? (status   as 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED') : undefined,
    district: district !== 'all' ? district : undefined,
    limit: 100,
  })

  const filtered = (alerts as TrpcAlert[])
    .filter(a => {
      if (!search) return true
      const name = a.facility?.name ?? ''
      const nameHi = a.facility?.nameHi ?? ''
      const q = search.toLowerCase()
      return name.toLowerCase().includes(q) ||
             nameHi.toLowerCase().includes(q) ||
             a.message.toLowerCase().includes(q) ||
             a.type.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const diff = new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
      return sortBy === 'newest' ? diff : -diff
    })

  const utils = trpc.useUtils()

  const acknowledge = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => { utils.alerts.list.invalidate(); setSelectedAlert(null) },
  })
  const resolve = trpc.alerts.resolve.useMutation({
    onSuccess: () => { utils.alerts.list.invalidate(); setSelectedAlert(null) },
  })
  const resolveWithIntervention = trpc.alerts.resolveWithIntervention.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate()
      setSelectedAlert(null)
      setShowResolveForm(false)
      setInterventionForm({ actionTaken: '', outcome: '', cost: '' })
    },
  })
  const dismissAlert = trpc.alerts.dismiss.useMutation({
    onSuccess: () => { utils.alerts.list.invalidate(); setSelectedAlert(null) },
  })
  const sendWhatsApp = trpc.alerts.sendWhatsApp.useMutation({
    onSuccess: () => {
      utils.alerts.list.invalidate()
      setWhatsappPhone('')
    },
  })

  const districtNames = useMemo(() =>
    [...new Set(alerts.map((a: TrpcAlert) => a.facility?.district).filter(Boolean))].sort() as string[],
    [alerts]
  )
  const districtOpts = [
    { value: 'all', label: t('dashboard.allDistricts') },
    ...districtNames.map(n => ({ value: n, label: n }))
  ]
  const statusOpts = [
    { value: 'all', label: t('alerts.allStatus') },
    { value: 'ACTIVE', label: t('alerts.active') },
    { value: 'ACKNOWLEDGED', label: t('alerts.acknowledged') },
    { value: 'RESOLVED', label: t('alerts.resolved') },
  ]
  const sevOpts = [
    { value: 'all', label: t('alerts.allSeverity') },
    { value: 'LOW', label: t('risk.LOW') },
    { value: 'MEDIUM', label: t('risk.MEDIUM') },
    { value: 'HIGH', label: t('risk.HIGH') },
    { value: 'CRITICAL', label: t('risk.CRITICAL') },
  ]
  const sortOpts = [
    { value: 'newest', label: t('alerts.newestFirst') },
    { value: 'oldest', label: t('alerts.oldestFirst') },
  ]

  const tableHeaders = [
    t('alerts.status'), t('alerts.severity'), t('alerts.type'),
    t('alerts.facility'), t('alerts.district'), t('alerts.time'), t('alerts.channels'),
  ]

  const handleExport = () => {
    const csv = [
      ['ID', 'Facility', 'District', 'Type', 'Severity', 'Status', 'Message', 'Triggered At'].join(','),
      ...filtered.map(a => [
        a.id, a.facility?.name ?? '', a.facility?.district ?? '',
        a.type, a.severity, a.status, `"${a.message}"`,
        new Date(a.triggeredAt).toISOString()
      ].join(',')),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: `alerts-${new Date().toISOString().split('T')[0]}.csv` }).click()
  }

  return (
    <div className="min-h-screen bg-mint dark:bg-forest">
      <Navigation />
      <div className="pt-[72px]">
        <div className="bg-white dark:bg-forest-light border-b border-sage/10 dark:border-white/10 px-[7vw] py-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-heading font-sora font-bold text-dark dark:text-white mb-1">{t('alerts.title')}</h1>
              <p className="text-sage dark:text-white/50">{filtered.length} {t('common.of')} {alerts.length} {t('nav.alerts').toLowerCase()}</p>
            </div>
            <button onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2.5 bg-mint-dark dark:bg-forest hover:bg-mint-dark/80 dark:hover:bg-forest-light text-dark dark:text-white rounded-xl transition-colors text-sm font-medium">
              <Download className="w-4 h-4" /> {t('alerts.exportCSV')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage dark:text-white/50" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('alerts.searchPlaceholder')}
                className="pl-9 pr-4 py-2 rounded-lg bg-mint-dark dark:bg-forest border border-sage/20 dark:border-white/10 text-sm text-dark dark:text-white placeholder:text-sage/60 dark:placeholder:text-white/40 focus:outline-none focus:border-teal w-64" />
            </div>
            <CustomSelect value={status}   onChange={v => setStatus(v as AlertStatus | 'all')}  options={statusOpts}   placeholder={t('alerts.allStatus')}   className="w-36" />
            <CustomSelect value={severity} onChange={v => setSeverity(v as RiskLevel | 'all')}  options={sevOpts}      placeholder={t('alerts.allSeverity')} className="w-40" />
            <CustomSelect value={district} onChange={setDistrict}                                options={districtOpts} placeholder={t('dashboard.allDistricts')} className="w-40" />
            <CustomSelect value={sortBy}   onChange={v => setSortBy(v as 'newest' | 'oldest')}  options={sortOpts}     placeholder="Sort by"      className="w-36" />
          </div>
        </div>

        <div className="px-[7vw] py-6">
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              {/* Desktop Table */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="bg-mint-dark/50 dark:bg-forest/50 border-b border-sage/10 dark:border-white/10">
                    {tableHeaders.map(h => (
                      <th key={h} className="px-4 py-3 text-left text-label text-sage dark:text-white/50 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-4 py-8"><Skeleton className="h-8 w-full" /></td></tr>
                  ) : filtered.map(a => (
                    <tr key={a.id} onClick={() => selectAlert(a)}
                      className="border-b border-sage/10 dark:border-white/10 hover:bg-mint-dark/30 dark:hover:bg-forest/30 cursor-pointer transition-colors">
                      <td className="px-4 py-4"><div className="flex items-center gap-2"><StatusIcon status={a.status as AlertStatus} /><span className="text-sm text-dark dark:text-white">{a.status}</span></div></td>
                      <td className="px-4 py-4"><RiskBadge level={a.severity as RiskLevel} size="sm" /></td>
                      <td className="px-4 py-4"><span className="text-sm text-dark dark:text-white font-medium">{alertTypeLabel(a.type)}</span></td>
                      <td className="px-4 py-4"><span className="text-sm text-sage dark:text-white/50">{fName(a.facility)}</span></td>
                      <td className="px-4 py-4"><span className="text-sm text-sage dark:text-white/50">{a.facility?.district ?? '—'}</span></td>
                      <td className="px-4 py-4"><span className="text-sm font-mono text-sage dark:text-white/50">{timeAgo(a.triggeredAt.toString())}</span></td>
                      <td className="px-4 py-4"><div className="flex items-center gap-1">{a.channels.map(c => (
                        <span key={c.id} className="px-2 py-0.5 bg-mint-dark dark:bg-forest text-sage dark:text-white/50 text-xs rounded font-mono">{c.channel}</span>
                      ))}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Mobile Card View */}
              <div className="md:hidden flex flex-col divide-y divide-sage/10 dark:divide-white/10">
                {isLoading ? (
                  <div className="p-4"><Skeleton className="h-24 w-full" /></div>
                ) : filtered.map(a => (
                  <div key={a.id} onClick={() => selectAlert(a)}
                    className="p-4 hover:bg-mint-dark/30 dark:hover:bg-forest/30 cursor-pointer transition-colors space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={a.status as AlertStatus} />
                        <span className="text-sm font-medium text-dark dark:text-white">{alertTypeLabel(a.type)}</span>
                      </div>
                      <span className="text-xs font-mono text-sage dark:text-white/50">{timeAgo(a.triggeredAt.toString())}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge level={a.severity as RiskLevel} size="sm" />
                      <span className="text-xs px-2 py-0.5 rounded bg-sage/10 text-sage dark:text-white/50">{a.status}</span>
                    </div>
                    <div className="text-sm text-sage dark:text-white/50">
                      <div className="flex justify-between items-center">
                        <span>{fName(a.facility)}</span>
                        <span className="text-xs">{a.facility?.district ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-16">
                <Bell className="w-16 h-16 text-sage/30 mx-auto mb-4" />
                <h3 className="font-sora font-semibold text-dark dark:text-white mb-2">{t('alerts.noAlerts')}</h3>
                <p className="text-sage dark:text-white/50">{t('alerts.adjustFilters')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-white dark:bg-forest-light border-l border-sage/10 dark:border-white/10 p-0">
          {selectedAlert && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-sage/10 dark:border-white/10">
                <SheetHeader className="p-0">
                  <SheetTitle className="flex items-center gap-3 text-dark dark:text-white">
                    <RiskBadge level={selectedAlert.severity as RiskLevel} /><span className="text-lg">{alertTypeLabel(selectedAlert.type)}</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mint-dark dark:bg-forest">
                  <StatusIcon status={selectedAlert.status as AlertStatus} />
                  <span className="text-sm font-medium text-dark dark:text-white">{selectedAlert.status}</span>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Message */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-sage dark:text-white/40 mb-1.5">{t('alerts.message')}</p>
                  <p className="text-sm text-dark dark:text-white/90 leading-relaxed">{selectedAlert.message}</p>
                </div>

                {/* Facility Details */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-sage dark:text-white/40 mb-3">{t('alerts.facilityDetails')}</p>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-teal" />
                      </div>
                      <div>
                        <p className="text-xs text-sage dark:text-white/40">Facility</p>
                        <p className="text-sm font-medium text-dark dark:text-white">{fName(selectedAlert.facility)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-teal" />
                      </div>
                      <div>
                        <p className="text-xs text-sage dark:text-white/40">District</p>
                        <p className="text-sm font-medium text-dark dark:text-white">{selectedAlert.facility?.district ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 text-teal" />
                      </div>
                      <div>
                        <p className="text-xs text-sage dark:text-white/40">Triggered</p>
                        <p className="text-sm font-medium text-dark dark:text-white">{new Date(selectedAlert.triggeredAt).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confidence */}
                {selectedAlert.confidence > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-sage dark:text-white/40 mb-1.5">Confidence</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-sage/10 dark:bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-teal" style={{ width: `${selectedAlert.confidence}%` }} />
                      </div>
                      <span className="text-sm font-mono font-medium text-dark dark:text-white">{selectedAlert.confidence}%</span>
                    </div>
                  </div>
                )}

                {/* Channels */}
                {selectedAlert.channels.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-sage dark:text-white/40 mb-2">{t('alerts.sentVia')}</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedAlert.channels.map(c => (
                        <span key={c.id} className="px-3 py-1.5 bg-teal/10 text-teal text-xs rounded-lg font-mono">{c.channel}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* WhatsApp Send */}
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-sage dark:text-white/40 mb-2">Send via WhatsApp</p>
                  <div className="space-y-2">
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage dark:text-white/50" />
                      <input
                        type="tel"
                        value={whatsappPhone}
                        onChange={e => setWhatsappPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full pl-9 pr-4 py-2 rounded-lg bg-mint-dark dark:bg-forest border border-sage/20 dark:border-white/10 text-sm text-dark dark:text-white placeholder:text-sage/50 dark:placeholder:text-white/30 focus:outline-none focus:border-teal"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setWhatsappLang('ENGLISH')}
                        className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                          whatsappLang === 'ENGLISH'
                            ? 'bg-teal/10 border-teal text-teal font-semibold'
                            : 'border-sage/20 dark:border-white/10 text-sage dark:text-white/50'
                        }`}
                      >
                        English
                      </button>
                      <button
                        type="button"
                        onClick={() => setWhatsappLang('HINDI')}
                        className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                          whatsappLang === 'HINDI'
                            ? 'bg-teal/10 border-teal text-teal font-semibold'
                            : 'border-sage/20 dark:border-white/10 text-sage dark:text-white/50'
                        }`}
                      >
                        Hindi
                      </button>
                    </div>
                    <Button
                      className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white"
                      disabled={sendWhatsApp.isPending || whatsappPhone.replace(/\s+/g, '').length < 10}
                      onClick={() => sendWhatsApp.mutate({
                        alertId: selectedAlert.id,
                        phone: whatsappPhone.replace(/\s+/g, ''),
                        language: whatsappLang,
                      })}
                    >
                      {sendWhatsApp.isPending ? 'Sending...' : <>{'\u{1F4F1}'} Send WhatsApp Alert</>}
                    </Button>
                    {sendWhatsApp.isSuccess && (
                      <p className="text-xs text-leaf text-center">WhatsApp message sent successfully!</p>
                    )}
                    {sendWhatsApp.isError && (
                      <p className="text-xs text-coral text-center">{sendWhatsApp.error.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 border-t border-sage/10 dark:border-white/10 space-y-3 bg-white dark:bg-forest-light">
                {selectedAlert.status === 'ACTIVE' && !showResolveForm && (
                  <>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 border-sage/20 dark:border-white/10 text-dark dark:text-white"
                        disabled={acknowledge.isPending}
                        onClick={() => acknowledge.mutate({ id: selectedAlert.id })}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />{t('alerts.acknowledge')}
                      </Button>
                      <Button
                        className="flex-1 bg-teal hover:bg-teal/90 text-white"
                        onClick={() => setShowResolveForm(true)}
                      >
                        <Send className="w-4 h-4 mr-2" />{t('alerts.resolve')}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      className="w-full text-sage dark:text-white/40 hover:text-dark dark:hover:text-white/60 text-xs"
                      disabled={dismissAlert.isPending}
                      onClick={() => dismissAlert.mutate({ id: selectedAlert.id })}
                    >
                      Dismiss (False Positive)
                    </Button>
                  </>
                )}
                {selectedAlert.status === 'ACTIVE' && showResolveForm && (
                  <form className="space-y-3" onSubmit={e => {
                    e.preventDefault()
                    resolveWithIntervention.mutate({
                      id: selectedAlert.id,
                      actionTaken: interventionForm.actionTaken,
                      outcome: interventionForm.outcome || undefined,
                      cost: interventionForm.cost ? parseFloat(interventionForm.cost) : undefined,
                    })
                  }}>
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-sage dark:text-white/40">Log Intervention</p>
                    <div>
                      <label className="text-xs text-sage dark:text-white/50">Action Taken *</label>
                      <textarea
                        required
                        value={interventionForm.actionTaken}
                        onChange={e => setInterventionForm(p => ({ ...p, actionTaken: e.target.value }))}
                        placeholder="What action was taken to resolve this alert?"
                        rows={2}
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-mint-dark dark:bg-forest border border-sage/20 dark:border-white/10 text-sm text-dark dark:text-white placeholder:text-sage/50 dark:placeholder:text-white/30 focus:outline-none focus:border-teal"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-sage dark:text-white/50">Outcome</label>
                      <input
                        value={interventionForm.outcome}
                        onChange={e => setInterventionForm(p => ({ ...p, outcome: e.target.value }))}
                        placeholder="Result of the intervention"
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-mint-dark dark:bg-forest border border-sage/20 dark:border-white/10 text-sm text-dark dark:text-white placeholder:text-sage/50 dark:placeholder:text-white/30 focus:outline-none focus:border-teal"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-sage dark:text-white/50">Cost (INR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={interventionForm.cost}
                        onChange={e => setInterventionForm(p => ({ ...p, cost: e.target.value }))}
                        placeholder="0.00"
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-mint-dark dark:bg-forest border border-sage/20 dark:border-white/10 text-sm text-dark dark:text-white placeholder:text-sage/50 dark:placeholder:text-white/30 focus:outline-none focus:border-teal"
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" className="flex-1" onClick={() => setShowResolveForm(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" className="flex-1 bg-teal hover:bg-teal/90 text-white" disabled={resolveWithIntervention.isPending}>
                        {resolveWithIntervention.isPending ? 'Resolving...' : 'Resolve & Log'}
                      </Button>
                    </div>
                  </form>
                )}
                {selectedAlert.status === 'ACKNOWLEDGED' && (
                  <Button
                    className="w-full bg-teal hover:bg-teal/90 text-white"
                    onClick={() => setShowResolveForm(true)}
                  >
                    <Send className="w-4 h-4 mr-2" />Resolve with Intervention
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
