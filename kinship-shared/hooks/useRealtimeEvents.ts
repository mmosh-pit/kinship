/**
 * useRealtimeEvents Hook
 *
 * Manages WebSocket connection to the Kinship real-time event stream.
 * Provides live player activity, events, and stats updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export interface ActivePlayer {
  player_id: string
  player_name: string | null
  game_id: string
  session_id: string
  current_scene_id: string | null
  joined_at: string
  last_activity: string
  hearts_scores: Record<string, number>
}

export interface RealtimeEvent {
  event_type: string
  game_id: string
  player_id: string | null
  session_id: string | null
  scene_id: string | null
  data: Record<string, any>
  timestamp: string
}

export interface RealtimeStats {
  game_id: string
  active_players: number
  sessions_today: number
  challenges_completed_today: number
  avg_session_duration_minutes: number
  events_per_minute: number
  last_updated: string
}

export interface InitialState {
  type: 'initial_state'
  game_id: string
  active_players: ActivePlayer[]
  stats: RealtimeStats
  recent_events: RealtimeEvent[]
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface UseRealtimeEventsOptions {
  /** Max events to keep in history */
  maxEvents?: number
  /** Enable auto-reconnect */
  autoReconnect?: boolean
  /** Reconnect delay in ms */
  reconnectDelay?: number
  /** Ping interval in ms */
  pingInterval?: number
  /** Debug logging */
  debug?: boolean
}

export interface UseRealtimeEventsReturn {
  /** Connection status */
  status: ConnectionStatus
  /** List of active players */
  activePlayers: ActivePlayer[]
  /** Recent events */
  events: RealtimeEvent[]
  /** Real-time stats */
  stats: RealtimeStats | null
  /** Latest event */
  latestEvent: RealtimeEvent | null
  /** Error message if any */
  error: string | null
  /** Manually connect */
  connect: () => void
  /** Manually disconnect */
  disconnect: () => void
  /** Request fresh stats */
  requestStats: () => void
  /** Request active players */
  requestPlayers: () => void
  /** Clear event history */
  clearEvents: () => void
}

// ═══════════════════════════════════════════════════════════════════
//  Default Options
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_OPTIONS: Required<UseRealtimeEventsOptions> = {
  maxEvents: 100,
  autoReconnect: true,
  reconnectDelay: 3000,
  pingInterval: 30000,
  debug: false,
}

// ═══════════════════════════════════════════════════════════════════
//  Hook
// ═══════════════════════════════════════════════════════════════════

