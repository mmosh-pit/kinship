'use client'

import { useMemo } from 'react'

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

interface SessionData {
  date: string
  sessions: number
  unique_players: number
  avg_duration_minutes: number
}

interface HeartsData {
  facet: string
  facet_name: string
  avg_score: number
  min_score: number
  max_score: number
}

interface SceneData {
  scene_id: string
  scene_name: string
  visit_count: number
  unique_visitors: number
  avg_time_spent_seconds: number
  exit_rate_pct: number
}

interface ChallengeData {
  challenge_id: string
  challenge_name: string
  total_attempts: number
  success_rate_pct: number
  avg_attempts_to_complete: number
  skip_rate_pct: number
}

// ═══════════════════════════════════════════════
//  HEARTS Facet Colors
// ═══════════════════════════════════════════════

const HEARTS_COLORS: Record<string, string> = {
  H: '#10b981', // Harmony - emerald
  E: '#f59e0b', // Empowerment - amber
  A: '#8b5cf6', // Awareness - purple
  R: '#ef4444', // Resilience - red
  T: '#3b82f6', // Tenacity - blue
  Si: '#ec4899', // Self-insight - pink
  So: '#06b6d4', // Social - cyan
}

const HEARTS_NAMES: Record<string, string> = {
  H: 'Harmony',
  E: 'Empowerment',
  A: 'Awareness',
  R: 'Resilience',
  T: 'Tenacity',
  Si: 'Self-insight',
  So: 'Social',
}

// ═══════════════════════════════════════════════
//  Sessions Line Chart (SVG-based)
// ═══════════════════════════════════════════════

interface SessionsChartProps {
  data: SessionData[]
  height?: number
  showPlayers?: boolean
}

