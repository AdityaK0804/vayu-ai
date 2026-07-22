'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface MapboxDistrictMapProps {
  districtRisks: { name: string; risk: number; facilities: number }[]
  onDistrictClick?: (district: string) => void
}

function riskColor(score: number, min: number, max: number): string {
  if (score <= 0) return '#374151'
  const range = max - min || 1
  const t = Math.max(0, Math.min(1, (score - min) / range))
  const stops = [
    { pos: 0,    r: 42,  g: 157, b: 143 },
    { pos: 0.33, r: 245, g: 158, b: 11  },
    { pos: 0.66, r: 245, g: 130, b: 31  },
    { pos: 1,    r: 239, g: 68,  b: 68  },
  ]
  let lo = stops[0], hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) {
      lo = stops[i]; hi = stops[i + 1]; break
    }
  }
  const f = (t - lo.pos) / (hi.pos - lo.pos || 1)
  const r = Math.round(lo.r + (hi.r - lo.r) * f)
  const g = Math.round(lo.g + (hi.g - lo.g) * f)
  const b = Math.round(lo.b + (hi.b - lo.b) * f)
  return `rgb(${r},${g},${b})`
}

export default function MapboxDistrictMap({ districtRisks, onDistrictClick }: MapboxDistrictMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null)
  const [geojson, setGeojson] = useState<any>(null)

  // Keep callback ref fresh to avoid stale closures in Leaflet event handlers
  const onClickRef = useRef(onDistrictClick)
  useEffect(() => { onClickRef.current = onDistrictClick }, [onDistrictClick])

  useEffect(() => {
    fetch('/chhattisgarh-districts.geojson')
      .then(r => r.json())
      .then(setGeojson)
      .catch(() => {})
  }, [])

  const riskByDistrict = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of districtRisks) map[d.name.toUpperCase()] = d.risk
    return map
  }, [districtRisks])

  const { riskMin, riskMax } = useMemo(() => {
    const vals = districtRisks.map(d => d.risk).filter(r => r > 0)
    if (vals.length === 0) return { riskMin: 0, riskMax: 100 }
    return { riskMin: Math.min(...vals), riskMax: Math.max(...vals) }
  }, [districtRisks])

  const getRisk = useCallback(
    (name: string) => riskByDistrict[name.toUpperCase()] ?? 0,
    [riskByDistrict],
  )

  // Initialise the Leaflet map once; clean up on unmount
  useEffect(() => {
    if (!containerRef.current) return
    // Safeguard: if a previous instance is attached to this DOM node, remove it
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current, {
      center: [21.2787, 81.8661],
      zoom: 7,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])          // run once

  // (Re-)draw GeoJSON whenever the data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !geojson) return

    // Remove previous layer
    if (geojsonLayerRef.current) {
      geojsonLayerRef.current.remove()
      geojsonLayerRef.current = null
    }

    const layer = L.geoJSON(geojson, {
      style: (feature) => {
        const risk = getRisk(feature?.properties?.Dist_Name ?? '')
        return {
          fillColor: riskColor(risk, riskMin, riskMax),
          fillOpacity: 0.7,
          color: 'rgba(42,157,143,0.5)',
          weight: 1,
        }
      },
      onEachFeature: (feature, lyr) => {
        const distName: string = feature?.properties?.Dist_Name ?? 'Unknown'
        const risk = getRisk(distName)
        const dbName =
          districtRisks.find(d => d.name.toUpperCase() === distName.toUpperCase())?.name ?? distName

        // Tooltip
        lyr.bindTooltip(`${dbName}: ${risk.toFixed(1)}`, { sticky: true, className: 'leaflet-tooltip-dark' })

        lyr.on({
          mouseover: (e: L.LeafletMouseEvent) => {
            const target = e.target
            target.setStyle({ fillOpacity: 0.85, weight: 2 })
            target.bringToFront()
          },
          mouseout: (e: L.LeafletMouseEvent) => {
            e.target.setStyle({ fillOpacity: 0.65, weight: 1 })
          },
          click: () => {
            onClickRef.current?.(dbName)
          },
        })
      },
    }).addTo(map)

    geojsonLayerRef.current = layer
  }, [geojson, getRisk, riskMin, riskMax, districtRisks])

  return (
    <div className="flex-1 relative" style={{ minHeight: 400 }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', minHeight: 400, background: '#171c27' }}
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-charcoal/90 border border-teal/20 rounded-lg p-3 text-xs space-y-2">
        <span className="text-white/80 font-medium text-[10px] uppercase tracking-wider">Risk Level</span>
        <div className="flex items-center gap-1.5">
          <span className="text-white/50">{Math.round(riskMin)}</span>
          <div className="w-24 h-3 rounded-sm" style={{ background: 'linear-gradient(to right, #2A9D8F, #f59e0b, #F5821F, #ef4444)' }} />
          <span className="text-white/50">{Math.round(riskMax)}</span>
        </div>
        <div className="flex justify-between text-[10px] text-white/40 w-full" style={{ paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
          <span>Low</span>
          <span>High</span>
        </div>
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
          <span className="w-3 h-3 rounded-sm" style={{ background: '#374151' }} />
          <span className="text-white/40">No data</span>
        </div>
      </div>
    </div>
  )
}
