'use client'

import { useState, useMemo } from 'react'
import { useStudio } from '@/lib/studio-context'
import { useScenes } from '@/hooks/useApi'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'

import { useRealtimeEvents, RealtimeEvent, ActivePlayer } from '@/hooks/useRealtimeEvents'
import LiveEventFeed, { EventFilter } from '@/components/LiveEventFeed'
import ActivePlayersPanel from '@/components/ActivePlayersPanel'
import {
  ConnectionStatusIndicator,
  RealtimeStatsBar,
  RealtimeStatsCards,
  LiveActivityPulse,
  LiveHeartsChanges,
} from '@/components/RealtimeStats'

// ═══════════════════════════════════════════════════════════════════
//  Real-time Dashboard Page
// ═══════════════════════════════════════════════════════════════════

export default function RealtimeDashboardPage() {
  const { currentGame, isInGame } = useStudio()
  const gameId = currentGame?.id || null

  // Real-time connection
  const {
    status,
    activePlayers,
    events,
    stats,
    latestEvent,
    error,
    connect,
    disconnect,
    requestStats,
    clearEvents,
  } = useRealtimeEvents(gameId, {
    debug: process.env.NODE_ENV === 'development',
  })

  // Scenes for lookup
  const { data: scenes } = useScenes(gameId ?? undefined)
  const sceneList = useMemo(
    () =>
      scenes?.map((s) => ({
        id: s.id,
        name: s.scene_name || s.name || 'Untitled',
      })) || [],
    [scenes]
  )

  // Event filtering
  const [eventFilter, setEventFilter] = useState<string[]>([])
  const filteredEvents =
    eventFilter.length > 0
      ? events.filter((e: RealtimeEvent) => eventFilter.includes(e.event_type))
      : events

  // HEARTS changes from events
  const heartsChanges = useMemo(
    () =>
      events
        .filter((e: RealtimeEvent) => e.event_type === 'hearts_change')
        .map((e: RealtimeEvent) => ({
          facet: e.data?.facet || '?',
          delta: e.data?.delta || 0,
          player_id: e.player_id || '',
          player_name: e.data?.player_name,
          timestamp: e.timestamp,
        })),
    [events]
  )

  // No game selected
  if (!isInGame || !currentGame) {
    return (
      <EmptyState
        icon="📡"
        title="Select a game first"
        description="Real-time monitoring requires an active game."
        action={
          <a
            href="/games"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            View Games
          </a>
        }
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Real-time"
        subtitle={`${currentGame.icon || '📡'} ${currentGame.name}`}
        breadcrumbs={[
          { label: currentGame.name, href: '/dashboard' },
          { label: 'Real-time' },
        ]}
        action={
          <div className="flex items-center gap-3">
            <ConnectionStatusIndicator status={status} onReconnect={connect} />
            {status === 'connected' && (
              <button
                onClick={clearEvents}
                className="px-3 py-1.5 text-[10px] text-white/70 hover:text-white bg-card rounded-lg"
              >
                Clear Events
              </button>
            )}
          </div>
        }
      />

      {/* Connection Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <span className="font-semibold">Connection Error:</span> {error}
          <button
            onClick={connect}
            className="ml-2 text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="mb-6">
        <RealtimeStatsBar stats={stats} status={status} onReconnect={connect} />
      </div>

      <div className="max-w-7xl">
        {/* Stats Cards */}
        <div className="mb-6">
          <RealtimeStatsCards stats={stats} loading={status === 'connecting'} />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Event Feed - 2 columns */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-white text-sm font-bold">
                      Live Events
                    </h3>
                    <LiveActivityPulse
                      eventsPerMinute={stats?.events_per_minute || 0}
                    />
                  </div>
                  <span className="text-[10px] text-muted">
                    {filteredEvents.length} events
                  </span>
                </div>

                {/* Event Filter */}
                <div className="mb-4">
                  <EventFilter
                    selected={eventFilter}
                    onChange={setEventFilter}
                  />
                </div>

                {/* Event List */}
                <LiveEventFeed
                  events={filteredEvents}
                  maxVisible={50}
                  autoScroll={true}
                  showTimestamp={true}
                />
              </div>
            </Card>

            {/* Latest Event Highlight */}
            {latestEvent && <LatestEventCard event={latestEvent} />}
          </div>

          {/* Sidebar - 1 column */}
          <div className="space-y-4">
            {/* Active Players */}
            <Card>
              <div className="p-4">
                <h3 className="text-white text-sm font-bold mb-4">
                  Active Players
                </h3>
                <ActivePlayersPanel
                  players={activePlayers}
                  scenes={sceneList}
                />
              </div>
            </Card>

            {/* HEARTS Changes */}
            <Card>
              <div className="p-4">
                <h3 className="text-white text-sm font-bold mb-4">
                  HEARTS Activity
                </h3>
                <LiveHeartsChanges changes={heartsChanges} maxVisible={8} />
              </div>
            </Card>

            {/* Quick Stats */}
            <Card>
              <div className="p-4">
                <h3 className="text-white text-sm font-bold mb-4">
                  Session Summary
                </h3>
                <div className="space-y-2">
                  <QuickStat
                    label="Active Sessions"
                    value={activePlayers.length}
                    icon="🎮"
                  />
                  <QuickStat
                    label="Unique Scenes"
                    value={
                      new Set(
                        activePlayers
                          .map((p: ActivePlayer) => p.current_scene_id)
                          .filter(Boolean)
                      ).size
                    }
                    icon="🗺️"
                  />
                  <QuickStat
                    label="Challenge Events"
                    value={
                      events.filter((e: RealtimeEvent) =>
                        e.event_type.startsWith('challenge_')
                      ).length
                    }
                    icon="⚡"
                  />
                  <QuickStat
                    label="HEARTS Changes"
                    value={heartsChanges.length}
                    icon="❤️"
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Latest Event Card
// ═══════════════════════════════════════════════════════════════════

interface LatestEventCardProps {
  event: RealtimeEvent
}

function LatestEventCard({ event }: LatestEventCardProps) {
  const getEventInfo = () => {
    switch (event.event_type) {
      case 'challenge_complete':
        return {
          title: 'Challenge Completed! 🎉',
          color: '#10b981',
          details: `Completed in ${event.data?.attempts || '?'} attempts`,
        }
      case 'quest_complete':
        return {
          title: 'Quest Completed! 🏆',
          color: '#f59e0b',
          details: 'A player finished a quest',
        }
      case 'achievement_unlock':
        return {
          title: 'Achievement Unlocked! 🏅',
          color: '#8b5cf6',
          details: event.data?.achievement_id || 'New achievement',
        }
      default:
        return null
    }
  }

  const info = getEventInfo()
  if (!info) return null

  return (
    <Card>
      <div className="p-4 border-l-4" style={{ borderLeftColor: info.color }}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold" style={{ color: info.color }}>
              {info.title}
            </h4>
            <p className="text-xs text-white/70 mt-1">
              {event.player_id?.slice(0, 12)} • {info.details}
            </p>
          </div>
          <span className="text-2xl">
            {event.event_type === 'challenge_complete' && '✅'}
            {event.event_type === 'quest_complete' && '🏆'}
            {event.event_type === 'achievement_unlock' && '🏅'}
          </span>
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Quick Stat Row
// ═══════════════════════════════════════════════════════════════════

interface QuickStatProps {
  label: string
  value: number
  icon: string
}

function QuickStat({ label, value, icon }: QuickStatProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-card/40 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs text-white/70">{label}</span>
      </div>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  )
}
