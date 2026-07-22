'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { trpc } from '@/lib/trpc'

export function useRealtimeAlerts() {
  const utils = trpc.useUtils()

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        () => {
          utils.alerts.list.invalidate()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [utils])
}
