/**
 * useAchievements Hook - React hooks for achievement data
 */

import { useState, useEffect, useCallback } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ═══════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════

export type AchievementTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'diamond'
  | 'special'
export type AchievementType =
  | 'progress'
  | 'milestone'
  | 'collection'
  | 'streak'
  | 'speed'
  | 'secret'
  | 'hearts'
  | 'custom'
export type TriggerEvent =
  | 'challenge_complete'
  | 'challenge_fail'
  | 'quest_complete'
  | 'quest_start'
  | 'scene_enter'
  | 'collectible_pickup'
  | 'npc_interact'
  | 'hearts_change'
  | 'session_start'
  | 'game_complete'
  | 'daily_login'
  | 'score_update'
  | 'custom'

export interface Achievement {
  id: string
  game_id: string
  name: string
  description: string
  hint: string | null
  icon: string
  tier: AchievementTier
  achievement_type: AchievementType
  category: string | null
  is_enabled: boolean
  is_secret: boolean
  xp_reward: number
  points_reward: number
  trigger_event: TriggerEvent
  trigger_conditions: Record<string, any> | null
  requires_progress: boolean
  progress_max: number
  progress_unit: string | null
  unlock_count: number | null
  unlock_percentage: number | null
}

export interface PlayerAchievement {
  achievement_id: string
  player_id: string
  is_unlocked: boolean
  unlocked_at: string | null
  progress_current: number
  progress_max: number
  progress_percentage: number
  achievement: Achievement
}

export interface PlayerSummary {
  player_id: string
  game_id: string
  total_achievements: number
  unlocked_count: number
  unlock_percentage: number
  total_xp_earned: number
  by_tier: Record<string, number>
  recent_unlocks: PlayerAchievement[]
  in_progress: PlayerAchievement[]
}

export interface UnlockResult {
  achievement_id: string
  player_id: string
  was_already_unlocked: boolean
  newly_unlocked: boolean
  xp_earned: number
  achievement: Achievement
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
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

// ═══════════════════════════════════════════════════════════════════
//  Hooks
// ═══════════════════════════════════════════════════════════════════

export function useAchievements(
  gameId: string | null,
  includeDisabled = false
) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAchievements = useCallback(async () => {
    if (!gameId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchApi<Achievement[]>(
        `/api/achievements/games/${gameId}?include_disabled=${includeDisabled}`
      )
      setAchievements(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [gameId, includeDisabled])

  useEffect(() => {
    fetchAchievements()
  }, [fetchAchievements])

  const createAchievement = async (data: Partial<Achievement>) => {
    const result = await fetchApi<Achievement>(
      `/api/achievements/games/${gameId}`,
      { method: 'POST', body: JSON.stringify(data) }
    )
    setAchievements((prev) => [...prev, result])
    return result
  }

  const updateAchievement = async (
    id: string,
    updates: Partial<Achievement>
  ) => {
    const result = await fetchApi<Achievement>(`/api/achievements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
    setAchievements((prev) => prev.map((a) => (a.id === id ? result : a)))
    return result
  }

  const deleteAchievement = async (id: string) => {
    await fetchApi(`/api/achievements/${id}`, { method: 'DELETE' })
    setAchievements((prev) => prev.filter((a) => a.id !== id))
  }

  const createDefaults = async () => {
    const result = await fetchApi<Achievement[]>(
      `/api/achievements/games/${gameId}/defaults`,
      { method: 'POST' }
    )
    setAchievements((prev) => [...prev, ...result])
    return result
  }

  return {
    achievements,
    loading,
    error,
    refetch: fetchAchievements,
    createAchievement,
    updateAchievement,
    deleteAchievement,
    createDefaults,
  }
}

export function usePlayerAchievements(
  gameId: string | null,
  playerId: string | null
) {
  const [achievements, setAchievements] = useState<PlayerAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId || !playerId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchApi<PlayerAchievement[]>(
      `/api/achievements/games/${gameId}/player/${playerId}`
    )
      .then(setAchievements)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [gameId, playerId])

  return { achievements, loading, error }
}

export function usePlayerSummary(
  gameId: string | null,
  playerId: string | null
) {
  const [summary, setSummary] = useState<PlayerSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gameId || !playerId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchApi<PlayerSummary>(
      `/api/achievements/games/${gameId}/player/${playerId}/summary`
    )
      .then(setSummary)
      .finally(() => setLoading(false))
  }, [gameId, playerId])

  return { summary, loading }
}

// ═══════════════════════════════════════════════════════════════════
//  Metadata
// ═══════════════════════════════════════════════════════════════════

export const TIER_META: Record<
  AchievementTier,
  { label: string; icon: string; color: string }
> = {
  bronze: { label: 'Bronze', icon: '🥉', color: '#CD7F32' },
  silver: { label: 'Silver', icon: '🥈', color: '#C0C0C0' },
  gold: { label: 'Gold', icon: '🥇', color: '#FFD700' },
  diamond: { label: 'Diamond', icon: '💎', color: '#B9F2FF' },
  special: { label: 'Special', icon: '🌟', color: '#FF69B4' },
}

export const TYPE_META: Record<
  AchievementType,
  { label: string; icon: string }
> = {
  progress: { label: 'Progress', icon: '📊' },
  milestone: { label: 'Milestone', icon: '🎯' },
  collection: { label: 'Collection', icon: '💎' },
  streak: { label: 'Streak', icon: '🔥' },
  speed: { label: 'Speed', icon: '⚡' },
  secret: { label: 'Secret', icon: '🔒' },
  hearts: { label: 'HEARTS', icon: '❤️' },
  custom: { label: 'Custom', icon: '⭐' },
}

export const TRIGGER_META: Record<
  TriggerEvent,
  { label: string; icon: string }
> = {
  challenge_complete: { label: 'Challenge Complete', icon: '✅' },
  challenge_fail: { label: 'Challenge Fail', icon: '❌' },
  quest_complete: { label: 'Quest Complete', icon: '📖' },
  quest_start: { label: 'Quest Start', icon: '🚀' },
  scene_enter: { label: 'Scene Enter', icon: '🚪' },
  collectible_pickup: { label: 'Collectible', icon: '💎' },
  npc_interact: { label: 'NPC Interact', icon: '💬' },
  hearts_change: { label: 'HEARTS Change', icon: '❤️' },
  session_start: { label: 'Session Start', icon: '▶️' },
  game_complete: { label: 'Game Complete', icon: '🏁' },
  daily_login: { label: 'Daily Login', icon: '📅' },
  score_update: { label: 'Score Update', icon: '📊' },
  custom: { label: 'Custom', icon: '⚙️' },
}
