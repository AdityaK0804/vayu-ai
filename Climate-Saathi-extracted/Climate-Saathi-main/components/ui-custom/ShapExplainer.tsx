'use client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'

interface ShapValue {
  featureName: string
  shapValue:   number
  rank:        number
}

interface ShapExplainerProps {
  shapValues: ShapValue[]
  className?: string
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-dark border border-teal/20 rounded-lg px-3 py-2 text-xs">
      <p className="text-white/70 mb-1">{d.payload.featureName}</p>
      <p className={d.value >= 0 ? 'text-danger font-mono' : 'text-teal font-mono'}>
        {d.value >= 0 ? '+' : ''}{d.value.toFixed(3)}
      </p>
    </div>
  )
}

export function ShapExplainer({ shapValues, className }: ShapExplainerProps) {
  if (!shapValues || shapValues.length === 0) {
    return (
      <div className={`flex items-center justify-center h-32 text-white/30 text-sm ${className ?? ''}`}>
        No SHAP data available
      </div>
    )
  }

  // Sort by absolute value descending, take top 8
  const data = [...shapValues]
    .sort((a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue))
    .slice(0, 8)
    .map(sv => ({
      featureName: sv.featureName.replace(/_/g, ' '),
      shapValue:   +sv.shapValue.toFixed(3),
    }))
    .reverse() // bottom-up on horizontal chart

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <XAxis
            type="number"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={false}
            tickFormatter={v => (v >= 0 ? `+${v}` : `${v}`)}
          />
          <YAxis
            type="category"
            dataKey="featureName"
            width={110}
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <ReferenceLine x={0} stroke="rgba(255,255,255,0.15)" />
          <Bar dataKey="shapValue" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.shapValue >= 0 ? '#ef4444' : '#2A9D8F'}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-center text-xs text-white/40">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded bg-danger/80" /> Increases risk
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-2 rounded bg-teal/80" /> Reduces risk
        </span>
      </div>
    </div>
  )
}
