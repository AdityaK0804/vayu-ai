'use client'
import districtPaths from '@/data/chhattisgarh-paths.json'

const riskData: Record<string, number> = {
  'Raipur': 62, 'Bilaspur': 45, 'Durg': 38, 'Rajnandgaon': 41, 'Surguja': 55,
  'Jashpur': 33, 'Korba': 71, 'Koriya': 29, 'Raigarh': 48, 'Janjgir-Champa': 44,
  'Mahasamund': 39, 'Dhamtari': 42, 'Uttar Bastar Kanker': 58, 'Bastar': 67,
  'Dakshin Bastar Dantewada': 78, 'Narayanpur': 63, 'Bijapur': 81, 'Sukma': 74,
  'Kondagaon': 61, 'Kabeerdham': 36, 'Mungeli': 31, 'Bemetra': 35,
  'Baloda Bazar': 43, 'Gariaband': 40, 'Balod': 37, 'Surajpur': 30, 'Balrampur': 28,
}

function getFill(score: number) {
  if (score >= 75) return 'rgba(239,68,68,0.65)'
  if (score >= 60) return 'rgba(231,111,81,0.60)'
  if (score >= 45) return 'rgba(244,162,97,0.55)'
  return 'rgba(141,198,63,0.45)'
}

function getStroke(score: number) {
  if (score >= 75) return 'rgba(239,68,68,0.85)'
  if (score >= 60) return 'rgba(231,111,81,0.75)'
  if (score >= 45) return 'rgba(244,162,97,0.75)'
  return 'rgba(141,198,63,0.65)'
}

interface MiniMapProps {
  className?: string
  showLabels?: boolean
}

export function MiniMap({ className = '', showLabels = false }: MiniMapProps) {
  return (
    <div className={`relative w-full h-full flex items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 560 640"
        className="w-full h-full"
        style={{ overflow: 'visible', maxHeight: '100%' }}
      >
        <defs>
          <radialGradient id="miniMapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2A9D8F" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#2A9D8F" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="280" cy="320" rx="260" ry="300" fill="url(#miniMapGlow)" />

        {(districtPaths as { name: string; d: string; cx: number; cy: number }[]).map((dp) => {
          const score = riskData[dp.name] ?? 35
          return (
            <g key={dp.name}>
              <path
                d={dp.d}
                fill={getFill(score)}
                stroke={getStroke(score)}
                strokeWidth={0.6}
                strokeLinejoin="round"
              />
              {showLabels && (
                <text
                  x={dp.cx}
                  y={dp.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={7}
                  fontFamily="var(--font-sora), sans-serif"
                  fill="rgba(255,255,255,0.65)"
                  className="pointer-events-none select-none"
                >
                  {dp.name.split(' ')[0]}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
