/**
 * useLeaderboards Hook
 *
 * React hooks for fetching and managing leaderboard data.
 */

import { useState, useEffect, useCallback } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export type LeaderboardType =
  | 'total_score'
  | 'challenges_completed'
  | 'quests_completed'
  | 'collectibles_found'
  | 'time_played'
  | 'hearts_facet'
  | 'hearts_total'
  | 'achievements'
  | 'custom'

export type LeaderboardPeriod = 'all_time' | 'daily' | 'weekly' | 'monthly'

export interface LeaderboardConfig {
  id: string
  game_id: string
  name: string
  description: string | null
  leaderboard_type: LeaderboardType
  hearts_facet: string | null
  custom_metric_key: string | null
  is_enabled: boolean
  is_public: boolean
  show_rank: boolean
  show_score: boolean
  max_entries_displayed: number
  sort_ascending: boolean
  score_precision: number
  enable_all_time: boolean
  enable_daily: boolean
  enable_weekly: boolean
  enable_monthly: boolean
  created_at: string
  updated_at: string
}

export interface LeaderboardEntry {
  rank: number
  player_id: string
  player_name: string | null
  player_avatar_url: string | null
  score: number
  games_played: number
  best_score: number
  last_played_at: string | null
  rank_change: number | null
  extra_data: Record<string, any> | null
}

export interface Leaderboard {
  leaderboard_id: string
  name: string
  leaderboard_type: LeaderboardType
  period: LeaderboardPeriod
  total_players: number
  entries: LeaderboardEntry[]
  last_updated: string
  player_entry: LeaderboardEntry | null
}

export interface ScoreUpdate {
  leaderboard_id: string
  player_id: string
  new_score: number
  previous_score: number
  new_rank: number
  previous_rank: number | null
  is_personal_best: boolean
  rank_change: number
}

export interface PlayerSummary {
  player_id: string
  player_name: string | null
  leaderboards: {
    leaderboard_id: string
    name: string
    rank: number
    score: number
    period: string
  }[]
  total_points: number
  best_rank: number
  total_leaderboards: number
}

// ═══════════════════════════════════════════════════════════════════
//  API Helpers
// ═══════════════════════════════════════════════════════════════════

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

// ═══════════════════════════════════════════════════════════════════
//  Hooks
// ═══════════════════════════════════════════════════════════════════

interface UseLeaderboardConfigsReturn {
  configs: LeaderboardConfig[]
  loading: boolean
  error: string | null
  refetch: () => void
  createLeaderboard: (
    config: Partial<LeaderboardConfig>
  ) => Promise<LeaderboardConfig>
  updateLeaderboard: (
    id: string,
    updates: Partial<LeaderboardConfig>
  ) => Promise<LeaderboardConfig>
  deleteLeaderboard: (id: string) => Promise<void>
}

export function useLeaderboardConfigs(
  gameId: string | null
): UseLeaderboardConfigsReturn {
  const [configs, setConfigs] = useState<LeaderboardConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    if (!gameId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await fetchApi<LeaderboardConfig[]>(
        `/api/leaderboards/games/${gameId}?include_disabled=true`
      )
      setConfigs(data)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch leaderboards'
      )
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const createLeaderboard = async (config: Partial<LeaderboardConfig>) => {
    const result = await fetchApi<LeaderboardConfig>(
      `/api/leaderboards/games/${gameId}`,
      { method: 'POST', body: JSON.stringify(config) }
    )
    setConfigs((prev) => [...prev, result])
    return result
  }

  const updateLeaderboard = async (
    id: string,
    updates: Partial<LeaderboardConfig>
  ) => {
    const result = await fetchApi<LeaderboardConfig>(
      `/api/leaderboards/${id}`,
      { method: 'PUT', body: JSON.stringify(updates) }
    )
    setConfigs((prev) => prev.map((c) => (c.id === id ? result : c)))
    return result
  }

  const deleteLeaderboard = async (id: string) => {
    await fetchApi(`/api/leaderboards/${id}`, { method: 'DELETE' })
    setConfigs((prev) => prev.filter((c) => c.id !== id))
  }

  return {
    configs,
    loading,
    error,
    refetch: fetchConfigs,
    createLeaderboard,
    updateLeaderboard,
    deleteLeaderboard,
  }
}

interface UseLeaderboardReturn {
  leaderboard: Leaderboard | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useLeaderboard(
  leaderboardId: string | null,
  period: LeaderboardPeriod = 'all_time',
  playerId?: string,
  limit: number = 100
): UseLeaderboardReturn {
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    if (!leaderboardId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        period,
        limit: limit.toString(),
      })
      if (playerId) params.set('player_id', playerId)

