'use client'

import { useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Sliders, RotateCcw, Play, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface WhatIfSimulatorProps {
  facilityId: string
  district?: string
  className?: string
}

const PARAMS = [
  { key: 'temperature', label: 'Temperature (°C)', min: 10, max: 50, step: 0.5, default: 30 },
  { key: 'rainfall', label: 'Rainfall (mm/day)', min: 0, max: 80, step: 1, default: 5 },
  { key: 'humidity', label: 'Humidity (%)', min: 10, max: 100, step: 1, default: 60 },
  { key: 'ghi', label: 'Solar GHI (kWh/m²)', min: 0, max: 8, step: 0.1, default: 5 },
] as const

const RISK_LABELS: Record<string, string> = {
  waterRisk: 'Water',
  energyRisk: 'Energy',
  sanitationRisk: 'Sanitation',
  diseaseRisk: 'Disease',
  overallRisk: 'Overall',
}

export function WhatIfSimulator({ facilityId, district, className }: WhatIfSimulatorProps) {
  const { t } = useTranslation()
  const [overrides, setOverrides] = useState<Record<string, number>>(
    Object.fromEntries(PARAMS.map(p => [p.key, p.default]))
  )
  const [result, setResult] = useState<{
    baseline: Record<string, number>
    simulated: Record<string, number>
    deltas: Record<string, number>
  } | null>(null)

  const whatIfMutation = trpc.digitalTwin.whatIf.useMutation({
    onSuccess: (data) => setResult(data),
  })

  const handleSliderChange = useCallback((key: string, val: number) => {
    setOverrides(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleSimulate = () => {
    whatIfMutation.mutate({ facilityId, district, overrides })
  }

  const handleReset = () => {
    setOverrides(Object.fromEntries(PARAMS.map(p => [p.key, p.default])))
    setResult(null)
  }

  return (
    <div className={cn('bg-charcoal/80 border border-teal/20 rounded-xl p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-teal" />
          <h2 className="font-sora font-semibold text-white">{t('facilityDetail.whatIf')}</h2>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition"
        >
          <RotateCcw className="w-3 h-3" />
          {t('facilityDetail.reset')}
        </button>
      </div>
      <p className="text-xs text-white/40 mb-5">{t('facilityDetail.whatIfDesc')}</p>

      {/* Sliders */}
      <div className="space-y-4 mb-5">
        {PARAMS.map(p => (
          <div key={p.key}>
            <div className="flex justify-between mb-1">
              <label className="text-xs text-white/60">{p.label}</label>
              <span className="text-xs font-mono text-teal">
                {overrides[p.key]?.toFixed(p.step < 1 ? 1 : 0)}
              </span>
            </div>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={overrides[p.key] ?? p.default}
              onChange={e => handleSliderChange(p.key, parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                         bg-white/10 accent-teal
                         [&::-webkit-slider-thumb]:appearance-none
                         [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                         [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal
                         [&::-webkit-slider-thumb]:shadow-md"
            />
            <div className="flex justify-between text-[10px] text-white/20 mt-0.5">
              <span>{p.min}</span>
              <span>{p.max}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Simulate button */}
      <button
        onClick={handleSimulate}
        disabled={whatIfMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                   bg-gradient-to-r from-teal to-teal/80 hover:from-teal/90 hover:to-teal/70
                   text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Play className="w-4 h-4" />
        {whatIfMutation.isPending ? t('facilityDetail.simulating') : t('facilityDetail.simulate')}
      </button>

      {/* Results */}
      {result && (
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-4 gap-1 text-[10px] text-white/40 font-medium uppercase tracking-wider px-1">
            <span>Risk</span>
            <span className="text-right">{t('facilityDetail.baseline')}</span>
            <span className="text-right">{t('facilityDetail.simulated')}</span>
            <span className="text-right">{t('facilityDetail.delta')}</span>
          </div>
          {Object.entries(RISK_LABELS).map(([key, label]) => {
            const base = result.baseline[key] ?? 0
            const sim = result.simulated[key] ?? 0
            const delta = result.deltas[key] ?? 0
            const isUp = delta > 0.005
            const isDown = delta < -0.005
            return (
              <div
                key={key}
                className={cn(
                  'grid grid-cols-4 gap-1 items-center py-2 px-2 rounded-lg text-sm',
                  key === 'overallRisk' ? 'bg-white/5 border border-teal/20' : 'bg-white/[0.02]'
                )}
              >
                <span className="text-white/70 text-xs">{label}</span>
                <span className="text-right font-mono text-white/50 text-xs">{(base * 100).toFixed(1)}</span>
                <span className={cn(
                  'text-right font-mono text-xs font-semibold',
                  isUp ? 'text-coral' : isDown ? 'text-leaf' : 'text-white/60'
                )}>
                  {(sim * 100).toFixed(1)}
                </span>
                <span className={cn(
                  'text-right font-mono text-xs flex items-center justify-end gap-0.5',
                  isUp ? 'text-coral' : isDown ? 'text-leaf' : 'text-white/30'
                )}>
                  {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
