'use client'
import { cn } from '@/lib/utils'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

export type RawForecast = {
  values: unknown
  p10: unknown
  p90: unknown
  horizonDays: number
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  const date = new Date(label ?? '')
  return (
    <div className="glass-card p-3 text-sm">
      <p className="font-mono text-sage dark:text-white/50 mb-2">{date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
      <p className="font-sora font-semibold text-dark dark:text-white mb-1">Value: {payload[2]?.value ?? payload[0]?.value}</p>
      {payload[0] && payload[1] && (
        <p className="text-xs text-sage dark:text-white/50">P10–P90: {payload[1].value} – {payload[0].value}</p>
      )}
    </div>
  )
}

export function ForecastChart({ forecast, className }: { forecast: RawForecast; className?: string }) {
  const vals = Array.isArray(forecast.values) ? forecast.values : []
  const p10 = Array.isArray(forecast.p10) ? forecast.p10 : []
  const p90 = Array.isArray(forecast.p90) ? forecast.p90 : []

  const data = vals.map((v, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i) // simple 14 day horizon from today
    return {
      date: d.toISOString(),
      value: typeof v === 'number' ? Math.round(v * 10) / 10 : 0,
      p10: typeof p10[i] === 'number' ? Math.round((p10[i] as number) * 10) / 10 : 0,
      p90: typeof p90[i] === 'number' ? Math.round((p90[i] as number) * 10) / 10 : 0,
    }
  })

  // Basic threshold to illustrate "critical" — customize based on actual forecastType
  const daysToCritical = data.findIndex(d => d.value <= 20)

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  
  return (
    <div className={cn('w-full flex flex-col', className)}>
      {daysToCritical >= 0 && (
        <div className="mb-4 p-3 bg-orange/10 border border-orange/20 rounded-xl flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-orange animate-pulse shadow-[0_0_8px_rgba(244,162,97,0.8)]" />
          <p className="text-sm text-orange font-medium">Critical threshold predicted in {daysToCritical} days</p>
        </div>
      )}
      <div className="flex-1 w-full min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2A9D8F" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2A9D8F" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,157,143,0.15)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmt}
              tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: '#8b95a8' }}
              axisLine={{ stroke: 'rgba(42,157,143,0.15)' }} tickLine={false} interval={2} />
            <YAxis 
              tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: '#8b95a8' }}
              axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            
            <ReferenceLine x={data[0]?.date} stroke="#8b95a8" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopLeft", fill: "#8b95a8", fontSize: 11 }} />
            <ReferenceLine y={20} stroke="#E76F51" strokeDasharray="5 5" label={{ value: "Critical", position: "insideBottomLeft", fill: "#E76F51", fontSize: 11 }} />
            
            <Area type="monotone" dataKey="p90" stroke="none" fill="rgba(42,157,143,0.15)" />
            <Area type="monotone" dataKey="p10" stroke="none" fill="rgba(255,255,255,0.5)" />
            <Area type="monotone" dataKey="value" stroke="#2A9D8F" strokeWidth={2}
              fill="url(#valueGradient)"
              dot={{ fill: '#2A9D8F', strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, fill: '#F4A261' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-teal rounded" />
          <span className="text-xs text-sage dark:text-white/50">Predicted</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-teal/10" />
          <span className="text-xs text-sage dark:text-white/50">P10–P90 Range</span>
        </div>
      </div>
    </div>
  )
}
