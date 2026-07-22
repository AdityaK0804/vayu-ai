'use client'
import { useTheme } from './ThemeProvider'
import { cn } from '@/lib/utils'
import { Sun, Moon } from 'lucide-react'

interface ThemeToggleProps { className?: string; variant?: 'default' | 'ghost' }

export function ThemeToggle({ className, variant = 'default' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={cn(
        'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
        variant === 'default' && 'bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 hover:scale-105',
        variant === 'ghost' && 'hover:bg-mint-dark dark:hover:bg-forest-light text-sage dark:text-white/70 hover:text-dark dark:hover:text-white',
        className
      )}
    >
      <div className="relative w-5 h-5">
        <Sun className={cn('absolute inset-0 w-5 h-5 transition-all duration-300 text-amber',
          theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')} />
        <Moon className={cn('absolute inset-0 w-5 h-5 transition-all duration-300 text-teal',
          theme === 'light' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')} />
      </div>
    </button>
  )
}