export function SessionsChart({
  data,
  height = 200,
  showPlayers = true,
}: SessionsChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null

    const maxSessions = Math.max(...data.map((d) => d.sessions), 1)
    const maxPlayers = Math.max(...data.map((d) => d.unique_players), 1)
    const max = Math.max(maxSessions, maxPlayers)

    const width = 100 // percentage
    const padding = { top: 20, right: 10, bottom: 30, left: 40 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const xStep = chartWidth / (data.length - 1 || 1)

    const sessionsPath = data
      .map((d, i) => {
        const x = padding.left + i * xStep
        const y = padding.top + chartHeight - (d.sessions / max) * chartHeight
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')

    const playersPath = data
      .map((d, i) => {
        const x = padding.left + i * xStep
        const y =
          padding.top + chartHeight - (d.unique_players / max) * chartHeight
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')

    // Area fill
    const sessionsArea = `${sessionsPath} L ${padding.left + (data.length - 1) * xStep} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`

    return {
      sessionsPath,
      playersPath,
      sessionsArea,
      max,
      xStep,
      padding,
      chartWidth,
      chartHeight,
    }
  }, [data, height])

  if (!data || data.length === 0 || !chartData) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No session data available
      </div>
    )
  }

  const {
    sessionsPath,
    playersPath,
    sessionsArea,
    max,
    xStep,
    padding,
    chartHeight,
  } = chartData

  return (
    <svg width="100%" height={height} className="overflow-visible">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <g key={pct}>
          <line
            x1={`${padding.left}%`}
            y1={padding.top + chartHeight * (1 - pct)}
            x2="95%"
            y2={padding.top + chartHeight * (1 - pct)}
            stroke="#374151"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          <text
            x={`${padding.left - 5}%`}
            y={padding.top + chartHeight * (1 - pct) + 4}
            fill="#6b7280"
            fontSize="10"
            textAnchor="end"
          >
            {Math.round(max * pct)}
          </text>
        </g>
      ))}

      {/* Sessions area fill */}
      <path d={sessionsArea} fill="url(#sessionsGradient)" opacity="0.3" />

      {/* Sessions line */}
      <path
        d={sessionsPath}
        fill="none"
        stroke="#2dd4bf"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Players line */}
      {showPlayers && (
        <path
          d={playersPath}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4,4"
        />
      )}

      {/* Data points */}
      {data.map((d, i) => (
        <g key={i}>
          <circle
            cx={`${padding.left + i * xStep}%`}
            cy={padding.top + chartHeight - (d.sessions / max) * chartHeight}
            r="3"
            fill="#2dd4bf"
          />
          {showPlayers && (
            <circle
              cx={`${padding.left + i * xStep}%`}
              cy={
                padding.top +
                chartHeight -
                (d.unique_players / max) * chartHeight
              }
              r="3"
              fill="#8b5cf6"
            />
          )}
        </g>
      ))}

      {/* X-axis labels (show every few days) */}
      {data
        .filter(
          (_, i) =>
            i % Math.ceil(data.length / 7) === 0 || i === data.length - 1
        )
        .map((d, i, arr) => {
          const originalIndex = data.indexOf(d)
          return (
            <text
              key={d.date}
              x={`${padding.left + originalIndex * xStep}%`}
              y={height - 8}
              fill="#6b7280"
              fontSize="9"
              textAnchor="middle"
            >
              {new Date(d.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </text>
          )
        })}

      {/* Gradient definition */}
      <defs>
        <linearGradient id="sessionsGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ═══════════════════════════════════════════════
//  HEARTS Radar Chart
// ═══════════════════════════════════════════════

interface HeartsRadarProps {
  data: HeartsData[]
  size?: number
}

export function HeartsRadarChart({ data, size = 250 }: HeartsRadarProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null

    const center = size / 2
    const radius = (size - 60) / 2
    const maxScore = 100 // Assume scores are 0-100

    const angleStep = (2 * Math.PI) / data.length
    const startAngle = -Math.PI / 2 // Start from top

    const points = data.map((d, i) => {
      const angle = startAngle + i * angleStep
      const value = d.avg_score / maxScore
      return {
        x: center + Math.cos(angle) * radius * value,
        y: center + Math.sin(angle) * radius * value,
        labelX: center + Math.cos(angle) * (radius + 25),
        labelY: center + Math.sin(angle) * (radius + 25),
        facet: d.facet,
        score: d.avg_score,
      }
    })

    const polygonPath =
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') +
      ' Z'

    // Grid circles
    const gridCircles = [0.25, 0.5, 0.75, 1].map((pct) => ({
      r: radius * pct,
      label: Math.round(maxScore * pct),
    }))

    // Grid lines (spokes)
    const spokes = data.map((_, i) => {
      const angle = startAngle + i * angleStep
      return {
        x2: center + Math.cos(angle) * radius,
        y2: center + Math.sin(angle) * radius,
      }
    })

    return { center, radius, points, polygonPath, gridCircles, spokes }
  }, [data, size])

  if (!data || data.length === 0 || !chartData) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        No HEARTS data available
      </div>
    )
  }

  const { center, radius, points, polygonPath, gridCircles, spokes } = chartData

  return (
    <svg width={size} height={size} className="overflow-visible">
      {/* Grid circles */}
      {gridCircles.map((circle, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={circle.r}
          fill="none"
          stroke="#374151"
          strokeWidth="1"
          strokeDasharray={i === gridCircles.length - 1 ? undefined : '4,4'}
        />
      ))}

      {/* Spokes */}
      {spokes.map((spoke, i) => (
        <line
          key={i}
          x1={center}
          y1={center}
          x2={spoke.x2}
          y2={spoke.y2}
          stroke="#374151"
          strokeWidth="1"
        />
      ))}

      {/* Data polygon fill */}
      <path d={polygonPath} fill="url(#heartsGradient)" opacity="0.3" />

      {/* Data polygon outline */}
      <path d={polygonPath} fill="none" stroke="#2dd4bf" strokeWidth="2" />

      {/* Data points and labels */}
      {points.map((point, i) => (
        <g key={i}>
          <circle
            cx={point.x}
            cy={point.y}
            r="5"
            fill={HEARTS_COLORS[point.facet] || '#2dd4bf'}
            stroke="#1e293b"
            strokeWidth="2"
          />
          <text
            x={point.labelX}
            y={point.labelY}
            fill={HEARTS_COLORS[point.facet] || '#9ca3af'}
            fontSize="11"
            fontWeight="bold"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {point.facet}
          </text>
          <text
            x={point.labelX}
            y={point.labelY + 12}
            fill="#9ca3af"
            fontSize="9"
            textAnchor="middle"
          >
            {Math.round(point.score)}
          </text>
        </g>
      ))}

      {/* Gradient */}
      <defs>
        <radialGradient id="heartsGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.1" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ═══════════════════════════════════════════════
//  HEARTS Bar Chart
// ═══════════════════════════════════════════════

interface HeartsBarChartProps {
  data: HeartsData[]
  maxScore?: number
}

export function HeartsBarChart({ data, maxScore = 100 }: HeartsBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted text-sm">
        No HEARTS data available
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const pct = Math.min(100, (item.avg_score / maxScore) * 100)
        const color = HEARTS_COLORS[item.facet] || '#6b7280'
        const name = item.facet_name || HEARTS_NAMES[item.facet] || item.facet

        return (
          <div key={item.facet}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {item.facet}
                </div>
                <span className="text-xs text-white/70">{name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color }}>
                  {Math.round(item.avg_score)}
                </span>
                <span className="text-[10px] text-white/40">
                  ({item.min_score} - {item.max_score})
                </span>
              </div>
            </div>
            <div className="h-2 bg-card rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Scene Analytics Table
// ═══════════════════════════════════════════════

interface SceneTableProps {
  data: SceneData[]
  onSceneClick?: (sceneId: string) => void
}

export function SceneAnalyticsTable({ data, onSceneClick }: SceneTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted text-sm">
        No scene data available
      </div>
    )
  }

  const maxVisits = Math.max(...data.map((d) => d.visit_count), 1)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-card-border">
            <th className="text-left py-2 font-semibold">Scene</th>
            <th className="text-right py-2 font-semibold">Visits</th>
            <th className="text-right py-2 font-semibold">Unique</th>
            <th className="text-right py-2 font-semibold">Avg Time</th>
            <th className="text-right py-2 font-semibold">Exit %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((scene) => {
            const visitPct = (scene.visit_count / maxVisits) * 100
            return (
              <tr
                key={scene.scene_id}
                className="border-b border-card-border/20 hover:bg-card/30 cursor-pointer"
                onClick={() => onSceneClick?.(scene.scene_id)}
              >
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-1 h-6 rounded-full"
                      style={{
                        background: `linear-gradient(to top, #2dd4bf ${visitPct}%, #374151 ${visitPct}%)`,
                      }}
                    />
                    <span className="text-white font-medium truncate max-w-[150px]">
                      {scene.scene_name}
                    </span>
                  </div>
                </td>
                <td className="text-right py-2.5 text-accent font-semibold">
                  {scene.visit_count.toLocaleString()}
                </td>
                <td className="text-right py-2.5 text-white/70">
                  {scene.unique_visitors.toLocaleString()}
                </td>
                <td className="text-right py-2.5 text-white/70">
                  {formatDuration(scene.avg_time_spent_seconds)}
                </td>
                <td className="text-right py-2.5">
                  <span
                    className={`${
                      scene.exit_rate_pct > 50
                        ? 'text-red-400'
                        : scene.exit_rate_pct > 30
                          ? 'text-accent'
                          : 'text-emerald-400'
                    }`}
                  >
                    {scene.exit_rate_pct.toFixed(1)}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Challenge Analytics Table
// ═══════════════════════════════════════════════

interface ChallengeTableProps {
  data: ChallengeData[]
  onChallengeClick?: (challengeId: string) => void
}

export function ChallengeAnalyticsTable({
  data,
  onChallengeClick,
}: ChallengeTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted text-sm">
        No challenge data available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-card-border">
            <th className="text-left py-2 font-semibold">Challenge</th>
            <th className="text-right py-2 font-semibold">Attempts</th>
            <th className="text-right py-2 font-semibold">Success</th>
            <th className="text-right py-2 font-semibold">Avg Tries</th>
            <th className="text-right py-2 font-semibold">Skip %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((ch) => (
            <tr
              key={ch.challenge_id}
              className="border-b border-card-border/20 hover:bg-card/30 cursor-pointer"
              onClick={() => onChallengeClick?.(ch.challenge_id)}
            >
              <td className="py-2.5">
                <span className="text-white font-medium truncate max-w-[150px] block">
                  {ch.challenge_name}
                </span>
              </td>
              <td className="text-right py-2.5 text-white/70">
                {ch.total_attempts.toLocaleString()}
              </td>
              <td className="text-right py-2.5">
                <span
                  className={`font-semibold ${
                    ch.success_rate_pct >= 70
                      ? 'text-emerald-400'
                      : ch.success_rate_pct >= 40
                        ? 'text-accent'
                        : 'text-red-400'
                  }`}
                >
                  {ch.success_rate_pct.toFixed(1)}%
                </span>
              </td>
              <td className="text-right py-2.5 text-white/70">
                {ch.avg_attempts_to_complete.toFixed(1)}
              </td>
              <td className="text-right py-2.5">
                <span
                  className={`${
                    ch.skip_rate_pct > 30
                      ? 'text-red-400'
                      : ch.skip_rate_pct > 15
                        ? 'text-accent'
                        : 'text-white/70'
                  }`}
                >
                  {ch.skip_rate_pct.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Stat Card
// ═══════════════════════════════════════════════

interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  icon: string
  color: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
}

export function StatCard({
  label,
  value,
  subValue,
  icon,
  color,
  trend,
  trendValue,
}: StatCardProps) {
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-muted',
  }

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  }

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        backgroundColor: `${color}08`,
        borderColor: `${color}20`,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-lg">{icon}</span>
        {trend && trendValue && (
          <span className={`text-[10px] font-semibold ${trendColors[trend]}`}>
            {trendIcons[trend]} {trendValue}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-[10px] text-muted font-semibold">{label}</div>
      {subValue && (
        <div className="text-[10px] text-white/40 mt-1">{subValue}</div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toLocaleString()
}
