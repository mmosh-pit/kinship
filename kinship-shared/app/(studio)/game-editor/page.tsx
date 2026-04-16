'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStudio } from '@/lib/studio-context'
import { useScenes, updateGame } from '@/hooks/useApi'
import { knowledgeApi, api as assetsApi } from '@/lib/api'
import type {
  EditChange,
  EditHistoryItem,
  ClarificationQuestion,
  GenerateApiResponse,
} from '@/lib/types'
import { needsClarification } from '@/lib/types'
import PageHeader from '@/components/PageHeader'
import GameTestModal from '@/components/GameTestModal'
import UndoRedoControls from '@/components/UndoRedoControls'
import VersionBadge from '@/components/VersionBadge'
import EditHistoryPanel from '@/components/EditHistoryPanel'
import ChangeDetails from '@/components/ChangeDetails'
import ChatMessage from '@/components/ChatMessage'
import { Card, EmptyState, Spinner, SceneIcon } from '@/components/UI'
import StateManagementBar from '@/components/StateManagementBar'
import EditPipelineVisualizer, {
  parseLayersRun,
} from '@/components/EditPipelineVisualizer'
import ApiValidationPanel from '@/components/ApiValidationPanel'
import MechanicsBrowser from '@/components/MechanicsBrowser'
import NpcRolesBrowser from '@/components/NpcRolesBrowser'
import EditHistoryTimeline from '@/components/EditHistoryTimeline'
import type { ValidatorResult } from '@/lib/types'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
// Assets API base URL - includes /api/v1 (same pattern as lib/api.ts)
const ASSETS_API_BASE =
  process.env.NEXT_PUBLIC_ASSETS_API_URL || 'http://localhost:4000/api/v1'

const ACTOR_ICONS: Record<string, string> = {
  character: '🧑',
  creature: '🦊',
  collectible: '💎',
  obstacle: '🪨',
  interactive: '🔧',
  ambient: '🦋',
}

// Pending clarification state
interface PendingClarification {
  prompt: string
  questions: ClarificationQuestion[]
  answers: Record<string, string>
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: boolean
  plan?: any
  changes?: EditChange[]
  clarificationQuestions?: ClarificationQuestion[]
  pendingPrompt?: string // Original prompt that needs clarification
}

// ═══════════════════════════════════════════════════════════════
//  Progress steps — updated to match new pipeline stages
// ═══════════════════════════════════════════════════════════════

interface ProgressStep {
  key: string
  emoji: string
  label: string
  detail: string
  minDuration: number
  waitForFetch?: boolean
}

const GENERATION_STEPS: ProgressStep[] = [
  {
    key: 'assets',
    emoji: '📦',
    label: 'Loading game assets…',
    detail: 'Fetching sprites, tiles, and objects',
    minDuration: 800,
  },
  {
    key: 'planning',
    emoji: '🗺️',
    label: 'Planning gameplay loop…',
    detail: 'Selecting mechanics and goal structure',
    minDuration: 600,
  },
  {
    key: 'ai',
    emoji: '✨',
    label: 'AI Pipeline generating your game…',
    detail: 'Running: scenes → NPCs → challenges → dialogue → validation',
    minDuration: 0,
    waitForFetch: true,
  },
  {
    key: 'materialize',
    emoji: '🔧',
    label: 'Materializing scenes…',
    detail: 'Converting semantic layout to coordinates',
    minDuration: 500,
  },
  {
    key: 'assembly',
    emoji: '📋',
    label: 'Assembling manifest…',
    detail: 'Building final game configuration',
    minDuration: 400,
  },
  {
    key: 'done',
    emoji: '🎮',
    label: 'Done!',
    detail: 'Your game is ready',
    minDuration: 0,
  },
]

// ═══════════════════════════════════════════════════════════════
//  useFakeProgress hook
// ═══════════════════════════════════════════════════════════════

function useFakeProgress() {
  const [activeIdx, setActiveIdx] = useState<number>(-1)
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchDoneRef = useRef(false)
  const advanceRef = useRef<(idx: number) => void>(() => {})

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  const advanceTo = useCallback((idx: number) => {
    if (idx > 0) {
      setCompletedKeys((prev) => {
        const next = new Set(prev)
        next.add(GENERATION_STEPS[idx - 1].key)
        return next
      })
    }

    setActiveIdx(idx)

    const step = GENERATION_STEPS[idx]
    if (!step) return

    if (step.key === 'done') {
      setCompletedKeys(() => new Set(GENERATION_STEPS.map((s) => s.key)))
      return
    }

    if (step.waitForFetch && !fetchDoneRef.current) return

    const delay = fetchDoneRef.current ? 120 : step.minDuration
    timerRef.current = setTimeout(() => {
      advanceRef.current(idx + 1)
    }, delay)
  }, [])

  useEffect(() => {
    advanceRef.current = advanceTo
  }, [advanceTo])

  const markFetchDone = useCallback(() => {
    fetchDoneRef.current = true
    clearTimer()
    setActiveIdx((prev) => {
      if (prev < 0) return prev
      const step = GENERATION_STEPS[prev]
      if (step?.waitForFetch) {
        timerRef.current = setTimeout(() => {
          advanceRef.current(prev + 1)
        }, 120)
      } else {
        timerRef.current = setTimeout(() => {
          advanceRef.current(prev + 1)
        }, 120)
      }
      return prev
    })
  }, [])

  const start = useCallback(() => {
    clearTimer()
    fetchDoneRef.current = false
    setCompletedKeys(new Set())
    advanceRef.current(0)
  }, [])

  const reset = useCallback(() => {
    clearTimer()
    fetchDoneRef.current = false
    setActiveIdx(-1)
    setCompletedKeys(new Set())
  }, [])

  useEffect(() => () => clearTimer(), [])

  return { activeIdx, completedKeys, start, reset, markFetchDone }
}

// ═══════════════════════════════════════════════════════════════
//  PlanProgressSteps
// ═══════════════════════════════════════════════════════════════