      const data = await fetchApi<Leaderboard>(
        `/api/leaderboards/${leaderboardId}?${params}`
      )
      setLeaderboard(data)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch leaderboard'
      )
    } finally {
      setLoading(false)
    }
  }, [leaderboardId, period, playerId, limit])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  return { leaderboard, loading, error, refetch: fetchLeaderboard }
}

export function useTopEntries(
  leaderboardId: string | null,
  period: LeaderboardPeriod = 'all_time',
  limit: number = 10
) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leaderboardId) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetchApi<LeaderboardEntry[]>(
      `/api/leaderboards/${leaderboardId}/top?period=${period}&limit=${limit}`
    )
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [leaderboardId, period, limit])

  return { entries, loading, error }
}

export function usePlayerRank(
  leaderboardId: string | null,
  playerId: string | null,
  period: LeaderboardPeriod = 'all_time'
) {
  const [rank, setRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leaderboardId || !playerId) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetchApi<{ rank: number }>(
      `/api/leaderboards/${leaderboardId}/player/${playerId}/rank?period=${period}`
    )
      .then((data) => setRank(data.rank))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [leaderboardId, playerId, period])

  return { rank, loading, error }
}

export function useNearbyEntries(
  leaderboardId: string | null,
  playerId: string | null,
  period: LeaderboardPeriod = 'all_time',
  above: number = 2,
  below: number = 2
) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leaderboardId || !playerId) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetchApi<LeaderboardEntry[]>(
      `/api/leaderboards/${leaderboardId}/player/${playerId}/nearby?period=${period}&above=${above}&below=${below}`
    )
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [leaderboardId, playerId, period, above, below])

  return { entries, loading, error }
}

export function usePlayerSummary(
  gameId: string | null,
  playerId: string | null
) {
  const [summary, setSummary] = useState<PlayerSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId || !playerId) {
      setLoading(false)
      return
    }

    setLoading(true)
    fetchApi<PlayerSummary>(
      `/api/leaderboards/games/${gameId}/player/${playerId}/summary`
    )
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [gameId, playerId])

  return { summary, loading, error }
}

// ═══════════════════════════════════════════════════════════════════
//  Score Submission
// ═══════════════════════════════════════════════════════════════════

export async function submitScore(
  leaderboardId: string,
  playerId: string,
  score: number,
  playerName?: string,
  extraData?: Record<string, any>
): Promise<ScoreUpdate> {
  return fetchApi<ScoreUpdate>(`/api/leaderboards/${leaderboardId}/scores`, {
    method: 'POST',
    body: JSON.stringify({
      player_id: playerId,
      player_name: playerName,
      score,
      extra_data: extraData,
    }),
  })
}

export async function incrementScore(
  leaderboardId: string,
  playerId: string,
  amount: number,
  playerName?: string
): Promise<ScoreUpdate> {
  const params = new URLSearchParams({
    player_id: playerId,
    amount: amount.toString(),
  })
  if (playerName) params.set('player_name', playerName)

  return fetchApi<ScoreUpdate>(
    `/api/leaderboards/${leaderboardId}/scores/increment?${params}`,
    { method: 'POST' }
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════════

export const LEADERBOARD_TYPE_META: Record<
  LeaderboardType,
  { icon: string; label: string; color: string }
> = {
  total_score: { icon: '🏆', label: 'Total Score', color: '#f59e0b' },
  challenges_completed: { icon: '⚡', label: 'Challenges', color: '#3b82f6' },
  quests_completed: { icon: '📖', label: 'Quests', color: '#8b5cf6' },
  collectibles_found: { icon: '💎', label: 'Collectibles', color: '#eab308' },
  time_played: { icon: '⏱️', label: 'Time Played', color: '#06b6d4' },
  hearts_facet: { icon: '❤️', label: 'HEARTS', color: '#ec4899' },
  hearts_total: { icon: '💖', label: 'Total HEARTS', color: '#ef4444' },
  achievements: { icon: '🏅', label: 'Achievements', color: '#10b981' },
  custom: { icon: '📊', label: 'Custom', color: '#6b7280' },
}

export const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  all_time: 'All Time',
  daily: 'Today',
  weekly: 'This Week',
  monthly: 'This Month',
}

export function formatRankChange(change: number | null): string {
  if (change === null || change === 0) return ''
  if (change > 0) return `↑${change}`
  return `↓${Math.abs(change)}`
}

export function formatScore(score: number, precision: number = 0): string {
  if (precision === 0) return Math.round(score).toLocaleString()
  return score.toFixed(precision)
}

export function getOrdinalSuffix(rank: number): string {
  const j = rank % 10
  const k = rank % 100
  if (j === 1 && k !== 11) return 'st'
  if (j === 2 && k !== 12) return 'nd'
  if (j === 3 && k !== 13) return 'rd'
  return 'th'
}