export function useRealtimeEvents(
  gameId: string | null,
  options: UseRealtimeEventsOptions = {}
): UseRealtimeEventsReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [activePlayers, setActivePlayers] = useState<ActivePlayer[]>([])
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const [stats, setStats] = useState<RealtimeStats | null>(null)
  const [latestEvent, setLatestEvent] = useState<RealtimeEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  const log = useCallback(
    (msg: string, ...args: any[]) => {
      if (opts.debug) {
        console.log(`[Realtime] ${msg}`, ...args)
      }
    },
    [opts.debug]
  )

  // ─── Cleanup ────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  // ─── Connect ────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!gameId || !mountedRef.current) return

    cleanup()
    setStatus('connecting')
    setError(null)

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const wsUrl =
      baseUrl.replace(/^http/, 'ws') + `/api/realtime/studio/${gameId}`

    log('Connecting to', wsUrl)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        log('Connected')
        setStatus('connected')
        setError(null)

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, opts.pingInterval)
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return

        try {
          const data = JSON.parse(event.data)
          log('Received', data.type || data.event_type, data)

          // Handle different message types
          switch (data.type) {
            case 'initial_state':
              handleInitialState(data as InitialState)
              break
            case 'pong':
              // Keepalive response, ignore
              break
            case 'stats_update':
              setStats(data.stats)
              break
            case 'active_players_update':
              setActivePlayers(data.players || [])
              break
            default:
              // Regular event
              handleEvent(data as RealtimeEvent)
          }
        } catch (e) {
          log('Failed to parse message', e)
        }
      }

      ws.onclose = (event) => {
        if (!mountedRef.current) return
        log('Disconnected', event.code, event.reason)
        setStatus('disconnected')

        // Auto-reconnect
        if (opts.autoReconnect && mountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            log('Attempting reconnect...')
            connect()
          }, opts.reconnectDelay)
        }
      }

      ws.onerror = (event) => {
        if (!mountedRef.current) return
        log('WebSocket error', event)
        setStatus('error')
        setError('Connection error')
      }
    } catch (e) {
      log('Failed to create WebSocket', e)
      setStatus('error')
      setError('Failed to connect')
    }
  }, [gameId, cleanup, log, opts])

  // ─── Disconnect ─────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    cleanup()
    setStatus('disconnected')
  }, [cleanup])

  // ─── Message Handlers ───────────────────────────────────────────

  const handleInitialState = useCallback((data: InitialState) => {
    setActivePlayers(data.active_players || [])
    setStats(data.stats)
    setEvents(data.recent_events || [])
  }, [])

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      // Update latest event
      setLatestEvent(event)

      // Add to events list
      setEvents((prev) => {
        const updated = [...prev, event]
        return updated.slice(-opts.maxEvents)
      })

      // Handle specific event types
      switch (event.event_type) {
        case 'player_joined':
          setActivePlayers((prev) => {
            const existing = prev.find((p) => p.player_id === event.player_id)
            if (existing) return prev
            return [
              ...prev,
              {
                player_id: event.player_id || '',
                player_name: event.data?.player_name || null,
                game_id: event.game_id,
                session_id: event.data?.session_id || '',
                current_scene_id: null,
                joined_at: event.timestamp,
                last_activity: event.timestamp,
                hearts_scores: {},
              },
            ]
          })
          break

        case 'player_left':
          setActivePlayers((prev) =>
            prev.filter((p) => p.player_id !== event.player_id)
          )
          break

        case 'player_scene_change':
        case 'scene_enter':
          setActivePlayers((prev) =>
            prev.map((p) =>
              p.player_id === event.player_id
                ? {
                    ...p,
                    current_scene_id: event.scene_id,
                    last_activity: event.timestamp,
                  }
                : p
            )
          )
          break

        case 'hearts_change':
          setActivePlayers((prev) =>
            prev.map((p) => {
              if (p.player_id !== event.player_id) return p
              const facet = event.data?.facet
              const newValue = event.data?.new_value
              if (facet && newValue !== undefined) {
                return {
                  ...p,
                  hearts_scores: { ...p.hearts_scores, [facet]: newValue },
                  last_activity: event.timestamp,
                }
              }
              return p
            })
          )
          break
      }

      // Update stats from event if included
      if (event.data?.stats) {
        setStats(event.data.stats)
      }
    },
    [opts.maxEvents]
  )

  // ─── Request Methods ────────────────────────────────────────────

  const requestStats = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_stats' }))
    }
  }, [])

  const requestPlayers = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'request_players' }))
    }
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
    setLatestEvent(null)
  }, [])

  // ─── Effects ────────────────────────────────────────────────────

  // Connect when gameId changes
  useEffect(() => {
    mountedRef.current = true

    if (gameId) {
      connect()
    }

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [gameId])

  return {
    status,
    activePlayers,
    events,
    stats,
    latestEvent,
    error,
    connect,
    disconnect,
    requestStats,
    requestPlayers,
    clearEvents,
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Event Type Helpers
// ═══════════════════════════════════════════════════════════════════

export const EVENT_TYPE_META: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  player_joined: { icon: '👋', label: 'Joined', color: '#10b981' },
  player_left: { icon: '👋', label: 'Left', color: '#6b7280' },
  scene_enter: { icon: '🚪', label: 'Scene Enter', color: '#3b82f6' },
  scene_exit: { icon: '🚪', label: 'Scene Exit', color: '#6b7280' },
  challenge_start: { icon: '⚡', label: 'Challenge Start', color: '#f59e0b' },
  challenge_complete: {
    icon: '✅',
    label: 'Challenge Complete',
    color: '#10b981',
  },
  challenge_fail: { icon: '❌', label: 'Challenge Fail', color: '#ef4444' },
  challenge_skip: { icon: '⏭️', label: 'Challenge Skip', color: '#6b7280' },
  quest_start: { icon: '📖', label: 'Quest Start', color: '#8b5cf6' },
  quest_complete: { icon: '🏆', label: 'Quest Complete', color: '#10b981' },
  hearts_change: { icon: '❤️', label: 'HEARTS', color: '#ec4899' },
  npc_interact: { icon: '💬', label: 'NPC Talk', color: '#06b6d4' },
  collectible_pickup: { icon: '💎', label: 'Collectible', color: '#eab308' },
  achievement_unlock: { icon: '🏅', label: 'Achievement', color: '#f59e0b' },
  custom: { icon: '🔧', label: 'Custom', color: '#6b7280' },
}

export function getEventMeta(eventType: string) {
  return (
    EVENT_TYPE_META[eventType] || {
      icon: '📌',
      label: eventType,
      color: '#6b7280',
    }
  )
}