function PlanProgressSteps({
  activeIdx,
  completedKeys,
}: {
  activeIdx: number
  completedKeys: Set<string>
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeIdx])

  if (activeIdx < 0) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
        <span className="text-sm text-white/70">Starting…</span>
      </div>
    )
  }

  const pct = Math.round((activeIdx / (GENERATION_STEPS.length - 1)) * 100)

  return (
    <div className="space-y-2 w-full min-w-[260px]">
      <div className="h-1 w-full bg-white/[0.1] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#eb8000] to-amber-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>

      <div className="space-y-0.5 max-h-56 overflow-y-auto">
        {GENERATION_STEPS.map((step, i) => {
          if (i > activeIdx) return null

          const isDone = completedKeys.has(step.key)
          const isActive = i === activeIdx && !isDone

          return (
            <div
              key={step.key}
              className={[
                'flex items-start gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : '',
                isDone ? 'opacity-60' : '',
              ].join(' ')}
            >
              <span className="text-sm mt-0.5 shrink-0">{step.emoji}</span>

              <div className="flex-1 min-w-0">
                <div
                  className={[
                    'text-xs font-semibold leading-tight',
                    isActive ? 'text-emerald-300' : 'text-white/70',
                  ].join(' ')}
                >
                  {step.label}
                </div>
                {isActive && (
                  <div className="text-[10px] text-muted mt-0.5 leading-tight">
                    {step.detail}
                  </div>
                )}
              </div>

              {isDone && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] shrink-0 font-bold mt-0.5">
                  ✓
                </span>
              )}
              {isActive && (
                <span className="flex items-center justify-center w-4 h-4 shrink-0 mt-0.5">
                  <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                </span>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Build Scene Manifest for Builder Preview
// ═══════════════════════════════════════════════════════════════

function buildSceneManifest(scene: any, sceneIndex: number) {
  return {
    id: `preview_${sceneIndex}`,
    scene_name: scene.scene_name,
    scene_type: scene.scene_type || 'adventure',
    grid_size: { width: 16, height: 16 },
    spawn_points: [{ position: { x: 8, y: 14 } }],
    ambient: { lighting: 'day' },
    asset_placements: [],
    actors: (scene.actors || []).map((a: any, j: number) => ({
      id: `actor_${sceneIndex}_${j}`,
      name: a.name,
      actor_type: a.actor_type || 'character',
      role: a.role,
      position: a.position || { x: 4 + j * 2, y: 10 },
      dialogue: { greeting: `Hello! I'm ${a.name}.` },
    })),
    challenges: (scene.challenges || []).map((c: any, j: number) => ({
      id: `challenge_${sceneIndex}_${j}`,
      name: c.name,
      mechanic_type: c.mechanic_type || 'exploration',
      description: c.description || '',
      difficulty: c.difficulty || 'medium',
      trigger: { type: 'zone_enter', zone: { x: 8, y: 8, radius: 2 } },
    })),
  }
}

// ═══════════════════════════════════════════════════════════════
//  Section Component (Collapsible)
// ═══════════════════════════════════════════════════════════════

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: string
  title: string
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-card/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.1]/30"
      >
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-white font-medium">{title}</span>
          <span className="text-xs bg-white/[0.1] text-white/70 px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        <span className="text-muted text-sm">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Page
// ═══════════════════════════════════════════════════════════════

export default function GameEditorPage() {
  const router = useRouter()
  const { currentGame, currentPlatform, refetchGames } = useStudio()
  const gameId = currentGame?.id

  // DB Data - only need scenes for metadata, GCS manifest has the entities
  const { data: dbScenes, refetch: refetchScenes } = useScenes(
    undefined,
    gameId
  )

  // Progress simulation
  const progress = useFakeProgress()

  // Build scene ID -> name lookup for route display
  const sceneIdToName = useMemo(() => {
    const lookup: Record<string, string> = {}
    dbScenes?.forEach((s: any) => {
      lookup[s.id] = s.scene_name || s.name || ''
    })
    return lookup
  }, [dbScenes])

  // Chat State
  const genId = () =>
    `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    {
      id: genId(),
      role: 'assistant',
      content:
        'Hi! I\'m your game architect. Describe your game and I\'ll generate scenes, NPCs, challenges, and routes.\n\n**Step 1:** Create your game:\n• "Create an escape game in a forest"\n• "Build an ocean exploration adventure"\n\n**Step 2:** Modify your game:\n• "Add a campfire near spawn"\n• "Add another NPC named Luna"',
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)

  const [plan, setPlan] = useState<any>(null)
  const [syncedScenes, setSyncedScenes] = useState<any[]>([]) // Track synced scenes with real DB IDs
  const [showPreview, setShowPreview] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // API v2 State Management
  const [gameVersion, setGameVersion] = useState<number>(1)
  const [canUndo, setCanUndo] = useState<boolean>(false)
  const [canRedo, setCanRedo] = useState<boolean>(false)
  const [editHistory, setEditHistory] = useState<EditHistoryItem[]>([])
  const [gameStatus, setGameStatus] = useState<
    'ready' | 'generating' | 'error'
  >('ready')

  // GCS fetch option - enabled by default to always fetch fresh data from GCS
  const [fetchFromGcs, setFetchFromGcs] = useState<boolean>(true)

  // Clarification flow state
  const [pendingClarification, setPendingClarification] =
    useState<PendingClarification | null>(null)

  // Validation state
  const [validationResult, setValidationResult] = useState<{
    valid: boolean
    total_errors: number
    total_warnings: number
    duration_ms: number
    validators: ValidatorResult[]
    summary: string
  } | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  // Pipeline visualization state
  const [pipelineVisible, setPipelineVisible] = useState(false)
  const [pipelineCompletedLayers, setPipelineCompletedLayers] = useState<
    string[]
  >([])
  const [pipelineActiveLayer, setPipelineActiveLayer] = useState<string | null>(
    null
  )
  const [pipelineErrors, setPipelineErrors] = useState<string[]>([])

  // Flag to force plan reconstruction from database after edits
  // This ensures frontend shows database state (authoritative) not GCS/manifest state
  const [shouldReconstructPlan, setShouldReconstructPlan] = useState(false)

  // Suggestions change based on whether a plan exists
  const initialSuggestions = [
    'Escape game in a forest',
    'Ocean exploration adventure',
    'Puzzle game in a castle',
  ]
  const modifySuggestions = [
    'Add a campfire near spawn',
    'Add another NPC',
    'Make the game harder',
  ]
  const suggestions = plan ? modifySuggestions : initialSuggestions

  const inputRef = useRef<HTMLInputElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  // ─── Reconstruct plan from database data on page load ─────────────
  // GCS IS THE SINGLE SOURCE OF TRUTH:
  // All game entities (NPCs, challenges, routes) are stored ONLY in GCS.
  // We fetch the full manifest for each scene to get the current state.
  const [isLoadingPlan, setIsLoadingPlan] = useState(false)
  const [loadedForGameId, setLoadedForGameId] = useState<string | null>(null)

  useEffect(() => {
    // ══════════════════════════════════════════════════════════════════════════
    // CRITICAL GUARDS - prevent infinite loops and unnecessary fetches
    // ══════════════════════════════════════════════════════════════════════════

    // Guard 1: No game selected
    if (!gameId) {
      return
    }

    // Guard 2: Already loading
    if (isLoadingPlan) {
      return
    }

    // Guard 3: Already loaded for this game (unless force refresh requested)
    if (loadedForGameId === gameId && !shouldReconstructPlan) {
      return
    }

    // Guard 4: No scenes data yet
    if (!dbScenes?.length) {
      return
    }

    // Guard 5: Filter to scenes for THIS game only
    const scenesForGame = dbScenes.filter((s: any) => s.game_id === gameId)
    if (!scenesForGame.length) {
      return
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FETCH GCS MANIFESTS
    // ══════════════════════════════════════════════════════════════════════════
    const fetchGCSManifests = async () => {
      setIsLoadingPlan(true)
      console.log(
        `[Editor] Fetching GCS manifests for ${scenesForGame.length} scenes`
      )

      try {
        const results = await Promise.all(
          scenesForGame.map(async (scene: any) => {
            try {
              const manifest = await assetsApi.getSceneManifest(scene.id)
              return {
                sceneId: scene.id,
                gcsData: manifest?.gcsManifest || null,
              }
            } catch (err) {
              console.warn(`[Editor] Manifest fetch failed for ${scene.id}`)
              return { sceneId: scene.id, gcsData: null }
            }
          })
        )

        // Build lookup
        const gcsDataByScene: Record<string, any> = {}
        results.forEach(({ sceneId, gcsData }) => {
          if (gcsData) gcsDataByScene[sceneId] = gcsData
        })

        // Sort scenes (start scenes first)
        const destinationIds = new Set<string>()
        scenesForGame.forEach((scene: any) => {
          ;(gcsDataByScene[scene.id]?.routes || []).forEach((r: any) => {
            if (r.to_scene_id) destinationIds.add(r.to_scene_id)
          })
        })

        const orderedScenes = [...scenesForGame].sort((a: any, b: any) => {
          const aIsStart = destinationIds.has(a.id) ? 1 : 0
          const bIsStart = destinationIds.has(b.id) ? 1 : 0
          if (aIsStart !== bIsStart) return aIsStart - bIsStart
          return (
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime()
          )
        })

        const sceneIdToName: Record<string, string> = {}
        orderedScenes.forEach((s: any) => {
          sceneIdToName[s.id] = s.scene_name || s.name || ''
        })

        const allRoutes: any[] = []

        const reconstructedPlan = {
          game_name: currentGame?.name || '',
          game_description: currentGame?.description || '',
          scenes: orderedScenes.map((scene: any) => {
            const gcs = gcsDataByScene[scene.id] || {}

            ;(gcs.routes || []).forEach((r: any) => {
              if (
                !allRoutes.find(
                  (e) =>
                    e.from_scene_id === r.from_scene_id &&
                    e.to_scene_id === r.to_scene_id
                )
              ) {
                allRoutes.push({
                  ...r,
                  from_scene_name:
                    r.from_scene_name ||
                    sceneIdToName[r.from_scene_id] ||
                    scene.scene_name,
                  to_scene_name:
                    r.to_scene_name || sceneIdToName[r.to_scene_id] || '',
                })
              }
            })

            return {
              id: scene.id,
              scene_id: scene.id,
              scene_name: scene.scene_name || scene.name,
              scene_type: scene.scene_type,
              description: scene.description,
              target_facets: scene.target_facets || [],
              objects: [],
              actors: (gcs.npcs || []).map((a: any) => ({
                id: a.npc_id || a.id,
                name: a.name,
                actor_type: a.actor_type || 'character',
                role: a.role,
                personality: a.personality,
                greeting: a.greeting,
                position: a.position || { x: a.x, y: a.y },
                facet: a.facet,
              })),
              challenges: (gcs.challenges || []).map((c: any) => ({
                id: c.challenge_id || c.id,
                name: c.name,
                mechanic_type:
                  c.mechanic_type || c.mechanic_id || 'exploration',
                description: c.description,
                difficulty: c.difficulty || 1,
                trigger: c.trigger,
                on_complete: c.on_complete,
              })),
              quests: [],
              spawn: scene.spawn || { x: 8, y: 14 },
              exit: scene.exit || { x: 8, y: 2 },
              width: scene.width || 16,
              height: scene.height || 16,
            }
          }),
          routes: allRoutes.map((r: any) => ({
            from_scene_name: r.from_scene_name,
            to_scene_name: r.to_scene_name,
            from_scene_id: r.from_scene_id,
            to_scene_id: r.to_scene_id,
            trigger: r.trigger || { type: 'zone_enter' },
            conditions: r.conditions || [],
          })),
        }

        console.log('[Editor] Plan loaded from GCS:', {
          scenes: reconstructedPlan.scenes.length,
          npcs: reconstructedPlan.scenes.reduce(
            (n: number, s: { actors: unknown[] }) => n + s.actors.length,
            0
          ),
          challenges: reconstructedPlan.scenes.reduce(
            (n: number, s: { challenges: unknown[] }) =>
              n + s.challenges.length,
            0
          ),
        })

        setPlan(reconstructedPlan)
        setLoadedForGameId(gameId)
        if (shouldReconstructPlan) setShouldReconstructPlan(false)

        setSyncedScenes(
          orderedScenes.map((s: any, i: number) => ({
            id: s.id,
            name: s.scene_name || s.name,
            index: i,
          }))
        )
      } catch (error) {
        console.error('[Editor] GCS manifest fetch failed:', error)
      } finally {
        setIsLoadingPlan(false)
      }
    }

    fetchGCSManifests()
  }, [
    gameId,
    dbScenes,
    isLoadingPlan,
    loadedForGameId,
    shouldReconstructPlan,
    currentGame,
  ])

  // ─── Load game state from API v2 on mount or game change ─────────────
  useEffect(() => {
    const loadGameState = async () => {
      if (!gameId) return

      try {
        const state = await knowledgeApi.getState(gameId)
        console.log('[GameEditor] Loaded game state from API:', {
          game_id: state.game_id,
          version: state.version,
          can_undo: state.can_undo,
          can_redo: state.can_redo,
        })

        setGameVersion(state.version)
        setCanUndo(state.can_undo)
        setCanRedo(state.can_redo)
        setGameStatus(state.status)
      } catch (err) {
        // Game not in state (404) - this is normal for new games or after server restart
        console.log('[GameEditor] No existing state for game:', gameId)
        // Reset state tracking for new games
        setGameVersion(1)
        setCanUndo(false)
        setCanRedo(false)
        setGameStatus('ready')
      }
    }

    loadGameState()
  }, [gameId])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  // ─── Validation Handler ────────────────────────────────────
  const runValidation = async () => {
    if (!plan || isValidating) return

    setIsValidating(true)
    setValidationResult(null)

    try {
      // Build manifest from plan for validation
      const manifest = {
        scenes: plan.scenes || [],
        routes: plan.routes || [],
        npcs: {},
        game: {
          id: gameId,
          name: plan.game_name || currentGame?.name || '',
        },
      }

      const result = await knowledgeApi.validate(manifest)
      setValidationResult(result)

      if (result.valid) {
        showToast('Validation passed')
      } else {
        showToast(
          `Validation: ${result.total_errors} error${result.total_errors !== 1 ? 's' : ''}, ${result.total_warnings} warning${result.total_warnings !== 1 ? 's' : ''}`
        )
      }
    } catch (err: any) {
      console.error('[GameEditor] Validation failed:', err)
      showToast(`Validation failed: ${err.message || 'Unknown error'}`)
    } finally {
      setIsValidating(false)
    }
  }

  // ─── Pipeline Visualization Helpers ────────────────────────────────
  const startPipelineVisualization = () => {
    setPipelineVisible(true)
    setPipelineCompletedLayers([])
    setPipelineActiveLayer('guardrail')
    setPipelineErrors([])
  }

  const updatePipelineFromResponse = (data: any) => {
    if (data.layers_run) {
      const { completed, active } = parseLayersRun(data.layers_run)
      setPipelineCompletedLayers(completed)
      setPipelineActiveLayer(active)
    }
    if (data.errors && data.errors.length > 0) {
      setPipelineErrors(data.errors)
    }
    // Hide pipeline after a delay on success
    if (data.success) {
      setPipelineCompletedLayers(data.layers_run || [])
      setPipelineActiveLayer(null)
      setTimeout(() => setPipelineVisible(false), 2000)
    }
  }

  // Compute validation status for StateManagementBar
  const validationStatus = validationResult
    ? validationResult.valid
      ? 'valid'
      : validationResult.total_errors > 0
        ? 'errors'
        : 'warnings'
    : null

  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chatMsgs])

  // ─── Open Scene in Builder ────────────────────────────────────
  const openSceneInBuilder = (scene: any, sceneIndex: number) => {
    const dbMatch = dbScenes?.find(
      (s: any) => (s.scene_name || s.name) === scene.scene_name
    )
    if (dbMatch?.id) {
      router.push(`/builder?scene=${dbMatch.id}`)
      return
    }
    const manifest = buildSceneManifest(scene, sceneIndex)
    const encoded = encodeURIComponent(JSON.stringify(manifest))
    router.push(`/builder?preview=${encoded}`)
  }

  // ─── Fetch Assets for Generation ────────────────────────────────
  const fetchAssets = async (): Promise<any[]> => {
    try {
      const res = await fetch(
        `${ASSETS_API_BASE}/assets?platform_id=${currentPlatform?.id || ''}`
      )
      if (res.ok) {
        const data = await res.json()
        console.log('[GameEditor] Raw assets response:', data)

        // Handle different response formats:
        // { data: [...] } or { assets: [...] } or [...] directly
        let assets = data.data || data.assets || data || []

        // If assets is still not an array, try to extract it
        if (assets && !Array.isArray(assets)) {
          if (typeof assets === 'object') {
            // Could be { id1: asset1, id2: asset2 } format
            assets = Object.values(assets)
          } else {
            assets = []
          }
        }

        // Flatten if accidentally nested (e.g., [[...]])
        if (
          Array.isArray(assets) &&
          assets.length === 1 &&
          Array.isArray(assets[0])
        ) {
          assets = assets[0]
        }

        console.log(
          '[GameEditor] Parsed assets (array):',
          assets.length,
          'items'
        )
        return assets
      }
    } catch (err) {
      console.warn('Failed to fetch assets:', err)
    }
    return []
  }

  // ═══════════════════════════════════════════════════════════════
  // Handle Clarification Selection
  // When user clicks an option, update answers and optionally submit
  // ═══════════════════════════════════════════════════════════════
  const handleClarificationSelect = (field: string, option: string) => {
    if (!pendingClarification) return

    const newAnswers = {
      ...pendingClarification.answers,
      [field]: option,
    }

    setPendingClarification({
      ...pendingClarification,
      answers: newAnswers,
    })
  }

  // Submit clarifications and regenerate
  const submitClarifications = async () => {
    if (!pendingClarification) return

    // Check if all required questions are answered
    const requiredFields = pendingClarification.questions
      .filter((q) => q.required)
      .map((q) => q.field)

    const missingRequired = requiredFields.filter(
      (f) => !pendingClarification.answers[f]
    )

    if (missingRequired.length > 0) {
      showToast(
        `Please answer required questions: ${missingRequired.join(', ')}`
      )
      return
    }

    // Add user message showing their selections
    const answerSummary = Object.entries(pendingClarification.answers)
      .map(([field, answer]) => `${field}: ${answer}`)
      .join('\n')

    const userMsg: ChatMsg = {
      id: genId(),
      role: 'user',
      content: `My preferences:\n${answerSummary}`,
    }
    setChatMsgs((prev) => [...prev, userMsg])

    // Show thinking state
    const thinkId = genId()
    setChatMsgs((prev) => [
      ...prev,
      { id: thinkId, role: 'assistant', content: '', thinking: true },
    ])
    setIsThinking(true)
    setGameStatus('generating')
    progress.start()

    try {
      // Call API with clarifications
      const data = await knowledgeApi.generate(pendingClarification.prompt, {
        game_id: gameId, // Pass existing game_id if available
        clarifications: pendingClarification.answers,
      })

      progress.markFetchDone()
      await new Promise<void>((resolve) => setTimeout(resolve, 800))

      // Check if API still needs more clarification
      if (needsClarification(data)) {
        setPendingClarification({
          prompt: pendingClarification.prompt,
          questions: data.questions,
          answers: {},
        })

        setChatMsgs((prev) =>
          prev.map((m) =>
            m.id === thinkId
              ? {
                  ...m,
                  thinking: false,
                  content: data.message,
                  clarificationQuestions: data.questions,
                  pendingPrompt: pendingClarification.prompt,
                }
              : m
          )
        )

        setIsThinking(false)
        setGameStatus('ready')
        return
      }

      // Success! Process the manifest
      if (data.success && data.manifest) {
        // Clear pending clarification
        setPendingClarification(null)

        // Process manifest (same logic as sendMessage success path)
        const manifest = data.manifest as any
        const newPlan = convertManifestToPlan(manifest)
        setPlan(newPlan)

        // Update synced scenes
        if (data.synced?.scenes) {
          setSyncedScenes(data.synced.scenes)
        }

        // Update version tracking
        setGameVersion(1)
        setCanUndo(false)
        setCanRedo(false)
        setEditHistory([
          {
            change: {
              edit_type: 'modify_scene',
              description: 'Initial game generation',
            },
            version: 1,
            timestamp: new Date(),
          },
        ])

        const stats = data.stats || {
          scenes: newPlan.scenes?.length || 0,
          npcs: 0,
          challenges: 0,
          routes: newPlan.routes?.length || 0,
        }

        setChatMsgs((prev) =>
          prev.map((m) =>
            m.id === thinkId
              ? {
                  ...m,
                  thinking: false,
                  content: `Game generated: ${stats.scenes} scenes, ${stats.npcs} NPCs, ${stats.challenges} challenges, ${stats.routes} routes`,
                  plan: newPlan,
                }
              : m
          )
        )

        showToast('Game generated successfully')
        refetchScenes()
      }
    } catch (err: any) {
      console.error('[GameEditor] Generation after clarification failed:', err)
      setChatMsgs((prev) =>
        prev.map((m) =>
          m.id === thinkId
            ? {
                ...m,
                thinking: false,
                content: `Generation failed: ${err.message || 'Unknown error'}`,
              }
            : m
        )
      )
      showToast(`Failed: ${err.message || 'Unknown error'}`)
    } finally {
      setIsThinking(false)
      setGameStatus('ready')
    }
  }

  // Skip clarification and generate with best guess
  const skipClarification = async () => {
    if (!pendingClarification) return

    const userMsg: ChatMsg = {
      id: genId(),
      role: 'user',
      content: '(Skipping questions, generate with defaults)',
    }
    setChatMsgs((prev) => [...prev, userMsg])

    const thinkId = genId()
    setChatMsgs((prev) => [
      ...prev,
      { id: thinkId, role: 'assistant', content: '', thinking: true },
    ])
    setIsThinking(true)
    setGameStatus('generating')
    progress.start()

    try {
      const data = await knowledgeApi.generate(pendingClarification.prompt, {
        game_id: gameId, // Pass existing game_id if available
        skip_clarification: true,
      })

      progress.markFetchDone()
      await new Promise<void>((resolve) => setTimeout(resolve, 800))

      if (data.success && data.manifest) {
        setPendingClarification(null)

        const manifest = data.manifest as any
        const newPlan = convertManifestToPlan(manifest)
        setPlan(newPlan)

        if (data.synced?.scenes) {
          setSyncedScenes(data.synced.scenes)
        }

        setGameVersion(1)
        setCanUndo(false)
        setCanRedo(false)

        const stats = data.stats || {
          scenes: newPlan.scenes?.length || 0,
          npcs: 0,
          challenges: 0,
          routes: newPlan.routes?.length || 0,
        }

        setChatMsgs((prev) =>
          prev.map((m) =>
            m.id === thinkId
              ? {
                  ...m,
                  thinking: false,
                  content: `Game generated (with defaults): ${stats.scenes} scenes, ${stats.npcs} NPCs, ${stats.challenges} challenges, ${stats.routes} routes`,
                  plan: newPlan,
                }
              : m
          )
        )

        showToast('Game generated')
        refetchScenes()
      }
    } catch (err: any) {
      setChatMsgs((prev) =>
        prev.map((m) =>
          m.id === thinkId
            ? {
                ...m,
                thinking: false,
                content: `Generation failed: ${err.message || 'Unknown error'}`,
              }
            : m
        )
      )
    } finally {
      setIsThinking(false)
      setGameStatus('ready')
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Send Message — Uses /api/v2/generate endpoint (Simplified API v2)
  // Two modes:
  //   1. Generate (no plan): { prompt } → Creates new game
  //   2. Edit (has plan): { game_id, instruction } → Modifies existing game
  // ═══════════════════════════════════════════════════════════════
  const sendMessage = async (text: string) => {
    if (!text.trim() || isThinking) return

    const userMsg: ChatMsg = { id: genId(), role: 'user', content: text.trim() }
    setChatMsgs((prev) => [...prev, userMsg])
    setChatInput('')

    const thinkId = genId()
    setChatMsgs((prev) => [
      ...prev,
      { id: thinkId, role: 'assistant', content: '', thinking: true },
    ])
    setIsThinking(true)
    setGameStatus('generating')

    // Start the progress animation
    progress.start()

    try {
      // ═══════════════════════════════════════════════════════════
      // Determine if this is an initial call or a modification call
      // ═══════════════════════════════════════════════════════════
      const isModifyMode = plan !== null && gameId

      let data: any

      if (isModifyMode) {
        // ─────────────────────────────────────────────────────────
        // MODE 2: Edit existing game (API v2 simplified)
        // Just send: { game_id, instruction, fetch_from_gcs }
        // Backend manages state internally
        // ─────────────────────────────────────────────────────────
        console.log('[GameEditor] EDIT MODE - Using API v2 simplified edit')
        console.log('[GameEditor] fetch_from_gcs:', fetchFromGcs)
        startPipelineVisualization()
        data = await knowledgeApi.edit(gameId, text.trim(), {
          fetch_from_gcs: fetchFromGcs,
        })
        updatePipelineFromResponse(data)
      } else {
        // ─────────────────────────────────────────────────────────
        // MODE 1: Generate new game (API v2 simplified)
        // Just send: { prompt } or { prompt, clarifications }
        // ─────────────────────────────────────────────────────────
        console.log(
          '[GameEditor] GENERATE MODE - Using API v2 simplified generate'
        )

        // Check if we have pending clarification answers to send
        if (
          pendingClarification &&
          pendingClarification.prompt === text.trim()
        ) {
          // Resend with clarifications
          data = await knowledgeApi.generate(text.trim(), {
            game_id: gameId, // Pass existing game_id if available
            clarifications: pendingClarification.answers,
          })
        } else {
          // Fresh request - pass game_id if we have an existing game
          data = await knowledgeApi.generate(
            text.trim(),
            gameId ? { game_id: gameId } : undefined
          )
        }
      }

      // Fetch is done — fast-forward remaining steps
      progress.markFetchDone()
      await new Promise<void>((resolve) => setTimeout(resolve, 800))

      // ═══════════════════════════════════════════════════════════
      // Handle Clarification Flow
      // ═══════════════════════════════════════════════════════════
      if (needsClarification(data)) {
        console.log('[GameEditor] API needs clarification:', data.questions)

        // Store the pending clarification
        setPendingClarification({
          prompt: text.trim(),
          questions: data.questions,
          answers: {},
        })

        // Show clarification message in chat
        setChatMsgs((prev) =>
          prev.map((m) =>
            m.id === thinkId
              ? {
                  ...m,
                  thinking: false,
                  content: data.message,
                  clarificationQuestions: data.questions,
                  pendingPrompt: text.trim(),
                }
              : m
          )
        )

        setIsThinking(false)
        setGameStatus('ready')
        return
      }

      // Clear pending clarification on successful generation
      setPendingClarification(null)

      // ═══════════════════════════════════════════════════════════
      // Convert manifest to plan format for UI compatibility
      // ═══════════════════════════════════════════════════════════
      if (data.success && data.manifest) {
        const manifest = data.manifest
        const newPlan = {
          game_name:
            manifest.game?.name ||
            manifest.game_name ||
            currentGame?.name ||
            '',
          game_description:
            manifest.narrative?.goal_description ||
            manifest.game_description ||
            '',
          scenes: (manifest.scenes || []).map((scene: any, idx: number) => ({
            id:
              scene.id ||
              scene.scene_id ||
              `${manifest.game?.id || 'game'}_scene_${idx}`,
            scene_id:
              scene.id ||
              scene.scene_id ||
              `${manifest.game?.id || 'game'}_scene_${idx}`,
            scene_index: scene.scene_index ?? idx,
            scene_name:
              scene.scene_name || `Scene ${(scene.scene_index ?? idx) + 1}`,
            scene_type: scene.zone_type || scene.scene_type || 'forest',
            description: scene.description || '',
            width: scene.width || 16,
            height: scene.height || 16,
            spawn: scene.spawn || { x: 8, y: 14 },
            exit: scene.exit || { x: 8, y: 2 },
            zones: scene.zones || [],
            actors: [], // Will be populated below from manifest.npcs
            npcs: [], // Will be populated below
            challenges: (scene.challenges || []).map((c: any) => ({
              ...c,
              id: c.challenge_id || c.id,
              mechanic_type: c.mechanic_id || c.mechanic_type || 'exploration',
              trigger: c.trigger || {
                type: 'zone_enter',
                zone: { x: c.x || 8, y: c.y || 8, radius: 2 },
              },
              on_complete: {
                hearts_delta: c.rewards?.hearts_reward || {},
                score: c.rewards?.score_points || 0,
              },
            })),
            quests: [],
            objects: scene.objects || [],
            layout: {
              player_spawn: scene.spawn || { x: 8, y: 14 },
            },
          })),
          routes: (manifest.routes || []).map((r: any, idx: number) => ({
            id: r.route_id || `route_${idx}`,
            from_scene: r.from_scene,
            to_scene: r.to_scene,
            from_scene_name: r.from_scene_name || `Scene ${r.from_scene + 1}`,
            to_scene_name: r.to_scene_name || `Scene ${r.to_scene + 1}`,
            from_scene_id: r.from_scene_id || `scene_${r.from_scene}`,
            to_scene_id: r.to_scene_id || `scene_${r.to_scene}`,
            trigger: r.trigger || { type: 'zone_enter' },
            conditions: r.conditions || [],
          })),
        }

        // Add NPCs to scenes from manifest.npcs (which is a dict keyed by npc_id)
        const npcsDict = manifest.npcs || {}
        for (const npcId in npcsDict) {
          const npc = npcsDict[npcId]
          const sceneIdx = npc.scene_index
          if (sceneIdx !== undefined && newPlan.scenes[sceneIdx]) {
            const npcData = {
              id: npc.npc_id || npcId,
              name: npc.name,
              actor_type: npc.type || 'character',
              role: npc.role,
              personality: npc.personality || [],
              position: npc.position || { x: 8, y: 10 },
              greeting:
                npc.dialogue?.lines?.find((l: any) => l.type === 'greeting')
                  ?.text || `Hello! I'm ${npc.name}.`,
              dialogue: {
                greeting:
                  npc.dialogue?.lines?.find((l: any) => l.type === 'greeting')
                    ?.text || `Hello!`,
                lines: npc.dialogue?.lines || [],
              },
            }
            newPlan.scenes[sceneIdx].actors.push(npcData)
            newPlan.scenes[sceneIdx].npcs.push(npcData)
          }
        }

        console.log(
          '[Editor] Setting plan with scenes:',
          newPlan.scenes?.length,
          newPlan.scenes?.map((s: any) => ({
            id: s.id,
            scene_id: s.scene_id,
            scene_name: s.scene_name,
          }))
        )

        // Store synced scenes with real DB IDs if available.
        // Sort by index (set by backend as manifest order) so syncedScenes[0] = Scene 1.
        if (data.synced?.scenes?.length) {
          console.log('[Editor] Scenes synced to DB:', data.synced.scenes)
          const sortedSynced = [...data.synced.scenes].sort(
            (a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)
          )
          setSyncedScenes(sortedSynced)

          // Update plan scenes with real DB IDs
          data.synced.scenes.forEach((syncedScene: any) => {
            const planScene = newPlan.scenes.find(
              (s: any) =>
                s.scene_name === syncedScene.name ||
                s.scene_index === syncedScene.index
            )
            if (planScene) {
              planScene.id = syncedScene.id
              planScene.scene_id = syncedScene.id
              console.log(
                `[Editor] Updated scene "${syncedScene.name}" with DB ID: ${syncedScene.id}`
              )
            }
          })

          // Also update routes with real scene IDs
          if (data.synced.scenes.length >= 2) {
            newPlan.routes.forEach((route: any) => {
              const fromScene = data.synced.scenes.find(
                (s: any) => s.name === route.from_scene_name
              )
              const toScene = data.synced.scenes.find(
                (s: any) => s.name === route.to_scene_name
              )
              if (fromScene) route.from_scene_id = fromScene.id
              if (toScene) route.to_scene_id = toScene.id
            })
          }
        }

        setPlan(newPlan)

        // ═══════════════════════════════════════════════════════════
        // Update API v2 state tracking
        // ═══════════════════════════════════════════════════════════
        if ('version' in data) {
          setGameVersion(data.version)
          setCanUndo(data.can_undo || false)
          setCanRedo(false) // After new edit, redo is cleared
        }

        // Track edit history for edit mode
        if ('changes' in data && data.changes && data.changes.length > 0) {
          setEditHistory((prev) => [
            ...prev,
            ...data.changes.map((change: EditChange) => ({
              change,
              version: data.version,
              timestamp: new Date(),
            })),
          ])
        } else if (!isModifyMode) {
          // For initial generation, add a history entry
          setEditHistory([
            {
              change: {
                edit_type: 'generate',
                description: 'Initial game generation',
              },
              version: 1,
              timestamp: new Date(),
            },
          ])
          setGameVersion(1)
        }

        setGameStatus('ready')
      }

      // Refetch database data and reconstruct plan from database for edits
      // This ensures frontend shows authoritative database state
      // (important for challenges which are only updated in GCS, not database)
      if (isModifyMode) {
        setShouldReconstructPlan(true)
      }
      setTimeout(() => {
        refetchScenes()
      }, 300)

      // Build response message - differentiate between initial and modify modes
      const modePrefix = isModifyMode ? 'Modified' : 'Created'
      const statsMsg = data.stats
        ? `${modePrefix}: ${data.stats.scenes || 0} scenes, ${data.stats.npcs || 0} NPCs, ${data.stats.routes || 0} routes`
        : isModifyMode
          ? 'Game updated'
          : 'Game created'

      const versionInfo =
        'version' in data
          ? `\n\nVersion ${data.version}${data.can_undo ? ' (undo available)' : ''}`
          : ``

      const warningsMsg = data.warnings?.length
        ? `\n\nWarnings: ${data.warnings.join('; ')}`
        : ''

      const modeInfo = isModifyMode
        ? ``
        : `\n\nYou can now modify your game with instructions like "add a campfire near spawn".`

      // Format error messages cleanly
      const formatErrors = (errors: string[]) => {
        if (!errors || errors.length === 0) return 'Unknown error'
        if (errors.length === 1) return errors[0]
        return errors.map((e, i) => `${i + 1}. ${e}`).join('\n')
      }

      setChatMsgs((prev) =>
        prev
          .filter((m) => m.id !== thinkId)
          .concat({
            id: genId(),
            role: 'assistant',
            content: data.success
              ? `Done! ${statsMsg}${versionInfo}${warningsMsg}${modeInfo}`
              : `Could not complete: ${formatErrors(data.errors)}`,
            plan: data.success ? data.manifest : null,
            changes: 'changes' in data ? data.changes : undefined,
          })
      )
    } catch (err: any) {
      progress.reset()
      setGameStatus('error')
      setChatMsgs((prev) =>
        prev
          .filter((m) => m.id !== thinkId)
          .concat({
            id: genId(),
            role: 'assistant',
            content: `Error: ${err.message || 'Connection failed'}. Please try again.`,
          })
      )
    } finally {
      setIsThinking(false)
      setGameStatus('ready')
      progress.reset()
      inputRef.current?.focus()
    }
  }

  const handleClearAll = async () => {
    if (!confirm('Delete all scenes, actors, challenges, and routes?')) return

    try {
      const res = await fetch(`${BACKEND_URL}/api/games/plan/clear`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: currentGame?.id }),
      })

      if (res.ok) {
        setPlan(null)
        setSyncedScenes([]) // Clear synced scenes

        // Reset API v2 state
        setGameVersion(1)
        setCanUndo(false)
        setCanRedo(false)
        setEditHistory([])
        setGameStatus('ready')

        // Also clear state from backend if game exists
        if (gameId) {
          try {
            await knowledgeApi.deleteState(gameId)
          } catch {
            // Ignore errors - state might not exist
          }
        }

        refetchScenes()
        setChatMsgs([
          {
            id: genId(),
            role: 'assistant',
            content: 'All content cleared. Describe a new game to get started.',
          },
        ])
        showToast('Cleared')
      }
    } catch {
      showToast('Clear failed')
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Undo Handler — Reverts to previous version
  // ═══════════════════════════════════════════════════════════════
  const handleUndo = async () => {
    if (!gameId || !canUndo || isThinking) return

    setIsThinking(true)
    try {
      const result = await knowledgeApi.undo(gameId)

      if (result.success) {
        // Fetch updated state to get the reverted manifest
        const state = await knowledgeApi.getState(gameId)

        // Convert manifest to plan format
        const manifest = state.manifest as any
        const revertedPlan = convertManifestToPlan(manifest)
        setPlan(revertedPlan)

        // Update state tracking
        setGameVersion(result.version)
        setCanUndo(result.can_undo)
        setCanRedo(result.can_redo)

        showToast(`Undone: ${result.undone?.description || 'Last change'}`)

        // Add undo message to chat
        setChatMsgs((prev) => [
          ...prev,
          {
            id: genId(),
            role: 'assistant',
            content: `Undone: ${result.undone?.description || 'Last change'} (Version ${result.version})`,
          },
        ])

        // Refetch scenes and reconstruct plan from GCS
        setShouldReconstructPlan(true)
        refetchScenes()
      }
    } catch (err: any) {
      showToast(`Undo failed: ${err.message}`)
    } finally {
      setIsThinking(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Redo Handler — Restores an undone edit
  // ═══════════════════════════════════════════════════════════════
  const handleRedo = async () => {
    if (!gameId || !canRedo || isThinking) return

    setIsThinking(true)
    try {
      const result = await knowledgeApi.redo(gameId)

      if (result.success) {
        // Fetch updated state to get the restored manifest
        const state = await knowledgeApi.getState(gameId)

        // Convert manifest to plan format
        const manifest = state.manifest as any
        const restoredPlan = convertManifestToPlan(manifest)
        setPlan(restoredPlan)

        // Update state tracking
        setGameVersion(result.version)
        setCanUndo(result.can_undo)
        setCanRedo(result.can_redo)

        showToast(`Redone: ${result.redone?.description || 'Change'}`)

        // Add redo message to chat
        setChatMsgs((prev) => [
          ...prev,
          {
            id: genId(),
            role: 'assistant',
            content: `Redone: ${result.redone?.description || 'Change'} (Version ${result.version})`,
          },
        ])

        // Refetch database data and reconstruct plan from GCS
        setShouldReconstructPlan(true)
        refetchScenes()
      }
    } catch (err: any) {
      showToast(`Redo failed: ${err.message}`)
    } finally {
      setIsThinking(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Helper: Convert manifest to plan format (used by undo/redo)
  // ═══════════════════════════════════════════════════════════════
  const convertManifestToPlan = (manifest: any) => {
    const newPlan = {
      game_name:
        manifest.game?.name || manifest.game_name || currentGame?.name || '',
      game_description:
        manifest.narrative?.goal_description || manifest.game_description || '',
      scenes: (manifest.scenes || []).map((scene: any, idx: number) => ({
        id:
          scene.id ||
          scene.scene_id ||
          `${manifest.game?.id || 'game'}_scene_${idx}`,
        scene_id:
          scene.id ||
          scene.scene_id ||
          `${manifest.game?.id || 'game'}_scene_${idx}`,
        scene_index: scene.scene_index ?? idx,
        scene_name:
          scene.scene_name || `Scene ${(scene.scene_index ?? idx) + 1}`,
        scene_type: scene.zone_type || scene.scene_type || 'forest',
        description: scene.description || '',
        width: scene.width || 16,
        height: scene.height || 16,
        spawn: scene.spawn || { x: 8, y: 14 },
        exit: scene.exit || { x: 8, y: 2 },
        zones: scene.zones || [],
        actors: [],
        npcs: [],
        challenges: (scene.challenges || []).map((c: any) => ({
          ...c,
          id: c.challenge_id || c.id,
          mechanic_type: c.mechanic_id || c.mechanic_type || 'exploration',
        })),
        quests: [],
        objects: scene.objects || [],
      })),
      routes: (manifest.routes || []).map((r: any, idx: number) => ({
        id: r.route_id || `route_${idx}`,
        from_scene: r.from_scene,
        to_scene: r.to_scene,
        from_scene_name: r.from_scene_name || `Scene ${r.from_scene + 1}`,
        to_scene_name: r.to_scene_name || `Scene ${r.to_scene + 1}`,
        from_scene_id: r.from_scene_id,
        to_scene_id: r.to_scene_id,
        trigger: r.trigger || { type: 'zone_enter' },
        conditions: r.conditions || [],
      })),
    }

    // Add NPCs to scenes
    const npcsDict = manifest.npcs || {}
    for (const npcId in npcsDict) {
      const npc = npcsDict[npcId]
      const sceneIdx = npc.scene_index
      if (sceneIdx !== undefined && newPlan.scenes[sceneIdx]) {
        const npcData = {
          id: npc.npc_id || npcId,
          name: npc.name,
          actor_type: npc.type || 'character',
          role: npc.role,
          personality: npc.personality || [],
          position: npc.position || { x: 8, y: 10 },
          greeting:
            npc.dialogue?.lines?.find((l: any) => l.type === 'greeting')
              ?.text || `Hello!`,
        }
        newPlan.scenes[sceneIdx].actors.push(npcData)
        newPlan.scenes[sceneIdx].npcs.push(npcData)
      }
    }

    return newPlan
  }

  const totalActors = plan
    ? (plan.scenes || []).reduce(
        (n: number, s: any) => n + (s.actors?.length || 0),
        0
      )
    : 0
  const totalChallenges = plan
    ? (plan.scenes || []).reduce(
        (n: number, s: any) => n + (s.challenges?.length || 0),
        0
      )
    : 0

  if (!currentGame) {
    return (
      <>
        <PageHeader title="Game Editor" />
        <Card className="p-8 text-center">
          <EmptyState
            icon="🎮"
            title="No Game Selected"
            description="Select a game from the dropdown above"
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={currentGame.name}
        subtitle="Game Editor"
        action={
          <div className="flex items-center gap-3">
            {(dbScenes?.length || 0) > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl text-sm"
              >
                🗑️ Clear All
              </button>
            )}
            <Link
              href="/builder"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-medium"
            >
              🎨 Scene Builder
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-[340px_1fr_280px] gap-4 h-[calc(100vh-180px)]">
        {/* ═══════ LEFT: Chat ═══════ */}
        <Card className="flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <span className="text-white font-bold text-sm">
              AI Game Generator
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
              {plan ? 'Modify Mode' : 'Create Mode'}
            </span>
          </div>

          {/* Pipeline Visualization - shown during edits */}
          {pipelineVisible && (
            <div className="px-3 py-2 border-b border-card-border">
              <EditPipelineVisualizer
                completedLayers={pipelineCompletedLayers}
                activeLayer={pipelineActiveLayer}
                visible={pipelineVisible}
                errors={pipelineErrors}
              />
            </div>
          )}

          <div ref={chatRef} className="flex-1 overflow-auto p-4 space-y-3">
            {chatMsgs.map((msg) => (
              <div key={msg.id}>
                {msg.thinking ? (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl px-4 py-3 bg-card border border-card-border">
                      <PlanProgressSteps
                        activeIdx={progress.activeIdx}
                        completedKeys={progress.completedKeys}
                      />
                    </div>
                  </div>
                ) : msg.clarificationQuestions &&
                  msg.clarificationQuestions.length > 0 ? (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl px-4 py-3 bg-card border border-card-border">
                      <p className="text-sm text-white/80 mb-3">
                        {msg.content}
                      </p>
                      <div className="space-y-4">
                        {msg.clarificationQuestions.map((q, qIdx) => (
                          <div key={qIdx} className="space-y-2">
                            <p className="text-sm font-medium text-white flex items-center gap-1">
                              {q.question}
                              {q.required && (
                                <span className="text-red-400 text-xs">*</span>
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {q.options.map((opt, optIdx) => {
                                const isSelected =
                                  pendingClarification?.answers[q.field] === opt
                                return (
                                  <button
                                    key={optIdx}
                                    onClick={() =>
                                      handleClarificationSelect(q.field, opt)
                                    }
                                    disabled={isThinking}
                                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                                      isSelected
                                        ? 'bg-accent border-accent text-white'
                                        : 'bg-input border-card-border text-white/70 hover:bg-white/[0.08] hover:border-accent/50'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-2 border-t border-card-border">
                          <button
                            onClick={submitClarifications}
                            disabled={isThinking}
                            className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm rounded-lg font-medium"
                          >
                            Generate Game
                          </button>
                          <button
                            onClick={skipClarification}
                            disabled={isThinking}
                            className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-50 text-white/70 text-sm rounded-lg"
                          >
                            Skip (use defaults)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ChatMessage
                    role={msg.role}
                    content={msg.content}
                    changes={msg.changes}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Suggestions - show for both initial and modify modes */}
          {!isThinking && (
            <div className="px-4 py-2 border-t border-card-border flex flex-wrap gap-2">
              <span className="text-xs text-muted mr-2 self-center">
                {plan ? 'Modify:' : 'Create:'}
              </span>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  disabled={isThinking}
                  className="px-3 py-1.5 bg-card hover:bg-white/[0.1] text-white/70 text-sm rounded-full disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-card-border">
            <div className="flex gap-2 overflow-hidden">
              <input
                ref={inputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(chatInput)}
                placeholder={
                  plan
                    ? 'e.g., Add a campfire near spawn...'
                    : 'e.g., Create an escape game...'
                }
                className="flex-1 min-w-0 bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => sendMessage(chatInput)}
                disabled={isThinking || !chatInput.trim()}
                className="flex-shrink-0 px-4 py-2.5 bg-accent hover:bg-accent disabled:opacity-50 text-white rounded-xl font-medium whitespace-nowrap"
              >
                Generate
              </button>
            </div>
            {/* GCS Fetch Option */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="fetchFromGcs"
                checked={fetchFromGcs}
                onChange={(e) => setFetchFromGcs(e.target.checked)}
                className="w-4 h-4 rounded border-card-border bg-input text-accent focus:ring-accent focus:ring-offset-0"
              />
              <label
                htmlFor="fetchFromGcs"
                className="text-xs text-white/60 cursor-pointer"
              >
                Fetch manifest from GCS
              </label>
            </div>
          </div>
        </Card>

        {/* ═══════ CENTER: Plan or DB Content ═══════ */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* State Management Bar */}
          <StateManagementBar
            version={gameVersion}
            status={isThinking ? 'generating' : plan ? 'ready' : 'empty'}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onPreview={() => setShowPreview(true)}
            onValidate={runValidation}
            isLoading={isThinking || isValidating}
            validationStatus={validationStatus}
            warningCount={validationResult?.total_warnings || 0}
            errorCount={validationResult?.total_errors || 0}
          />

          {/* Content Area */}
          <div className="flex-1 space-y-4 overflow-auto">
            {plan && (
              <>
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold">📋 Generated Game</h3>
                    <span className="text-xs text-muted">From AI Pipeline</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-sm">
                    <div className="bg-input rounded p-2">
                      <div className="font-bold text-white">
                        {plan.scenes?.length || 0}
                      </div>
                      <div className="text-muted text-xs">Scenes</div>
                    </div>
                    <div className="bg-input rounded p-2">
                      <div className="font-bold text-cyan-400">
                        {totalActors}
                      </div>
                      <div className="text-muted text-xs">NPCs</div>
                    </div>
                    <div className="bg-input rounded p-2">
                      <div className="font-bold text-yellow-400">
                        {totalChallenges}
                      </div>
                      <div className="text-muted text-xs">Challenges</div>
                    </div>
                    <div className="bg-input rounded p-2">
                      <div className="font-bold text-purple-400">
                        {plan.routes?.length || 0}
                      </div>
                      <div className="text-muted text-xs">Routes</div>
                    </div>
                  </div>
                </Card>

                <Section
                  icon="🏞️"
                  title="Scenes"
                  count={plan.scenes?.length || 0}
                >
                  {(plan.scenes || []).map((scene: any, sIdx: number) => (
                    <div
                      key={sIdx}
                      className="bg-input rounded-lg mb-3 overflow-hidden"
                    >
                      <div className="px-4 py-3 flex items-center justify-between border-b border-card-border">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">
                            {sIdx + 1}
                          </span>
                          <span className="text-white font-medium">
                            {scene.scene_name}
                          </span>
                          <span className="text-xs text-muted bg-white/[0.1] px-2 py-0.5 rounded">
                            {scene.scene_type}
                          </span>
                        </div>
                        <button
                          onClick={() => openSceneInBuilder(scene, sIdx)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-lg"
                        >
                          🎨 Preview in Builder
                        </button>
                      </div>

                      <div className="px-4 py-3 space-y-3">
                        <div>
                          <div className="text-xs text-white/70 mb-1">
                            NPCs ({scene.actors?.length || 0})
                          </div>
                          {(scene.actors || []).length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {scene.actors.map((a: any, aIdx: number) => (
                                <span
                                  key={aIdx}
                                  className="inline-flex items-center gap-1 bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded text-sm"
                                >
                                  {ACTOR_ICONS[a.actor_type] || '👤'} {a.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-white/40 text-sm">No NPCs</p>
                          )}
                        </div>

                        <div>
                          <div className="text-xs text-white/70 mb-1">
                            Challenges ({scene.challenges?.length || 0})
                          </div>
                          {(scene.challenges || []).length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {scene.challenges.map((c: any, cIdx: number) => (
                                <span
                                  key={cIdx}
                                  className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded text-sm"
                                >
                                  🎯 {c.name}{' '}
                                  <span className="text-yellow-600">
                                    ({c.mechanic_type})
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-white/40 text-sm">
                              No challenges
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </Section>

                <Section
                  icon="🔀"
                  title="Routes"
                  count={plan.routes?.length || 0}
                >
                  {(plan.routes || []).length > 0 ? (
                    <div className="space-y-2">
                      {plan.routes.map((r: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 bg-input rounded-lg px-3 py-2"
                        >
                          <span className="text-white">
                            {r.from_scene_name}
                          </span>
                          <span className="text-purple-400">→</span>
                          <span className="text-white">{r.to_scene_name}</span>
                          <span className="text-xs text-muted ml-auto">
                            ({r.trigger?.type || 'zone_enter'})
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-white/40 text-sm">No routes generated</p>
                  )}
                </Section>
              </>
            )}

            {!plan && (
              <>
                <Section icon="🏞️" title="Scenes" count={dbScenes?.length || 0}>
                  {dbScenes?.length ? (
                    dbScenes.map((s: any) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between bg-input rounded-lg px-3 py-2 mb-2"
                      >
                        <Link
                          href={`/scenes/${s.id}`}
                          className="flex items-center gap-2 flex-1"
                        >
                          <SceneIcon type={s.scene_type} />
                          <span className="text-white">
                            {s.scene_name || s.name}
                          </span>
                          <span className="text-xs text-muted">
                            ({s.scene_type})
                          </span>
                        </Link>
                        <div className="flex gap-2">
                          <Link
                            href={`/builder?scene=${s.id}`}
                            className="text-purple-400 text-xs hover:text-purple-300"
                          >
                            🎨 Builder
                          </Link>
                          <Link
                            href={`/scenes/${s.id}/edit`}
                            className="text-accent text-xs hover:text-accent"
                          >
                            Edit
                          </Link>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-white/40 text-sm">
                      No scenes yet. Describe your game in the chat!
                    </p>
                  )}
                </Section>

                <Section
                  icon="🧑"
                  title="NPCs"
                  count={
                    plan?.scenes?.reduce(
                      (sum: number, s: { actors?: unknown[] }) =>
                        sum + (s.actors?.length || 0),
                      0
                    ) || 0
                  }
                >
                  {plan?.scenes?.some(
                    (s: { actors?: unknown[] }) => (s.actors?.length ?? 0) > 0
                  ) ? (
                    plan.scenes.flatMap(
                      (
                        scene: { actors?: unknown[]; scene_name?: string },
                        sceneIdx: number
                      ) =>
                        (scene.actors || []).map((a: any) => (
                          <div
                            key={a.id || `npc-${sceneIdx}-${a.name}`}
                            className="flex items-center justify-between bg-input rounded-lg px-3 py-2 mb-2 group"
                          >
                            <div className="flex items-center gap-2">
                              <span>{ACTOR_ICONS[a.actor_type] || '👤'}</span>
                              <span className="text-white">{a.name}</span>
                              <span className="text-xs text-muted">
                                ({a.role || a.actor_type || 'character'})
                              </span>
                            </div>
                            <span className="text-xs text-muted">
                              {scene.scene_name}
                            </span>
                          </div>
                        ))
                    )
                  ) : (
                    <p className="text-white/40 text-sm">No NPCs yet</p>
                  )}
                </Section>

                <Section
                  icon="🎯"
                  title="Challenges"
                  count={
                    plan?.scenes?.reduce(
                      (sum: number, s: { challenges?: unknown[] }) =>
                        sum + (s.challenges?.length || 0),
                      0
                    ) || 0
                  }
                >
                  {plan?.scenes?.some(
                    (s: { challenges?: unknown[] }) =>
                      (s.challenges?.length ?? 0) > 0
                  ) ? (
                    plan.scenes.flatMap(
                      (
                        scene: { challenges?: unknown[]; scene_name?: string },
                        sceneIdx: number
                      ) =>
                        (scene.challenges || []).map((c: any) => (
                          <div
                            key={c.id || `ch-${sceneIdx}-${c.name}`}
                            className="flex items-center justify-between bg-input rounded-lg px-3 py-2 mb-2 group"
                          >
                            <span className="text-white">
                              {c.name}{' '}
                              <span className="text-xs text-muted">
                                ({c.mechanic_type || 'challenge'})
                              </span>
                            </span>
                            <span className="text-xs text-muted">
                              {scene.scene_name}
                            </span>
                          </div>
                        ))
                    )
                  ) : (
                    <p className="text-white/40 text-sm">No challenges yet</p>
                  )}
                </Section>

                <Section
                  icon="🔀"
                  title="Routes"
                  count={plan?.routes?.length || 0}
                >
                  {plan?.routes?.length ? (
                    plan.routes.map((r: any, idx: number) => (
                      <div
                        key={r.id || `route-${idx}`}
                        className="flex items-center justify-between bg-input rounded-lg px-3 py-2 mb-2 group"
                      >
                        <span className="text-white">
                          {r.from_scene_name ||
                            sceneIdToName[r.from_scene_id] ||
                            '?'}{' '}
                          →{' '}
                          {r.to_scene_name ||
                            sceneIdToName[r.to_scene_id] ||
                            '?'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-white/40 text-sm">No routes yet</p>
                  )}
                </Section>
              </>
            )}
          </div>
        </div>

        {/* ═══════ RIGHT: Tools & Info Panels ═══════ */}
        <div className="space-y-3 overflow-auto">
          {/* Validation Panel */}
          <ApiValidationPanel
            validationResult={validationResult}
            isValidating={isValidating}
            onValidate={runValidation}
            maxHeight={280}
          />

          {/* Edit History Timeline */}
          <EditHistoryTimeline
            history={editHistory}
            currentVersion={gameVersion}
            maxItems={6}
            compact={true}
          />

          {/* Mechanics Browser */}
          <MechanicsBrowser compact={true} />

          {/* NPC Roles Browser */}
          <NpcRolesBrowser compact={true} />
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-card border border-card-border rounded-xl px-4 py-3 shadow-xl z-50">
          <p className="text-white text-sm">{toast}</p>
        </div>
      )}

      {showPreview &&
        (() => {
          const useApiMode = syncedScenes.length > 0
          console.log(
            '[Editor] Preview mode:',
            useApiMode
              ? 'API (fetching from kinship-assets)'
              : 'Plan (local manifest)'
          )

          return (
            <GameTestModal
              onClose={() => setShowPreview(false)}
              scenes={(plan?.scenes || []).map((s: any, idx: number) => {
                // Use synced scene ID if available (real DB UUID)
                const syncedScene = syncedScenes.find(
                  (ss: any) => ss.name === s.scene_name || ss.index === idx
                )
                const realId =
                  syncedScene?.id || s.id || s.scene_id || `scene_${idx}`

                console.log('[Editor] Passing scene to preview:', {
                  id: realId,
                  scene_id: realId,
                  scene_name: s.scene_name,
                  hasSyncedId: !!syncedScene,
                })
                return {
                  ...s,
                  id: realId,
                  scene_id: realId,
                  name: s.scene_name || `Scene ${idx + 1}`,
                }
              })}
              actors={[]}
              challenges={[]}
              quests={[]}
              routes={[]}
              plan={plan}
              // IMPORTANT: Only pass previewData if scenes are NOT synced to DB
              // When synced, omit previewData to trigger API mode (fetches from kinship-assets)
              previewData={
                useApiMode
                  ? undefined // API mode: GameTestModal will call api.getSceneManifest()
                  : {
                      // Plan mode: build manifest locally
                      scenes: (plan?.scenes || []).map(
                        (s: any, idx: number) => ({
                          ...s,
                          id: s.id || s.scene_id || `scene_${idx}`,
                          scene_name: s.scene_name || `Scene ${idx + 1}`,
                          scene_type: s.scene_type || 'forest',
                        })
                      ),
                      warnings: [],
                    }
              }
            />
          )
        })()}
    </>
  )
}
