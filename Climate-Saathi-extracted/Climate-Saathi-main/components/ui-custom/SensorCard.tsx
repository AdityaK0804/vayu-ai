import type { Sensor } from '@/types'
import { cn } from '@/lib/utils'
import { Wind, Thermometer, Droplets, Waves, Zap } from 'lucide-react'

const sensorIcons = { AIR_QUALITY: Wind, TEMPERATURE: Thermometer, HUMIDITY: Droplets, WATER_LEVEL: Waves, POWER: Zap }
const statusConfig = {
  NORMAL:   'text-leaf bg-leaf/10 dark:bg-leaf/20',
  WARNING:  'text-amber-dark bg-amber/10 dark:bg-amber/20',
  CRITICAL: 'text-coral bg-coral/10 dark:bg-coral/20',
}

export function SensorCard({ sensor, className }: { sensor: Sensor; className?: string }) {
  const Icon = sensorIcons[sensor.type]
  return (
    <div className={cn('glass-card p-4 flex items-center gap-4 transition-all duration-200 hover:-translate-y-0.5', className)}>
      <div className={cn('p-3 rounded-xl', statusConfig[sensor.status])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-label text-sage dark:text-white/50 mb-0.5">{sensor.name}</p>
        <div className="flex items-baseline gap-1">
          <span className="font-sora font-semibold text-lg text-dark dark:text-white">{sensor.value}</span>
          <span className="text-sm text-sage dark:text-white/50">{sensor.unit}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={cn('text-xs font-mono font-medium px-2 py-0.5 rounded-full', statusConfig[sensor.status])}>
          {sensor.status}
        </span>
        <span className="text-xs text-sage dark:text-white/50">
          {new Date(sensor.lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
