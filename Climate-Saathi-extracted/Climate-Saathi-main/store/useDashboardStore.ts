'use client'
import { create } from 'zustand'

interface AlertFilters {
  type?: string
  severity?: string
  district?: string
  dateFrom?: Date
  dateTo?: Date
  status?: string
}

interface DashboardStore {
  selectedDistrict: string | null
  selectedFacility: string | null
  alertFilters: AlertFilters
  mapView: { center: [number, number]; zoom: number }
  setDistrict: (id: string | null) => void
  setFacility: (id: string | null) => void
  updateFilters: (f: Partial<AlertFilters>) => void
  setMapView: (v: { center: [number, number]; zoom: number }) => void
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  selectedDistrict: null,
  selectedFacility: null,
  alertFilters: {},
  mapView: { center: [81.8661, 21.2787], zoom: 7 },
  setDistrict: (id) => set({ selectedDistrict: id }),
  setFacility: (id) => set({ selectedFacility: id }),
  updateFilters: (f) => set((s) => ({ alertFilters: { ...s.alertFilters, ...f } })),
  setMapView: (v) => set({ mapView: v }),
}))
