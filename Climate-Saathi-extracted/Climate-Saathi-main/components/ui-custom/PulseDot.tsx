import { cn } from '@/lib/utils'

interface PulseDotProps {
  color?: 'amber' | 'teal' | 'leaf' | 'coral'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const colorMap = { amber: 'bg-amber', teal: 'bg-teal', leaf: 'bg-leaf', coral: 'bg-coral' }
const sizeMap  = { sm: 'w-2 h-2', md: 'w-3 h-3', lg: 'w-4 h-4' }

export function PulseDot({ color = 'amber', size = 'md', className }: PulseDotProps) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', colorMap[color])} />
      <span className={cn('relative inline-flex rounded-full', colorMap[color], sizeMap[size])} />
    </span>
  )
}
