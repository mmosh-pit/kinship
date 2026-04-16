/**
 * useScoresLeaderboard Hook
 *
 * Fetches leaderboard data from kinship-assets /api/v1/scores/list endpoint
 * with pagination support.
 */

import { useState, useEffect, useCallback } from 'react'

// Use kinship-assets API base URL
const ASSETS_API_BASE =
  process.env.NEXT_PUBLIC_ASSETS_API_URL || 'http://localhost:4000/api/v1'

// ═══════════════════════════════════════════════════════════════════
//  Types (matching kinship-assets score.service.ts)
// ═══════════════════════════════════════════════════════════════════

export interface ScoreLeaderboardEntry {
  rank: number
  player_id: string
  player_name: string
  total_score: number
  scene_id: string | null
  completed_challenges: string[]
  collected_coins: string[]
  updated_at: string
}

export interface ScoresListResponse {
  game_id: string
  leaderboard: ScoreLeaderboardEntry[]
  total_players: number
  pagination: {
    limit: number
    offset: number
    has_more: boolean
  }
  player_score: ScoreLeaderboardEntry | null
}

export interface UseScoresLeaderboardOptions {
  gameId: string | null
  playerId?: string
  limit?: number
  initialPage?: number
}

export interface UseScoresLeaderboardReturn {
  entries: ScoreLeaderboardEntry[]
  totalPlayers: number
  playerScore: ScoreLeaderboardEntry | null
  loading: boolean
  error: string | null
  // Pagination
  page: number
  limit: number
  hasMore: boolean
  totalPages: number
  // Actions
  setPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
  refetch: () => void
}

// ═══════════════════════════════════════════════════════════════════
//  Hook
// ═══════════════════════════════════════════════════════════════════

export function useScoresLeaderboard({
  gameId,
  playerId,
  limit = 10,
  initialPage = 1,
}: UseScoresLeaderboardOptions): UseScoresLeaderboardReturn {
  const [entries, setEntries] = useState<ScoreLeaderboardEntry[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [playerScore, setPlayerScore] = useState<ScoreLeaderboardEntry | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(initialPage)
  const [hasMore, setHasMore] = useState(false)

  const offset = (page - 1) * limit
  const totalPages = Math.ceil(totalPlayers / limit) || 1

  const fetchLeaderboard = useCallback(async () => {
    if (!gameId) {
      setLoading(false)
      setEntries([])
      setTotalPlayers(0)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        game_id: gameId,
        limit: limit.toString(),
        offset: offset.toString(),
      })

      if (playerId) {
        params.set('player_id', playerId)
      }

      const response = await fetch(`${ASSETS_API_BASE}/scores/list?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: ScoresListResponse = await response.json()

      setEntries(data.leaderboard)
      setTotalPlayers(data.total_players)
      setPlayerScore(data.player_score)
      setHasMore(data.pagination.has_more)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch leaderboard'
      )
      setEntries([])
      setTotalPlayers(0)
    } finally {
      setLoading(false)
    }
  }, [gameId, playerId, limit, offset])

  useEffect(() => {
    fetchLeaderboard()
  }, [fetchLeaderboard])

  const nextPage = useCallback(() => {
    if (hasMore) {
      setPage((p) => p + 1)
    }
  }, [hasMore])

  const prevPage = useCallback(() => {
    if (page > 1) {
      setPage((p) => p - 1)
    }
  }, [page])

  return {
    entries,
    totalPlayers,
    playerScore,
    loading,
    error,
    page,
    limit,
    hasMore,
    totalPages,
    setPage,
    nextPage,
    prevPage,
    refetch: fetchLeaderboard,
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Utility: Map to LeaderboardTable format
// ═══════════════════════════════════════════════════════════════════

import type { LeaderboardEntry } from './useLeaderboards'

/**
 * Maps ScoreLeaderboardEntry to the format expected by LeaderboardTable component
 */
export function mapToLeaderboardEntry(
  entry: ScoreLeaderboardEntry
): LeaderboardEntry {
  return {
    rank: entry.rank,
    player_id: entry.player_id,
    player_name: entry.player_name,
    player_avatar_url: null, // Not stored in scores API
    score: entry.total_score,
    games_played: entry.completed_challenges.length, // Use challenges as proxy
    best_score: entry.total_score, // Cumulative score is the "best"
    last_played_at: entry.updated_at,
    rank_change: null, // Not tracked in simple scores API
    extra_data: {
      scene_id: entry.scene_id,
      completed_challenges: entry.completed_challenges,
      collected_coins: entry.collected_coins,
    },
  }
}

/**
 * Maps an array of ScoreLeaderboardEntry to LeaderboardEntry[]
 */
export function mapToLeaderboardEntries(
  entries: ScoreLeaderboardEntry[]
): LeaderboardEntry[] {
  return entries.map(mapToLeaderboardEntry)
}
