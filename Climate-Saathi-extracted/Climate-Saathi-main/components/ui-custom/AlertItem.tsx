import type { Alert } from '@/types'
import { cn } from '@/lib/utils'
import { RiskBadge } from './RiskBadge'
import { MapPin, Clock, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react'

interface AlertItemProps { alert: Alert; onClick?: () => void; className?: string }

const statusConfig = {
  ACTIVE:       { icon: AlertCircle,  className: 'text-coral'     },
  ACKNOWLEDGED: { icon: MessageSquare, className: 'text-amber'    },
  RESOLVED:     { icon: CheckCircle2, className: 'text-leaf'      },
}

function timeAgo(date: string) {
  const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000)
  if (hours < 1)  return 'Just now'
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export function AlertItem({ alert, onClick, className }: AlertItemProps) {
  const { icon: StatusIcon, className: statusCls } = statusConfig[alert.status]
  return (
    <div onClick={onClick} className={cn(
      'glass-card p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5',
      className
    )}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <RiskBadge level={alert.severity} size="sm" />
          <span className={cn('text-sm', statusCls)}>
            <StatusIcon className="w-4 h-4 inline mr-1" />{alert.status}
          </span>
        </div>
        <span className="text-xs text-sage dark:text-white/50 font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" />{timeAgo(alert.createdAt)}
        </span>
      </div>
      <h4 className="font-sora font-semibold text-dark dark:text-white mb-1">{alert.type}</h4>
      <p className="text-sm text-sage dark:text-white/60 mb-3 line-clamp-2">{alert.message}</p>
      <div className="flex items-center gap-4 text-xs text-sage dark:text-white/50">
        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{alert.facilityName}</span>
        <span>{alert.district}</span>
      </div>
      {alert.channels.length > 0 && (
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-sage/10 dark:border-white/10">
          <span className="text-xs text-sage dark:text-white/50">Sent via:</span>
          {alert.channels.map(ch => (
            <span key={ch} className="text-xs font-mono bg-mint-dark dark:bg-forest px-2 py-0.5 rounded text-dark dark:text-white/70">{ch}</span>
          ))}
        </div>
      )}
    </div>
  )
}
