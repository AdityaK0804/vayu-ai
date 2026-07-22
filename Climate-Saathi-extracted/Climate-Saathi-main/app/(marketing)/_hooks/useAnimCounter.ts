'use client'
import { useState, useEffect, useRef } from 'react'
export function useAnimCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      obs.disconnect()
      let start = 0
      const step = target / (duration / 16)
      const t = setInterval(() => {
        start = Math.min(start + step, target)
        setCount(Math.floor(start))
        if (start >= target) clearInterval(t)
      }, 16)
    }, { threshold: 0.3 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [target, duration])
  return { count, ref }
}
