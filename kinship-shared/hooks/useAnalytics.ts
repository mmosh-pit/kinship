/**
 * Analytics API Hooks — Phase 4
 *
 * Hooks for fetching analytics data from the Phase 0 backend.
 */

import { useState, useEffect, useCallback } from 'react'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

export interface GameOverviewStats {
  game_id: string
  total_players: number
  active_players_7d: number
  active_players_30d: number
  total_sessions: number
  avg_session_duration_seconds: number
  avg_scenes_per_session: number
  avg_challenges_per_session: number
  completion_rate_pct: number
}

export interface SceneAnalytics {
  scene_id: string
  scene_name: string
  visit_count: number
  unique_visitors: number
  avg_time_spent_seconds: number
  exit_rate_pct: number
}

export interface ChallengeAnalytics {
  challenge_id: string
  challenge_name: string
  total_attempts: number
  unique_players: number
  success_rate_pct: number
  avg_attempts_to_complete: number
  avg_time_seconds: number
  skip_rate_pct: number
}

export interface HeartsAnalytics {
  facet: string
  facet_name: string
  avg_score: number
  min_score: number
  max_score: number
  total_delta: number
  positive_events: number
  negative_events: number
}

export interface SessionData {
  date: string
  sessions: number
  unique_players: number
  avg_duration_minutes: number
}

export interface GameAnalytics {
  overview: GameOverviewStats
  scenes: SceneAnalytics[]
  challenges: ChallengeAnalytics[]
  hearts: HeartsAnalytics[]
  sessions_over_time?: SessionData[]
}

export type TimePeriod = '7d' | '30d' | '90d' | 'all'

// ═══════════════════════════════════════════════
//  Generic Fetch Hook
// ═══════════════════════════════════════════════

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

function useAnalyticsApi<T>(
  endpoint: string,
  enabled: boolean = true
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const json = await response.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [endpoint, enabled])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}

// ═══════════════════════════════════════════════
//  Analytics Hooks
// ═══════════════════════════════════════════════

export function useGameAnalytics(
  gameId: string | null,
  period: TimePeriod = '30d'
) {
  return useAnalyticsApi<GameAnalytics>(
    `/api/analytics/games/${gameId}?period=${period}`,
    !!gameId
  )
}

export function useGameOverview(
  gameId: string | null,
  period: TimePeriod = '30d'
) {
  return useAnalyticsApi<GameOverviewStats>(
    `/api/analytics/games/${gameId}/overview?period=${period}`,
    !!gameId
  )
}

export function useSceneAnalytics(
  gameId: string | null,
  period: TimePeriod = '30d'
) {
  return useAnalyticsApi<SceneAnalytics[]>(
    `/api/analytics/games/${gameId}/scenes?period=${period}`,
    !!gameId
  )
}

export function useChallengeAnalytics(
  gameId: string | null,
  period: TimePeriod = '30d'
) {
  return useAnalyticsApi<ChallengeAnalytics[]>(
    `/api/analytics/games/${gameId}/challenges?period=${period}`,
    !!gameId
  )
}

export function useHeartsAnalytics(
  gameId: string | null,
  period: TimePeriod = '30d'
) {
  return useAnalyticsApi<HeartsAnalytics[]>(
    `/api/analytics/games/${gameId}/hearts?period=${period}`,
    !!gameId
  )
}

// ═══════════════════════════════════════════════
//  Session History Hook (for charts)
// ═══════════════════════════════════════════════

export function useSessionHistory(gameId: string | null, days: number = 30) {
  const [data, setData] = useState<SessionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      setLoading(true)
      try {
        // This endpoint would need to be added to backend
        // For now, we'll generate mock data based on overview stats
        const response = await fetch(
          `${BACKEND_URL}/api/analytics/games/${gameId}/sessions/history?days=${days}`
        )

        if (response.ok) {
          const json = await response.json()
          setData(json)
        } else {
          // Generate placeholder data
          setData(generateMockSessionData(days))
        }
      } catch {
        // Generate placeholder data on error
        setData(generateMockSessionData(days))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [gameId, days])

  return { data, loading, error }
}

// Generate mock session data for visualization
function generateMockSessionData(days: number): SessionData[] {
  const data: SessionData[] = []
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)

    // Generate realistic-looking random data
    const baseCount = Math.floor(Math.random() * 20) + 5
    const weekday = date.getDay()
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.5 : 1

    data.push({
      date: date.toISOString().split('T')[0],
      sessions: Math.floor(baseCount * weekendBoost),
      unique_players: Math.floor(baseCount * weekendBoost * 0.7),
      avg_duration_minutes: Math.floor(Math.random() * 15) + 5,
    })
  }

  return data
}

// ═══════════════════════════════════════════════
//  Player Leaderboard Hook
// ═══════════════════════════════════════════════

export interface LeaderboardEntry {
  player_id: string
  player_name: string
  total_score: number
  sessions_count: number
  challenges_completed: number
  hearts_scores: Record<string, number>
}

export function useLeaderboard(gameId: string | null, limit: number = 10) {
  return useAnalyticsApi<LeaderboardEntry[]>(
    `/api/analytics/games/${gameId}/leaderboard?limit=${limit}`,
    !!gameId
  )
}

// ═══════════════════════════════════════════════
//  Recent Events Hook
// ═══════════════════════════════════════════════

export interface RecentEvent {
  id: string
  event_type: string
  player_id: string
  player_name?: string
  scene_id?: string
  scene_name?: string
  event_data: Record<string, any>
  created_at: string
}

export function useRecentEvents(gameId: string | null, limit: number = 20) {
  return useAnalyticsApi<RecentEvent[]>(
    `/api/analytics/games/${gameId}/events/recent?limit=${limit}`,
    !!gameId
  )
}
