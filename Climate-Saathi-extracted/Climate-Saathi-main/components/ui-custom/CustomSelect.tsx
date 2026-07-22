'use client'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface SelectOption { value: string; label: string }
interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function CustomSelect({ value, onChange, options, placeholder = 'Select...', className, size = 'md' }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)
  const sizeClasses = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-base' }

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button type="button" onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-3 rounded-xl border transition-all',
          'bg-white dark:bg-forest-light border-sage/20 dark:border-white/10',
          'hover:border-teal/50 focus:outline-none focus:ring-2 focus:ring-teal/30',
          sizeClasses[size], isOpen && 'border-teal ring-2 ring-teal/20'
        )}>
        <span className={cn('truncate text-dark dark:text-white', !selected && 'text-sage dark:text-white/50')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-sage dark:text-white/50 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 rounded-xl border shadow-glass-lg bg-white dark:bg-forest-light border-sage/10 dark:border-white/10">
          <div className="py-1 max-h-60 overflow-auto scrollbar-thin">
            {options.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setIsOpen(false) }}
                className={cn(
                  'w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-mint-dark dark:hover:bg-forest',
                  value === opt.value ? 'bg-teal/10 dark:bg-teal/20 text-teal dark:text-teal-light' : 'text-dark dark:text-white/80'
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
