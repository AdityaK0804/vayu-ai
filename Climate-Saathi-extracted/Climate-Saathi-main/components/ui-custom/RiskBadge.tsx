import type { RiskLevel } from '@/types'
import { cn } from '@/lib/utils'

interface RiskBadgeProps {
  level: RiskLevel
  score?: number
  size?: 'sm' | 'md' | 'lg'
  showScore?: boolean
  className?: string
}

const riskConfig = {
  LOW:      { label: 'LOW',      className: 'bg-leaf/15 text-leaf border-leaf/30',           dotColor: 'bg-leaf'      },
  MEDIUM:   { label: 'MEDIUM',   className: 'bg-amber/15 text-amber-dark border-amber/30',   dotColor: 'bg-amber'     },
  HIGH:     { label: 'HIGH',     className: 'bg-coral/15 text-coral border-coral/30',        dotColor: 'bg-coral'     },
  CRITICAL: { label: 'CRITICAL', className: 'bg-red-500/15 text-red-600 border-red-500/30',  dotColor: 'bg-red-500'   },
}

const sizeMap = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-sm', lg: 'px-4 py-1.5 text-base' }

export function RiskBadge({ level, score, size = 'md', showScore = false, className }: RiskBadgeProps) {
  const { label, className: c, dotColor } = riskConfig[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono font-medium rounded-full border', sizeMap[size], c, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
      {label}
      {showScore && score !== undefined && <span className="opacity-70">({score})</span>}
    </span>
  )
}
