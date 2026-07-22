'use client'
import { useState, useEffect } from 'react'
import { Navigation } from '@/components/Navigation'
import { useTheme } from '@/components/ThemeProvider'
import { trpc } from '@/lib/trpc'
import { useTranslation } from '@/lib/i18n'
import { TrendingUp, TrendingDown, Activity, Zap, BarChart3, Target, Thermometer, CloudRain, Droplets, Sun } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
  AreaChart, Area,
} from 'recharts'

const modelPerformanceData = [
  { metric: 'Accuracy',  value: 87 },
  { metric: 'Precision', value: 84 },
  { metric: 'Recall',    value: 89 },
  { metric: 'F1 Score',  value: 86 },
]

const PIE_COLORS = ['#E76F51', '#F4A261', '#2A9D8F', '#8DC63F', '#ef4444']

export default function AnalyticsPage() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { t } = useTranslation()

  const pageBg    = d ? 'bg-forest'   : 'bg-mint'
  const headerBg  = d ? 'bg-charcoal' : 'bg-white'
  const headerBdr = d ? 'border-teal/20' : 'border-sage/10'
  const cardBg    = d ? 'bg-charcoal' : 'bg-white'
  const cardBdr   = d ? 'border-teal/20' : 'border-sage/10'
  const heading   = d ? 'text-white'  : 'text-dark'
  const subtext   = d ? 'text-white/50' : 'text-sage'
  const emptyText = d ? 'text-white/40' : 'text-sage'

  const axisTick   = { fontSize: 11, fill: d ? 'rgba(255,255,255,0.4)' : '#8b95a8' }
  const gridStroke = d ? 'rgba(42,157,143,0.15)' : 'rgba(0,0,0,0.08)'
  const tooltipStyle = {
    backgroundColor: d ? '#171c27' : '#ffffff',
    borderRadius: 12,
    border: d ? '1px solid rgba(42,157,143,0.2)' : '1px solid rgba(0,0,0,0.08)',
    color: d ? '#fff' : '#090b10',
  }

  const { data: kpis } = trpc.analytics.kpis.useQuery()
  const { data: alertsByType = [] } = trpc.analytics.alertsByType.useQuery({})
  const { data: districtRisk = [] } = trpc.analytics.districtRisk.useQuery()
  const { data: sensorHealth = [] } = trpc.analytics.sensorHealthByDay.useQuery()
  const { data: forecastData } = trpc.analytics.forecast.useQuery()

  // Climate data
  const [climateDistrict, setClimateDistrict] = useState('')
  const { data: climateSummaries = [] } = trpc.climate.districts.useQuery()
  const { data: districtNames = [] } = trpc.climate.districtNames.useQuery()

  // Auto-select first district once loaded
  useEffect(() => {
    if (districtNames.length > 0 && !climateDistrict) {
      setClimateDistrict(districtNames[0])
    }
  }, [districtNames, climateDistrict])

  const { data: yearlyTrends = [] } = trpc.climate.yearlyHistory.useQuery(
    { district: climateDistrict },
    { enabled: !!climateDistrict }
  )
  const { data: recentDaily = [] } = trpc.climate.recentDaily.useQuery(
    { district: climateDistrict, days: 60 },
    { enabled: !!climateDistrict }
  )

  // Compute climate KPIs from summaries
  const climateKpis = climateSummaries.length > 0 ? {
    avgTemp: Math.round(climateSummaries.reduce((s, d) => s + d.temperature, 0) / climateSummaries.length * 10) / 10,
    avgRainfall: Math.round(climateSummaries.reduce((s, d) => s + d.rainfall, 0) / climateSummaries.length * 100) / 100,
    avgHumidity: Math.round(climateSummaries.reduce((s, d) => s + d.humidity, 0) / climateSummaries.length * 10) / 10,
    avgGhi: Math.round(climateSummaries.reduce((s, d) => s + d.ghi, 0) / climateSummaries.length * 100) / 100,
    districts: climateSummaries.length,
  } : null

  const alertTypeChartData = alertsByType.map((item, i) => ({
    ...item,
    value: item.count,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }))

  return (
    <div className={`min-h-screen ${pageBg}`}>
      <Navigation />
      <div className="pt-[72px]">
        <div className={`${headerBg} border-b ${headerBdr} px-[7vw] py-6`}>
          <h1 className={`font-sora font-bold text-2xl ${heading} mb-1`}>{t('analytics.title')}</h1>
          <p className={subtext}>{t('analytics.subtitle')}</p>
        </div>

        <div className="px-[7vw] py-6 space-y-6">
          {/* ═══════ CLIMATE DATA SECTION ═══════ */}
          <div className={`${cardBg} border ${cardBdr} rounded-xl backdrop-blur-sm p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sun className="w-5 h-5 text-orange" />
                  <h2 className={`font-sora font-bold text-lg ${heading}`}>{t('climate.title')}</h2>
                </div>
                <p className={`text-xs ${subtext}`}>{t('climate.dataSource')}</p>
              </div>
              <select
                value={climateDistrict}
                onChange={(e) => setClimateDistrict(e.target.value)}
                className={`text-sm rounded-lg px-3 py-1.5 border ${cardBdr} ${cardBg} ${heading} focus:outline-none focus:ring-1 focus:ring-teal`}
              >
                {districtNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Climate KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              {[
                { label: t('climate.avgTemp'), icon: <Thermometer className="w-4 h-4 text-coral" />, val: climateKpis ? `${climateKpis.avgTemp}°C` : '--', sub: '2024 avg' },
                { label: t('climate.avgRainfall'), icon: <CloudRain className="w-4 h-4 text-blue-400" />, val: climateKpis ? `${climateKpis.avgRainfall} mm/day` : '--', sub: '2024 avg' },
                { label: t('climate.avgHumidity'), icon: <Droplets className="w-4 h-4 text-teal" />, val: climateKpis ? `${climateKpis.avgHumidity}%` : '--', sub: '2024 avg' },
                { label: t('climate.avgGhi'), icon: <Sun className="w-4 h-4 text-amber-500" />, val: climateKpis ? `${climateKpis.avgGhi} kWh` : '--', sub: '2024 avg' },
                { label: t('climate.districts'), icon: <BarChart3 className="w-4 h-4 text-leaf" />, val: climateKpis ? `${climateKpis.districts}` : '--', sub: 'Chhattisgarh' },
              ].map(k => (
                <div key={k.label} className={`${d ? 'bg-forest' : 'bg-mint'} rounded-lg p-3`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${subtext}`}>{k.label}</span>
                    {k.icon}
                  </div>
                  <span className={`font-sora font-bold text-lg ${heading}`}>{k.val}</span>
                  <p className={`text-xs ${subtext} mt-0.5`}>{k.sub}</p>
                </div>
              ))}
            </div>

            {/* District Climate Comparison - Horizontal bar chart */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className={`font-sora font-semibold text-sm ${heading} mb-3 flex items-center gap-2`}>
                  <Thermometer className="w-4 h-4 text-coral" />
                  {t('climate.districtComparison')} — {t('climate.temperature')}
                </h3>
                <div className="h-[350px]">
                  {climateSummaries.length === 0 ? (
                    <div className={`h-full flex items-center justify-center ${emptyText} text-sm`}>{t('climate.noData')}</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={climateSummaries} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                        <XAxis type="number" tick={axisTick} unit="°C" />
                        <YAxis type="category" dataKey="district" tick={{ fontSize: 10, fill: d ? 'rgba(255,255,255,0.4)' : '#8b95a8' }} width={100} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}°C`, 'Temperature']} />
                        <Bar dataKey="temperature" fill="#E76F51" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div>
                <h3 className={`font-sora font-semibold text-sm ${heading} mb-3 flex items-center gap-2`}>
                  <CloudRain className="w-4 h-4 text-blue-400" />
                  {t('climate.districtComparison')} — {t('climate.rainfall')}
                </h3>
                <div className="h-[350px]">
                  {climateSummaries.length === 0 ? (
                    <div className={`h-full flex items-center justify-center ${emptyText} text-sm`}>{t('climate.noData')}</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={climateSummaries} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                        <XAxis type="number" tick={axisTick} unit=" mm" />
                        <YAxis type="category" dataKey="district" tick={{ fontSize: 10, fill: d ? 'rgba(255,255,255,0.4)' : '#8b95a8' }} width={100} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} mm/day`, 'Rainfall']} />
                        <Bar dataKey="rainfall" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Yearly Trends for selected district */}
            <div className="mb-6">
              <h3 className={`font-sora font-semibold text-sm ${heading} mb-3 flex items-center gap-2`}>
                <TrendingUp className="w-4 h-4 text-teal" />
                {t('climate.yearlyTrends')} — {climateDistrict}
              </h3>
              <div className="h-[300px]">
                {yearlyTrends.length === 0 ? (
                  <div className={`h-full flex items-center justify-center ${emptyText} text-sm`}>{t('climate.noData')}</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={yearlyTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="year" tick={axisTick} />
                      <YAxis yAxisId="temp" tick={axisTick} orientation="left" />
                      <YAxis yAxisId="rain" tick={axisTick} orientation="right" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line yAxisId="temp" type="monotone" dataKey="temperature" stroke="#E76F51" strokeWidth={2} dot={false} name="Temperature (°C)" />
                      <Line yAxisId="rain" type="monotone" dataKey="rainfall" stroke="#60a5fa" strokeWidth={2} dot={false} name="Rainfall (mm/day)" />
                      <Line yAxisId="temp" type="monotone" dataKey="humidity" stroke="#2A9D8F" strokeWidth={1.5} dot={false} name="Humidity (%)" strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex justify-center gap-6 mt-2">
                <div className="flex items-center gap-2"><span className="w-3 h-0.5 bg-[#E76F51] rounded" /><span className={`text-xs ${subtext}`}>{t('climate.temperature')}</span></div>
                <div className="flex items-center gap-2"><span className="w-3 h-0.5 bg-[#60a5fa] rounded" /><span className={`text-xs ${subtext}`}>{t('climate.rainfall')}</span></div>
                <div className="flex items-center gap-2"><span className="w-3 h-0.5 bg-teal rounded" style={{ borderBottom: '1px dashed' }} /><span className={`text-xs ${subtext}`}>{t('climate.humidity')}</span></div>
              </div>
            </div>

            {/* Recent Daily Data */}
            <div>
              <h3 className={`font-sora font-semibold text-sm ${heading} mb-3 flex items-center gap-2`}>
                <Activity className="w-4 h-4 text-orange" />
                {t('climate.recentDaily')} — {climateDistrict} (last 60 days of data)
              </h3>
              <div className="h-[280px]">
                {recentDaily.length === 0 ? (
                  <div className={`h-full flex items-center justify-center ${emptyText} text-sm`}>{t('climate.noData')}</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={recentDaily}>
                      <defs>
                        <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E76F51" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#E76F51" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: d ? 'rgba(255,255,255,0.4)' : '#8b95a8' }} interval={6} />
                      <YAxis tick={axisTick} />
                      <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Date: ${l}`} />
                      <Area type="monotone" dataKey="temperature" stroke="#E76F51" strokeWidth={1.5} fill="url(#tempGrad)" name="Temperature (°C)" />
                      <Area type="monotone" dataKey="rainfall" stroke="#60a5fa" strokeWidth={1.5} fill="url(#rainGrad)" name="Rainfall (mm/day)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: t('analytics.modelAccuracy'),    icon: <Target className="w-4 h-4 text-teal" />,     val: kpis ? `${kpis.modelAccuracy}%` : '--',   change: `${kpis?.totalRiskScores ?? 0} scores`, up: true },
              { label: t('analytics.avgResponseTime'), icon: <Activity className="w-4 h-4 text-orange" />, val: kpis ? `${kpis.avgResponseHours}h` : '--',  change: `${kpis?.totalResolvedAlerts ?? 0} resolved`,  up: true },
              { label: t('analytics.sensorUptime'),     icon: <Zap className="w-4 h-4 text-teal" />,        val: kpis ? `${kpis.sensorUptime}%` : '--', change: `${kpis?.totalSensorReadings ?? 0} readings`, up: true },
              { label: t('analytics.alertResolution'),  icon: <BarChart3 className="w-4 h-4 text-orange" />,val: kpis ? `${kpis.resolutionRate}%` : '--',   change: `${kpis?.totalAlerts ?? 0} total`,   up: true },
            ].map(k => (
              <div key={k.label} className={`${cardBg} border ${cardBdr} rounded-xl backdrop-blur-sm p-5`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs ${subtext}`}>{k.label}</span>
                  {k.icon}
                </div>
                <div className="flex items-end justify-between">
                  <span className={`font-sora font-bold text-2xl ${heading}`}>{k.val}</span>
                  <span className="flex items-center text-xs text-teal">
                    {k.up ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}{k.change}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className={`${cardBg} border ${cardBdr} rounded-xl backdrop-blur-sm p-6`}>
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5 text-teal" />
                <h3 className={`font-sora font-semibold ${heading}`}>{t('analytics.districtRisk')}</h3>
              </div>
              <div className="h-[300px]">
                {districtRisk.length === 0 ? (
                  <div className={`h-full flex items-center justify-center ${emptyText} text-sm`}>{t('analytics.noRiskData')}</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={districtRisk} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={axisTick} />
                      <YAxis type="category" dataKey="name" tick={axisTick} width={80} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="risk" fill="#2A9D8F" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className={`${cardBg} border ${cardBdr} rounded-xl backdrop-blur-sm p-6`}>
              <div className="flex items-center gap-2 mb-6">
                <Target className="w-5 h-5 text-orange" />
                <h3 className={`font-sora font-semibold ${heading}`}>{t('analytics.alertTypes')}</h3>
              </div>
              <div className="h-[300px]">
                {alertTypeChartData.length === 0 ? (
                  <div className={`h-full flex items-center justify-center ${emptyText} text-sm`}>{t('analytics.noAlertData')}</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={alertTypeChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                        {alertTypeChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {alertTypeChartData.length > 0 && (
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {alertTypeChartData.map(item => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className={`text-sm ${subtext}`}>{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`${cardBg} border ${cardBdr} rounded-xl backdrop-blur-sm p-6`}>
              <div className="flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-teal" />
                <h3 className={`font-sora font-semibold ${heading}`}>{t('analytics.sensorHealth')}</h3>
              </div>
              <div className="h-[300px]">
                {sensorHealth.length === 0 ? (
                  <div className={`h-full flex items-center justify-center ${emptyText} text-sm`}>{t('analytics.noSensorData')}</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sensorHealth}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="day" tick={axisTick} />
                      <YAxis tick={axisTick} domain={[0, 100]} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="online"  stroke="#2A9D8F" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="offline" stroke="#F4A261" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-teal" />
                  <span className={`text-sm ${subtext}`}>{t('analytics.online')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange" />
                  <span className={`text-sm ${subtext}`}>{t('analytics.offline')}</span>
                </div>
              </div>
            </div>

            <div className={`${cardBg} border ${cardBdr} rounded-xl backdrop-blur-sm p-6`}>
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5 text-orange" />
                <h3 className={`font-sora font-semibold ${heading}`}>{t('analytics.modelPerformance')}</h3>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="metric" tick={axisTick} />
                    <YAxis tick={axisTick} domain={[0, 100]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="#2A9D8F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className={`${cardBg} border ${cardBdr} rounded-xl backdrop-blur-sm p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-teal" />
                <h3 className={`font-sora font-semibold ${heading}`}>{t('analytics.riskForecast')}</h3>
              </div>
              {forecastData && (
                <span className={`text-xs ${subtext}`}>
                  {forecastData.facilityName} · {forecastData.forecastType.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            {!forecastData ? (
              <div className={`h-[200px] flex items-center justify-center ${emptyText} text-sm`}>
                No forecast data available yet. Score facilities to generate forecasts.
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={(forecastData.values as number[]).map((v, i) => ({
                    day: i + 1,
                    value: typeof v === 'number' ? v : 0,
                    p10: (forecastData.p10 as number[])[i] ?? 0,
                    p90: (forecastData.p90 as number[])[i] ?? 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="day" tick={axisTick} label={{ value: 'Day', position: 'insideBottom', offset: -5, style: { fill: d ? 'rgba(255,255,255,0.4)' : '#8b95a8', fontSize: 11 } }} />
                    <YAxis tick={axisTick} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="p90" fill="rgba(42,157,143,0.08)" stroke="none" />
                    <Area type="monotone" dataKey="p10" fill="rgba(42,157,143,0.08)" stroke="none" />
                    <Area type="monotone" dataKey="value" stroke="#2A9D8F" strokeWidth={2} fill="rgba(42,157,143,0.12)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-teal rounded" />
                <span className={`text-xs ${subtext}`}>Predicted</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-teal/10" />
                <span className={`text-xs ${subtext}`}>P10–P90 range</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
