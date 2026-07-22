'use client'

import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Sun, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

interface PvHealthCardProps {
  pvHealth: {
    expected_kw: number
    actual_kw: number
    derating: number
    anomaly: boolean
    status: string
  }
  className?: string
}

export function PvHealthCard({ pvHealth, className }: PvHealthCardProps) {
  const { t } = useTranslation()
  const { expected_kw, actual_kw, derating, status } = pvHealth
  const pct = Math.round(derating * 100)

  const statusConfig = {
    NORMAL: { icon: CheckCircle2, color: 'text-leaf', bg: 'bg-leaf/10', label: 'Normal' },
    WARNING: { icon: AlertTriangle, color: 'text-amber', bg: 'bg-amber/10', label: 'Warning' },
    CRITICAL: { icon: XCircle, color: 'text-coral', bg: 'bg-coral/10', label: 'Critical' },
  }[status] ?? { icon: Sun, color: 'text-white/50', bg: 'bg-white/5', label: status }

  const StatusIcon = statusConfig.icon

  return (
    <div className={cn('bg-charcoal/80 border border-teal/20 rounded-xl p-5', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Sun className="w-5 h-5 text-amber" />
        <h3 className="font-sora font-semibold text-white text-sm">{t('facilityDetail.pvHealth')}</h3>
        <div className={cn('ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', statusConfig.bg, statusConfig.color)}>
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </div>
      </div>

      {/* Derating gauge */}
      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden mb-4">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all duration-700',
            pct >= 70 ? 'bg-leaf' : pct >= 50 ? 'bg-amber' : 'bg-coral'
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('facilityDetail.pvExpected')}</p>
          <p className="font-mono text-sm text-white mt-0.5">{expected_kw.toFixed(2)} <span className="text-white/40 text-xs">kW</span></p>
        </div>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('facilityDetail.pvActual')}</p>
          <p className="font-mono text-sm text-white mt-0.5">{actual_kw.toFixed(2)} <span className="text-white/40 text-xs">kW</span></p>
        </div>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider">{t('facilityDetail.pvDerating')}</p>
          <p className={cn('font-mono text-sm font-semibold mt-0.5', statusConfig.color)}>{pct}%</p>
        </div>
      </div>
    </div>
  )
}
