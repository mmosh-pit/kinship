'use client'

import { useEffect, useState } from 'react'
import { RealtimeStats, ConnectionStatus } from '../hooks/useRealtimeEvents'

// ═══════════════════════════════════════════════════════════════════
//  Connection Status Indicator
// ═══════════════════════════════════════════════════════════════════

interface ConnectionStatusProps {
  status: ConnectionStatus
  onReconnect?: () => void
  showLabel?: boolean
}

export function ConnectionStatusIndicator({
  status,
  onReconnect,
  showLabel = true,
}: ConnectionStatusProps) {
  const config = {
    connecting: {
      color: '#f59e0b',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/30',
      label: 'Connecting...',
      icon: '🔄',
      animate: true,
    },
    connected: {
      color: '#10b981',
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/30',
      label: 'Live',
      icon: '🟢',
      animate: false,
    },
    disconnected: {
      color: '#6b7280',
      bg: 'bg-white/40/20',
      border: 'border-card-border',
      label: 'Disconnected',
      icon: '⚫',
      animate: false,
    },
    error: {
      color: '#ef4444',
      bg: 'bg-red-500/20',
      border: 'border-red-500/30',
      label: 'Error',
      icon: '🔴',
      animate: false,
    },
  }

  const c = config[status]

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold
        ${c.bg} ${c.border}
      `}
      style={{ color: c.color }}
    >
      <span className={c.animate ? 'animate-spin' : ''}>{c.icon}</span>
      {showLabel && <span>{c.label}</span>}
      {(status === 'disconnected' || status === 'error') && onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-1 text-accent hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Real-time Stats Bar
// ═══════════════════════════════════════════════════════════════════

interface RealtimeStatsBarProps {
  stats: RealtimeStats | null
  status: ConnectionStatus
  onReconnect?: () => void
}

export function RealtimeStatsBar({
  stats,
  status,
  onReconnect,
}: RealtimeStatsBarProps) {
  const [lastUpdate, setLastUpdate] = useState<string>('--')

  // Update relative time every second
  useEffect(() => {
    if (!stats?.last_updated) return

    const update = () => {
      const seconds = Math.floor(
        (Date.now() - new Date(stats.last_updated).getTime()) / 1000
      )
      if (seconds < 5) setLastUpdate('just now')
      else if (seconds < 60) setLastUpdate(`${seconds}s ago`)
      else setLastUpdate(`${Math.floor(seconds / 60)}m ago`)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [stats?.last_updated])

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-card/40 rounded-xl border border-card-border">
      {/* Connection status */}
      <ConnectionStatusIndicator status={status} onReconnect={onReconnect} />

      {/* Stats */}
      {stats && status === 'connected' && (
        <div className="flex items-center gap-4 text-[10px]">
          <StatPill
            icon="👥"
            value={stats.active_players}
            label="online"
            color="#10b981"
          />
          <StatPill
            icon="📊"
            value={Math.round(stats.events_per_minute)}
            label="events/min"
            color="#3b82f6"
          />
          <span className="text-white/40">Updated {lastUpdate}</span>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Stat Pill
// ═══════════════════════════════════════════════════════════════════

interface StatPillProps {
  icon: string
  value: number
  label: string
  color: string
}

function StatPill({ icon, value, label, color }: StatPillProps) {
  return (
    <div className="flex items-center gap-1">
      <span>{icon}</span>
      <span className="font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-muted">{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Real-time Stats Cards
// ═══════════════════════════════════════════════════════════════════

interface RealtimeStatsCardsProps {
  stats: RealtimeStats | null
  loading?: boolean
}

export function RealtimeStatsCards({
  stats,
  loading,
}: RealtimeStatsCardsProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-card/40 animate-pulse"
          />
        ))}
      </div>
    )
  }

  const cards = [
    {
      icon: '👥',
      value: stats.active_players,
      label: 'Active Players',
      color: '#10b981',
      subValue: 'currently online',
    },
    {
      icon: '🎮',
      value: stats.sessions_today,
      label: 'Sessions Today',
      color: '#3b82f6',
      subValue: 'started today',
    },
    {
      icon: '⚡',
      value: stats.challenges_completed_today,
      label: 'Challenges Done',
      color: '#f59e0b',
      subValue: 'completed today',
    },
    {
      icon: '📊',
      value: Math.round(stats.events_per_minute),
      label: 'Events/Min',
      color: '#8b5cf6',
      subValue: 'last 60 seconds',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className="p-3 rounded-xl border"
          style={{
            backgroundColor: `${card.color}08`,
            borderColor: `${card.color}20`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{card.icon}</span>
            <span className="text-xl font-bold" style={{ color: card.color }}>
              {card.value}
            </span>
          </div>
          <div className="text-[10px] text-white/70 font-semibold">
            {card.label}
          </div>
          <div className="text-[9px] text-white/40">{card.subValue}</div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Live Activity Pulse
// ═══════════════════════════════════════════════════════════════════

interface LivePulseProps {
  eventsPerMinute: number
}

export function LiveActivityPulse({ eventsPerMinute }: LivePulseProps) {
  // Calculate pulse intensity based on activity
  const intensity = Math.min(eventsPerMinute / 100, 1) // 0-1 scale
  const pulseSpeed = Math.max(0.5, 2 - intensity * 1.5) // 0.5s to 2s

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor: `rgba(45, 212, 191, ${0.3 + intensity * 0.7})`,
          }}
        />
        <div
          className="absolute inset-0 w-3 h-3 rounded-full animate-ping"
          style={{
            backgroundColor: '#2dd4bf',
            animationDuration: `${pulseSpeed}s`,
          }}
        />
      </div>
      <span className="text-[10px] text-white/70">
        {eventsPerMinute > 0 ? (
          <>
            <span className="text-accent font-semibold">
              {eventsPerMinute}
            </span>{' '}
            events/min
          </>
        ) : (
          'Waiting for activity...'
        )}
      </span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  HEARTS Live Changes
// ═══════════════════════════════════════════════════════════════════

interface HeartsChange {
  facet: string
  delta: number
  player_id: string
  player_name?: string
  timestamp: string
}

interface LiveHeartsChangesProps {
  changes: HeartsChange[]
  maxVisible?: number
}

export function LiveHeartsChanges({
  changes,
  maxVisible = 5,
}: LiveHeartsChangesProps) {
  const visible = changes.slice(-maxVisible)

  const getColor = (facet: string) => {
    const colors: Record<string, string> = {
      H: '#10b981',
      E: '#f59e0b',
      A: '#8b5cf6',
      R: '#ef4444',
      T: '#3b82f6',
      Si: '#ec4899',
      So: '#06b6d4',
    }
    return colors[facet] || '#6b7280'
  }

  if (visible.length === 0) {
    return (
      <div className="text-center py-4 text-muted text-xs">
        No HEARTS changes yet
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {visible.map((change, i) => {
        const color = getColor(change.facet)
        const isPositive = change.delta > 0

        return (
          <div
            key={`${change.timestamp}-${i}`}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-card/30"
          >
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {change.facet}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs text-white/70 truncate">
                {change.player_name || change.player_id.slice(0, 8)}
              </span>
            </div>
            <div
              className="text-xs font-bold"
              style={{ color: isPositive ? '#10b981' : '#ef4444' }}
            >
              {isPositive ? '+' : ''}
              {change.delta}
            </div>
          </div>
        )
      })}
    </div>
  )
}
