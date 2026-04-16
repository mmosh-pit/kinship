'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import {
  usePlatforms,
  useGames,
  createPlatform as apiCreatePlatform,
  createGame as apiCreateGame,
} from '@/hooks/useApi'
import type {
  Platform,
  Game,
  CreatePlatformPayload,
  CreateGamePayload,
} from '@/lib/types'

// ─── Context Value ──────────────────────────────────────

interface StudioContextValue {
  // Platform
  platforms: Platform[]
  platformsLoading: boolean
  platformsError: string | null
  currentPlatform: Platform | null
  setPlatform: (platform: Platform) => void
  handleCreatePlatform: (payload: CreatePlatformPayload) => Promise<Platform>
  refetchPlatforms: () => void

  // Game
  games: Game[]
  gamesLoading: boolean
  gamesError: string | null
  currentGame: Game | null
  enterGame: (game: Game) => void
  exitGame: () => void
  handleCreateGame: (payload: CreateGamePayload) => Promise<Game>
  refetchGames: () => void

  // Helpers
  isInGame: boolean
}

// ─── Context ────────────────────────────────────────────

const StudioContext = createContext<StudioContextValue | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  const [currentPlatform, setCurrentPlatform] = useState<Platform | null>(null)
  const [currentGame, setCurrentGame] = useState<Game | null>(null)

  // ── Fetch Platforms ───────────────────────────────────
  const {
    data: platforms,
    loading: platformsLoading,
    error: platformsError,
    refetch: refetchPlatforms,
  } = usePlatforms()

  // Auto-select first platform when loaded
  useEffect(() => {
    if (!currentPlatform && platforms && platforms.length > 0) {
      setCurrentPlatform(platforms[0])
    }
  }, [platforms, currentPlatform])

  // If current platform was deleted, reset
  useEffect(() => {
    if (
      currentPlatform &&
      platforms &&
      !platforms.find((p) => p.id === currentPlatform.id)
    ) {
      setCurrentPlatform(platforms[0] || null)
      setCurrentGame(null)
    }
  }, [platforms, currentPlatform])

  // ── Fetch Games (for current platform) ────────────────
  const {
    data: gamesResponse,
    loading: gamesLoading,
    error: gamesError,
    refetch: refetchGames,
  } = useGames(currentPlatform?.id || null)

  const games = gamesResponse?.data || []

  // If current game was deleted or platform changed, reset game
  useEffect(() => {
    if (currentGame && !games.find((g) => g.id === currentGame.id)) {
      setCurrentGame(null)
    }
  }, [games, currentGame])

  // ── Platform Actions ──────────────────────────────────

  const setPlatform = useCallback((platform: Platform) => {
    setCurrentPlatform(platform)
    setCurrentGame(null) // exit game when switching platform
  }, [])

  const handleCreatePlatform = useCallback(
    async (payload: CreatePlatformPayload): Promise<Platform> => {
      const newPlatform = await apiCreatePlatform(payload)
      refetchPlatforms()
      setCurrentPlatform(newPlatform)
      setCurrentGame(null)
      return newPlatform
    },
    [refetchPlatforms]
  )

  // ── Game Actions ──────────────────────────────────────

  const enterGame = useCallback((game: Game) => {
    setCurrentGame(game)
  }, [])

  const exitGame = useCallback(() => {
    setCurrentGame(null)
  }, [])

  const handleCreateGame = useCallback(
    async (payload: CreateGamePayload): Promise<Game> => {
      const newGame = await apiCreateGame(payload)
      refetchGames()
      setCurrentGame(newGame)
      return newGame
    },
    [refetchGames]
  )

  return (
    <StudioContext.Provider
      value={{
        platforms: platforms || [],
        platformsLoading,
        platformsError,
        currentPlatform,
        setPlatform,
        handleCreatePlatform,
        refetchPlatforms,

        games,
        gamesLoading,
        gamesError,
        currentGame,
        enterGame,
        exitGame,
        handleCreateGame,
        refetchGames,

        isInGame: currentGame !== null,
      }}
    >
      {children}
    </StudioContext.Provider>
  )
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}

// Re-export types for convenience
export type { Platform, Game } from '@/lib/types'
