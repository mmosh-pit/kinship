'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '@/lib/api'

const FLUTTER_PREVIEW_URL =
  process.env.NEXT_PUBLIC_FLUTTER_PREVIEW_URL || '/flutter_web/index.html'

// Returns a per-game localStorage key so each game's scene progress is stored
// independently and never overwritten by a different game.
// Format: 'kinship_resume_scene_<gameId>'
const resumeSceneKey = (gameId: string | null | undefined): string =>
  gameId ? `kinship_resume_scene_${gameId}` : 'kinship_resume_scene_default'

const ACTOR_ICONS: Record<string, string> = {
  character: '🧑',
  creature: '🦊',
  collectible: '💎',
  obstacle: '🪨',
  interactive: '🔧',
  ambient: '🦋',
  enemy: '⚔️',
  companion: '🐾',
}
const SCENE_ICONS: Record<string, string> = {
  underwater: '🌊',
  forest: '🌲',
  cave: '🕳️',
  village: '🏘️',
  castle: '🏰',
  beach: '🏖️',
  mountain: '⛰️',
  desert: '🏜️',
  space: '🚀',
  arctic: '❄️',
  jungle: '🌴',
  garden: '🌸',
  ruins: '🏛️',
  swamp: '🐊',
  volcano: '🌋',
}
const HEARTS_COLORS: Record<string, string> = {
  H: 'bg-yellow-400',
  E: 'bg-pink-400',
  A: 'bg-purple-400',
  R: 'bg-red-400',
  T: 'bg-blue-400',
  Si: 'bg-accent',
  So: 'bg-green-400',
}

// ─── Types ──────────────────────────

interface GameTestProps {
  onClose: () => void
  scenes?: any[]
  actors?: any[]
  challenges?: any[]
  quests?: any[]
  routes?: any[]
  plan?: any
  previewData?: { scenes: any[]; warnings?: string[] }
}

// ─── Game Player ──────────────────────────

export default function GameTestModal({
  onClose,
  scenes,
  actors: dbActors,
  challenges: dbChallenges,
  quests: dbQuests,
  routes: dbRoutes,
  plan,
  previewData,
}: GameTestProps) {
  const isPlanMode = !!previewData?.scenes?.length
  const displayScenes = isPlanMode ? previewData!.scenes : scenes || []

  // Game ID shared by all scenes in this game — namespaces localStorage so
  // different games never overwrite each other's scene progress.
  const currentGameId: string =
    displayScenes[0]?.game_id ||
    displayScenes[0]?.id ||
    'default'

  // ─── Scene data resolver ──────────────

  const getSceneData = useCallback(
    (sceneIdx: number) => {
      const scene = displayScenes[sceneIdx]
      if (!scene) return { actors: [], challenges: [], quests: [], routes: [] }
      if (isPlanMode && plan) {
        const ps = plan.scenes?.[sceneIdx] || {}
        const sceneName = ps.scene_name || scene.scene_name
        return {
          actors: ps.actors || ps.npcs || [],
          challenges: ps.challenges || [],
          quests: ps.quests || [],
          routes: (plan.routes || []).filter(
            (r: any) => r.from_scene_name === sceneName
          ),
        }
      } else {
        const sceneId = scene?.id
        return {
          actors: (dbActors || []).filter((a: any) => a.scene_id === sceneId),
          challenges: (dbChallenges || []).filter(
            (c: any) => c.scene_id === sceneId
          ),
          quests: (dbQuests || []).filter((q: any) => q.scene_id === sceneId),
          routes: (dbRoutes || []).filter((r: any) => r.from_scene === sceneId),
        }
      }
    },
    [
      displayScenes,
      isPlanMode,
      plan,
      dbActors,
      dbChallenges,
      dbQuests,
      dbRoutes,
    ]
  )

  // ─── Game State ──────────────

  const [activeScene, setActiveScene] = useState<number>(() => {
    try {
      const key = currentGameId
        ? `kinship_resume_scene_${currentGameId}`
        : 'kinship_resume_scene_default'
      const raw = localStorage.getItem(key)
      if (raw && displayScenes.length > 0) {
        let savedId: string | null = null
        let savedName: string | null = null
        try {
          const parsed = JSON.parse(raw)
          savedId = parsed.id || null
          savedName = parsed.name || null
        } catch (_) {
          savedId = raw // old plain-string format
        }
        const idx = displayScenes.findIndex((s: any) => {
          if (savedId && (s.id === savedId || s.scene_id === savedId)) return true
          if (savedName) {
            const sName = (s.scene_name || s.name || '').toLowerCase()
            return sName === savedName.toLowerCase()
          }
          return false
        })
        if (idx > 0) return idx
      }
    } catch (_) {
      // localStorage unavailable — fall through to scene 0
    }
    return 0
  })
  const [hearts, setHearts] = useState<Record<string, number>>({
    H: 0,
    E: 0,
    A: 0,
    R: 0,
    T: 0,
    Si: 0,
    So: 0,
  })
  const [completedChallenges, setCompletedChallenges] = useState<Set<string>>(
    new Set()
  )
  const [completedQuests, setCompletedQuests] = useState<Set<string>>(new Set())
  const [collectedItems, setCollectedItems] = useState<Set<string>>(new Set())
  const [gameLog, setGameLog] = useState<string[]>([])

  // Interaction state
  const [overlay, setOverlay] = useState<
    'none' | 'dialogue' | 'challenge' | 'result' | 'collect' | 'transition'
  >('none')
  const [activeActor, setActiveActor] = useState<any>(null)
  const [dialogueNodeId, setDialogueNodeId] = useState('start')
  const [activeChallenge, setActiveChallenge] = useState<any>(null)
  const [challengeAnswers, setChallengeAnswers] = useState<
    Record<number, string>
  >({})
  const [challengeResult, setChallengeResult] = useState<any>(null)
  // Interaction challenge state
  const [interactionTargets, setInteractionTargets] = useState<string[]>([])
  const [interactionProgress, setInteractionProgress] = useState<Set<string>>(
    new Set()
  )
  // Memory challenge state
  const [memoryCards, setMemoryCards] = useState<
    {
      id: string
      value: string
      pair: number
      flipped: boolean
      matched: boolean
    }[]
  >([])
  const [memoryFlipped, setMemoryFlipped] = useState<number[]>([])
  // Sorting challenge state
  const [sortingItems, setSortingItems] = useState<string[]>([])
  const [draggedItem, setDraggedItem] = useState<number | null>(null)
  const [transitionTarget, setTransitionTarget] = useState<{
    idx: number
    name: string
  } | null>(null)
  const [collectMsg, setCollectMsg] = useState('')
  const [notification, setNotification] = useState<{
    text: string
    type: 'success' | 'info' | 'reward'
  } | null>(null)

  // Flutter
  const [hasVisualContent, setHasVisualContent] = useState(false)
  const [loadingScene, setLoadingScene] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const manifestRef = useRef<any>(null)

  const addLog = (msg: string) =>
    setGameLog((prev) => [...prev.slice(-30), msg])
  const notify = (
    text: string,
    type: 'success' | 'info' | 'reward' = 'info'
  ) => {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 3000)
  }

  // ─── Flutter ──────────────

  const NATIVE_MECHANICS = new Set([
    'quiz',
    'matching',
    'memory',
    'sorting',
    'exploration',
    'path_building',
    'construction',
    'navigation',
    'collection',
    'simulation',
    'puzzle',
    'multiple_choice',
    'flip',
    'sequence',
    'order',
  ])

  const normaliseChallenge = useCallback(
    (c: any, idx: number, sceneIdx: number) => {
      const rawMechanic = (c.mechanic_type || 'exploration').toLowerCase()
      const mechanic = NATIVE_MECHANICS.has(rawMechanic)
        ? rawMechanic
        : 'exploration'

      let scoringRubric = c.scoring_rubric || {}
      if (!scoringRubric?.facet_deltas && c.on_complete?.hearts_delta) {
        scoringRubric = { facet_deltas: c.on_complete.hearts_delta }
      }
      if (!scoringRubric?.facet_deltas && c.base_delta) {
        const facets: Record<string, number> = {}
        ;(c.facets || ['H']).forEach((f: string) => {
          facets[f] = c.base_delta
        })
        scoringRubric = { facet_deltas: facets }
      }

      const feedback =
        c.feedback && Object.keys(c.feedback).length > 0
          ? c.feedback
          : {
              correct: c.on_complete?.show_message || 'Well done! 🎉',
              incorrect: 'Keep trying! 💪',
            }

      let correctAnswers = c.correct_answers || []
      if (correctAnswers.length === 0) {
        if (mechanic === 'quiz') {
          correctAnswers = [
            {
              question: c.description || c.name,
              options: [
                'Yes, I understand',
                'Tell me more',
                'I need help',
                'Skip for now',
              ],
              correct_index: 0,
              answer: 'Yes, I understand',
            },
          ]
        } else if (mechanic === 'matching') {
          correctAnswers = (c.facets || ['H', 'E'])
            .slice(0, 3)
            .map((f: string, i: number) => ({
              source: `Step ${i + 1}`,
              target:
                (
                  {
                    H: 'Heart',
                    E: 'Energy',
                    A: 'Action',
                    R: 'Resolve',
                    T: 'Trust',
                  } as any
                )[f] || f,
            }))
        } else if (mechanic === 'sorting') {
          const steps = (
            c.success_conditions ||
            c.steps?.map((s: any) => s.description) || [
              'Start',
              'Middle',
              'End',
            ]
          )
            .slice(0, 4)
            .map((s: string) => s.replace(/_/g, ' '))
          correctAnswers = steps.map((s: string) => ({ source: s, value: s }))
        }
      }

      const zoneX = c.trigger?.zone?.x ?? 5 + (idx % 3) * 3
      const zoneY = c.trigger?.zone?.y ?? 5 + Math.floor(idx / 3) * 3

      return {
        id: c.id || `challenge_${sceneIdx}_${idx}`,
        name: c.name || 'Challenge',
        mechanic_type: mechanic,
        description: c.description || '',
        difficulty: typeof c.difficulty === 'number' ? c.difficulty : 1,
        correct_answers: correctAnswers,
        scoring_rubric: scoringRubric,
        feedback,
        on_complete: c.on_complete || {},
        trigger: {
          type: 'zone_enter',
          zone: { x: zoneX, y: zoneY, radius: c.trigger?.zone?.radius ?? 3 },
        },
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  )

  const enrichManifestForFlutter = useCallback(
    (rawManifest: any, sceneIdx: number) => {
      if (!rawManifest) return rawManifest

      if (isPlanMode) {
        return rawManifest
      }

      const sd = getSceneData(sceneIdx)

      const manifestChallenges = rawManifest.challenges || []
      const manifestQuests = rawManifest.quests || []
      const manifestRoutes = rawManifest.routes || []
      const manifestNpcs = rawManifest.npcs || []

      const normalisedChallenges =
        manifestChallenges.length > 0
          ? manifestChallenges.map((c: any, i: number) =>
              normaliseChallenge(c, i, sceneIdx)
            )
          : (sd.challenges || []).map((c: any, i: number) =>
              normaliseChallenge(c, i, sceneIdx)
            )

      const normalisedRoutes =
        manifestRoutes.length > 0
          ? manifestRoutes.map((r: any) => ({
              id: r.id || `route_${sceneIdx}`,
              name: r.name || '',
              from_scene_name: r.from_scene_name || '',
              to_scene_name: r.to_scene_name || r.to_scene || '',
              from_scene_id: r.from_scene_id || '',
              to_scene_id: r.to_scene_id || '',
              to_scene: r.to_scene_name || r.to_scene || r.to_scene_id || '',
              trigger: r.trigger || { type: 'zone_enter' },
              trigger_type: r.trigger_type || 'zone_enter',
              conditions: r.conditions || r.conditions_list || [],
            }))
          : (sd.routes || []).map((r: any) => ({
              id: r.id || `route_${sceneIdx}`,
              name: r.name || '',
              from_scene_name: r.from_scene_name || '',
              to_scene_name: r.to_scene_name || r.to_scene || '',
              from_scene_id: r.from_scene_id || '',
              to_scene_id: r.to_scene_id || '',
              to_scene: r.to_scene_name || r.to_scene || r.to_scene_id || '',
              trigger: r.trigger || { type: 'zone_enter' },
              trigger_type: r.trigger_type || 'zone_enter',
              conditions: r.conditions || r.conditions_list || [],
            }))

      const normalisedQuests =
        manifestQuests.length > 0
          ? manifestQuests.map((q: any) => ({
              id: q.id || q.name,
              name: q.name,
              description: q.description || '',
              facets: q.facet ? [q.facet] : q.facets || [],
              steps:
                q.objectives?.map((o: string) => ({
                  id: o,
                  action: o,
                  description: o,
                })) ||
                q.steps ||
                [],
              on_complete: q.on_complete || {},
            }))
          : (sd.quests || []).map((q: any) => ({
              id: q.id || q.name,
              name: q.name,
              description: q.description || '',
              facets: q.facet ? [q.facet] : q.facets || [],
              steps:
                q.objectives?.map((o: string) => ({
                  id: o,
                  action: o,
                  description: o,
                })) || [],
              on_complete: q.on_complete || {},
            }))

      const normalisedNpcs =
        manifestNpcs.length > 0
          ? manifestNpcs
          : (sd.actors || []).map((a: any, j: number) => ({
              id: a.id || `npc_${sceneIdx}_${j}`,
              name: a.name,
              display_name: a.display_name || a.name,
              role: a.role || '',
              facets: a.facet ? [a.facet] : a.facets || [],
              position: a.position || { x: 4 + j * 2, y: 10 },
              dialogue: {
                greeting:
                  a.dialogue?.greeting || a.greeting || `Hello! I'm ${a.name}.`,
                tree: a.dialogue?.tree || [],
              },
            }))

      return {
        ...rawManifest,
        npcs: normalisedNpcs,
        challenges: normalisedChallenges,
        routes: normalisedRoutes,
        quests: normalisedQuests,
      }
    },
    [isPlanMode, getSceneData, normaliseChallenge]
  )

  const sendToFlutter = useCallback(
    (m: any, sceneIdx?: number) => {
      if (!m || !iframeRef.current?.contentWindow) return
      try {
        const enriched = enrichManifestForFlutter(m, sceneIdx ?? activeScene)
        iframeRef.current.contentWindow.postMessage(
          { type: 'kinship:scene_update', manifest: enriched },
          '*'
        )
      } catch {}
    },
    [enrichManifestForFlutter, activeScene]
  )

  const loadSceneVisual = useCallback(
    (idx: number) => {
      const scene = displayScenes[idx]
      if (!scene) return
      setLoadingScene(true)
      setHasVisualContent(false)
      if (isPlanMode) {
        const ps = plan?.scenes?.[idx] || {}
        const sceneName = scene.scene_name || scene.name || `Scene ${idx + 1}`
        const actors = ps.actors || ps.npcs || []
        const challenges = ps.challenges || []
        const routes =
          plan?.routes?.filter((r: any) => r.from_scene_name === sceneName) ||
          []

        console.log(
          '[GameTestModal] Routes for scene:',
          sceneName,
          routes.map((r: any) => ({
            from: r.from_scene_name,
            to: r.to_scene_name,
            from_id: r.from_scene_id,
            to_id: r.to_scene_id,
          }))
        )

        const previewManifest = plan?.preview?.[idx]?.manifest || null
        const baseAssets = previewManifest?.asset_placements || []

        const spawnX =
          ps.layout?.player_spawn?.x ??
          previewManifest?.scene?.spawn_points?.[0]?.x ??
          8
        const spawnY =
          ps.layout?.player_spawn?.y ??
          previewManifest?.scene?.spawn_points?.[0]?.y ??
          14

        const m: any = {
          id: scene.id || `plan_scene_${idx}`,
          game_id: scene.game_id || scene.id || `plan_scene_${idx}`,
          scene_name: sceneName,
          scene_type: scene.scene_type || 'forest',
          description: scene.description || '',
          grid_width: previewManifest?.scene?.dimensions?.width || 16,
          grid_height: previewManifest?.scene?.dimensions?.height || 16,
          spawn_points: [
            { id: 'main_entry', x: spawnX, y: spawnY, facing: 'up' },
          ],
          ambient: { lighting: ps.lighting || 'day' },
          asset_placements: baseAssets,
          npcs: actors.map((a: any, j: number) => ({
            id: a.id || `npc_${idx}_${j}`,
            name: a.name,
            display_name: a.name,
            actor_type: a.actor_type || 'character',
            role: a.role || '',
            facets: a.facet ? [a.facet] : [],
            position: a.position || { x: 4 + j * 2, y: 10 },
            dialogue: {
              greeting:
                a.dialogue?.greeting || a.greeting || `Hello! I'm ${a.name}.`,
              tree: a.dialogue?.tree || [],
            },
          })),
          challenges: challenges.map((c: any, j: number) => {
            const zoneX = c.trigger?.zone?.x ?? 5 + (j % 3) * 3
            const zoneY = c.trigger?.zone?.y ?? 5 + Math.floor(j / 3) * 3
            const radius = c.trigger?.zone?.radius ?? 3

            const _NATIVE = new Set([
              'quiz', 'matching', 'memory', 'sorting', 'exploration',
              'path_building', 'construction', 'navigation', 'collection',
              'simulation', 'puzzle', 'multiple_choice', 'flip', 'sequence', 'order',
            ])
            const rawMechanic = (c.mechanic_type || 'exploration').toLowerCase()
            const mechanic = _NATIVE.has(rawMechanic) ? rawMechanic : 'exploration'

            let scoringRubric = c.scoring_rubric || {}
            if (!scoringRubric?.facet_deltas && c.on_complete?.hearts_delta) {
              scoringRubric = { facet_deltas: c.on_complete.hearts_delta }
            }

            const feedback = c.feedback || {
              correct: c.on_complete?.show_message || 'Well done! 🎉',
              incorrect: 'Keep trying! 💪',
            }

            let correctAnswers = c.correct_answers || []
            if (correctAnswers.length === 0) {
              if (mechanic === 'quiz' || mechanic === 'multiple_choice') {
                correctAnswers = [
                  {
                    question: c.description || c.name,
                    options: ['Yes, I understand', 'Tell me more', 'I need help', 'Skip for now'],
                    correct_index: 0,
                    answer: 'Yes, I understand',
                  },
                ]
              } else if (mechanic === 'matching') {
                const facets = c.facets || ['H', 'E']
                correctAnswers = facets.slice(0, 2).map((f: string, i: number) => ({
                  source: `Step ${i + 1}`,
                  target: f === 'H' ? 'Heart' : f === 'E' ? 'Energy' : f === 'A' ? 'Action' : f === 'R' ? 'Resolve' : f === 'T' ? 'Trust' : f,
                }))
              } else if (mechanic === 'sorting') {
                const steps = (c.success_conditions || ['Start', 'Middle', 'Finish'])
                  .slice(0, 4)
                  .map((s: string) => s.replace(/_/g, ' '))
                correctAnswers = steps.map((s: string) => ({ source: s, value: s }))
              }
            }

            return {
              id: c.id || `challenge_${idx}_${j}`,
              name: c.name,
              mechanic_type: mechanic,
              description: c.description || '',
              difficulty: typeof c.difficulty === 'number' ? c.difficulty : 1,
              correct_answers: correctAnswers,
              scoring_rubric: scoringRubric,
              feedback,
              on_complete: c.on_complete || {},
              trigger: { type: 'zone_enter', zone: { x: zoneX, y: zoneY, radius } },
            }
          }),
          quests: (plan?.scenes?.[idx]?.quests || []).map((q: any) => ({
            id: q.id || q.name,
            name: q.name,
            description: q.description || '',
            given_by: q.given_by || null,
            facets: q.facet ? [q.facet] : [],
            difficulty: 1,
            steps: q.objectives?.map((o: string) => ({ id: o, action: o, description: o })) || [],
            on_complete: q.on_complete || {},
          })),
          routes: routes.map((r: any) => ({
            id: r.id || r.from_scene_id ? `${r.from_scene_id}_${r.to_scene_id}` : `route_${idx}`,
            name: r.name || `${r.from_scene_name} → ${r.to_scene_name}`,
            from_scene_name: r.from_scene_name || '',
            to_scene_name: r.to_scene_name || r.to_scene || '',
            from_scene_id: r.from_scene_id || '',
            to_scene_id: r.to_scene_id || '',
            to_scene: r.to_scene_name || r.to_scene || '',
            label: r.label || '',
            trigger: r.trigger || { type: 'zone_enter' },
            trigger_type: r.trigger_type || 'zone_enter',
            conditions: r.conditions || [],
          })),
        }

        manifestRef.current = m
        setHasVisualContent(actors.length > 0)
        setLoadingScene(false)
        setTimeout(() => sendToFlutter(m, idx), 300)
      } else {
        console.log('[GameTestModal] 🔍 LOAD SCENE DIAGNOSTIC', {
          requestedIdx: idx,
          requestedSceneId: scene.id,
          requestedSceneName: scene.scene_name || scene.name,
          allDisplayScenes: displayScenes.map((s: any, i: number) => ({
            index: i,
            id: s.id,
            scene_id: s.scene_id,
            name: s.scene_name || s.name,
          })),
        })
        console.log('[GameTestModal] Fetching scene from API:', {
          sceneId: scene.id,
          sceneName: scene.scene_name || scene.name,
        })
        api
          .getSceneManifest(scene.id)
          .then((data: any) => {
            const raw = data?.gcsManifest || data || null
            const gameIdFromResponse =
              data?.scene?.game_id ||
              data?.game_id ||
              raw?.scene?.game_id ||
              raw?.game_id ||
              null
            const m = raw
              ? { ...raw, game_id: raw.game_id ?? gameIdFromResponse }
              : null
            manifestRef.current = m
            const assets =
              m?.assets ||
              m?.placed_assets ||
              m?.scene_assets ||
              m?.asset_placements ||
              []
            setHasVisualContent(Array.isArray(assets) && assets.length > 0)
            setTimeout(() => sendToFlutter(m, idx), 300)
          })
          .catch(() => {
            manifestRef.current = null
            setHasVisualContent(false)
          })
          .finally(() => setLoadingScene(false))
      }
    },
    [displayScenes, isPlanMode, sendToFlutter]
  )

  useEffect(() => {
    loadSceneVisual(activeScene)
  }, [activeScene, loadSceneVisual, iframeKey])

  // ─── Reset ──────────────

  const resetGame = useCallback(() => {
    // Clear stored scene so reset always starts from Scene 1
    try { localStorage.removeItem(resumeSceneKey(currentGameId)) } catch (_) {}
    setActiveScene(0)
    setHearts({ H: 0, E: 0, A: 0, R: 0, T: 0, Si: 0, So: 0 })
    setCompletedChallenges(new Set())
    setCompletedQuests(new Set())
    setCollectedItems(new Set())
    setOverlay('none')
    setActiveActor(null)
    setActiveChallenge(null)
    setChallengeResult(null)
    setGameLog([])
    setIframeKey((k) => k + 1)
  }, [currentGameId])

  useEffect(() => {
    const h = (e: MessageEvent) => {
      // ── Flutter ready — send the current scene manifest ──────────────────
      if (e.data?.type === 'kinship:flutter_ready' && manifestRef.current) {
        setTimeout(() => sendToFlutter(manifestRef.current), 200)
      }

      // ── Flutter reset button → full React reset ────────────────────────
      // Flutter sends 'kinship:game_reset' from PreviewBridge.notifyGameReset()
      // when the in-game reset/retry button is pressed.
      //
      // Without this handler, Flutter clears its own SharedPreferences but
      // React keeps activeScene pointing at Scene 2 and localStorage still
      // holds the persisted resume-scene entry — so the next load resumes
      // from Scene 2 instead of starting clean from Scene 1.
      //
      // resetGame() clears localStorage, resets all React state, and increments
      // iframeKey which reloads the Flutter iframe fully from Scene 1.
      if (e.data?.type === 'kinship:game_reset') {
        console.log('[GameTestModal] ✅ kinship:game_reset received — resetting to Scene 1')
        resetGame()
        return
      }

      // ── Flutter requesting next scene (plan-mode scene transition) ────────
      if (e.data?.type === 'kinship:scene_request') {
        const requestedId: string = e.data.sceneId || ''
        const requestedName: string =
          e.data.sceneName || e.data.scene_name || ''

        console.log('[GameTestModal] Scene transition requested:', {
          requestedId,
          requestedName,
        })

        if (!requestedName && !requestedId) {
          console.warn('[GameTestModal] No scene identifier provided')
          return
        }

        // ── Persist immediately for resume ────────────────────────────────
        try {
          const saveData = JSON.stringify({
            id: requestedId || null,
            name: requestedName || null,
          })
          localStorage.setItem(resumeSceneKey(currentGameId), saveData)
          console.log('[GameTestModal] Scene saved for resume:', saveData)
        } catch (_) {}

        // Find the scene index by ID or name
        const nextIdx = displayScenes.findIndex((s: any) => {
          if (requestedId && s.scene_id === requestedId) return true
          if (requestedId && s.id === requestedId) return true
          const sName = (s.scene_name || s.name || '').toLowerCase()
          return sName === requestedName.toLowerCase()
        })

        if (nextIdx === -1) {
          console.warn('[GameTestModal] Scene not found:', {
            requestedId,
            requestedName,
          })
          console.log(
            '[GameTestModal] Available scenes:',
            displayScenes.map((s: any) => ({
              id: s.scene_id || s.id,
              name: s.scene_name || s.name,
            }))
          )
          return
        }

        console.log('[GameTestModal] Switching to scene index:', nextIdx)
        setActiveScene(nextIdx)
      }
    }
    window.addEventListener('message', h)
    return () => window.removeEventListener('message', h)
  }, [sendToFlutter, displayScenes, setActiveScene, resetGame, currentGameId])

  // ─── Scene data ──────────────

  const sceneData = getSceneData(activeScene)
  const currentScene = displayScenes[activeScene]
  const sceneName = currentScene?.scene_name || currentScene?.name || ''
  const sceneType = currentScene?.scene_type || 'forest'
  const totalHearts = Object.values(hearts).reduce((a, b) => a + b, 0)

  const characters = sceneData.actors.filter(
    (a: any) =>
      a.actor_type === 'character' && (a.greeting || a.dialogue_tree?.length)
  )
  const creatures = sceneData.actors.filter(
    (a: any) => a.actor_type === 'creature'
  )
  const collectibles = sceneData.actors.filter(
    (a: any) => a.actor_type === 'collectible' && !collectedItems.has(a.name)
  )
  const obstacles = sceneData.actors.filter(
    (a: any) => a.actor_type === 'obstacle'
  )
  const interactives = sceneData.actors.filter(
    (a: any) => a.actor_type === 'interactive'
  )
  const companions = sceneData.actors.filter(
    (a: any) => a.actor_type === 'companion'
  )
  const ambients = sceneData.actors.filter(
    (a: any) => a.actor_type === 'ambient'
  )
  const openChallenges = sceneData.challenges.filter(
    (c: any) => !completedChallenges.has(c.name)
  )
  const doneChallenges = sceneData.challenges.filter((c: any) =>
    completedChallenges.has(c.name)
  )

  // ─── Route logic ──────────────

  const isRouteLocked = (r: any) => {
    const conds = r.conditions || []
    if (!conds.length) {
      if (r.trigger_type === 'quest_complete')
        return !completedQuests.has(r.trigger_value)
      if (r.trigger_type === 'challenge_complete')
        return !completedChallenges.has(r.trigger_value)
      if (r.trigger_type === 'hearts_threshold')
        return totalHearts < (parseInt(r.trigger_value) || 0)
      return false
    }
    return conds.some(
      (c: any) =>
        (c.type === 'quest_complete' && !completedQuests.has(c.quest_name)) ||
        (c.type === 'challenge_complete' &&
          !completedChallenges.has(c.challenge_name)) ||
        (c.type === 'hearts_threshold' && totalHearts < (c.value || 0))
    )
  }

  // ─── Navigate ──────────────

  const travelToScene = (target: string) => {
    const idx = displayScenes.findIndex(
      (s: any) =>
        s.id === target || s.scene_name === target || s.name === target
    )
    if (idx < 0) return
    const name =
      displayScenes[idx]?.scene_name || displayScenes[idx]?.name || 'scene'
    setTransitionTarget({ idx, name })
    setOverlay('transition')
    addLog(`Traveling to ${name}...`)
    setTimeout(() => {
      setActiveScene(idx)
      setOverlay('none')
      setTransitionTarget(null)
      setActiveActor(null)
      setActiveChallenge(null)
      setChallengeResult(null)
      addLog(`Arrived at ${name}`)
    }, 1200)
  }

  // ─── Dialogue ──────────────

  const startDialogue = (actor: any) => {
    setActiveActor(actor)
    setDialogueNodeId('start')
    setOverlay('dialogue')
    addLog(`Talking to ${actor.name}`)
  }

  const dialogueNode = activeActor?.dialogue_tree?.find(
    (n: any) => n.id === dialogueNodeId
  )

  const pickDialogueOption = (opt: any) => {
    if (opt.is_correct) {
      awardHearts({ E: 2 })
      notify('+2 Empathy', 'reward')
    }
    if (opt.action?.startsWith('start_quest:')) {
      const qn = opt.action.split(':')[1]
      notify(`Quest started: ${qn}`, 'info')
      addLog(`Quest started: ${qn}`)
    }
    if (opt.next_id) {
      setDialogueNodeId(opt.next_id)
    } else {
      setOverlay('none')
      setActiveActor(null)
    }
  }

  // ─── Challenge ──────────────

  const startChallenge = (ch: any) => {
    setActiveChallenge(ch)
    setChallengeAnswers({})
    setChallengeResult(null)
    setInteractionProgress(new Set())
    setMemoryFlipped([])

    const mechanic = ch.mechanic_type?.toLowerCase() || 'quiz'

    if (mechanic === 'interaction' || mechanic === 'find' || mechanic === 'tap') {
      const targets = (ch.correct_answers || []).map(
        (a: any) => a.target || a.name || a.value
      )
      setInteractionTargets(targets)
      setOverlay('none')
      notify(`Find: ${targets.join(', ')}`, 'info')
    } else if (mechanic === 'memory' || mechanic === 'flip') {
      const pairs = ch.correct_answers || []
      const cards: any[] = []
      pairs.forEach((p: any, i: number) => {
        cards.push({ id: `${i}a`, value: p.source || p.question, flipped: false, matched: false, pair: i })
        cards.push({ id: `${i}b`, value: p.target || p.answer, flipped: false, matched: false, pair: i })
      })
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[cards[i], cards[j]] = [cards[j], cards[i]]
      }
      setMemoryCards(cards)
      setOverlay('challenge')
    } else if (mechanic === 'sorting' || mechanic === 'order' || mechanic === 'sequence') {
      const items = (ch.correct_answers || []).map(
        (a: any) => a.source || a.value || a.item
      )
      const shuffled = [...items].sort(() => Math.random() - 0.5)
      setSortingItems(shuffled)
      setOverlay('challenge')
    } else {
      setOverlay('challenge')
    }

    addLog(`Started challenge: ${ch.name}`)
  }

  const handleInteractionTap = (targetName: string) => {
    if (!activeChallenge || interactionTargets.length === 0) return
    const normalizedTarget = targetName.toLowerCase().trim()
    const isTarget = interactionTargets.some(
      (t) =>
        t.toLowerCase().trim() === normalizedTarget ||
        normalizedTarget.includes(t.toLowerCase().trim())
    )
    if (isTarget) {
      const newProgress = new Set(interactionProgress)
      newProgress.add(targetName)
      setInteractionProgress(newProgress)
      notify(`Found: ${targetName}! (${newProgress.size}/${interactionTargets.length})`, 'success')
      if (newProgress.size >= interactionTargets.length) {
        const deltas = activeChallenge.scoring_rubric?.facet_deltas || {}
        awardHearts(deltas)
        setCompletedChallenges((prev) => new Set([...prev, activeChallenge.name]))
        setChallengeResult({
          correct: interactionTargets.length,
          total: interactionTargets.length,
          passed: true,
          message: activeChallenge.feedback?.correct || 'All items found!',
          deltas,
        })
        setInteractionTargets([])
        setOverlay('result')
        addLog(`✅ Completed: ${activeChallenge.name}`)
      }
    } else {
      notify("Not what we're looking for...", 'info')
    }
  }

  const handleMemoryFlip = (index: number) => {
    if (memoryCards[index].matched || memoryCards[index].flipped) return
    if (memoryFlipped.length >= 2) return
    const newCards = [...memoryCards]
    newCards[index].flipped = true
    setMemoryCards(newCards)
    const newFlipped = [...memoryFlipped, index]
    setMemoryFlipped(newFlipped)
    if (newFlipped.length === 2) {
      const [first, second] = newFlipped
      const card1 = newCards[first]
      const card2 = newCards[second]
      if (card1.pair === card2.pair) {
        setTimeout(() => {
          const matched = [...memoryCards]
          matched[first].matched = true
          matched[second].matched = true
          setMemoryCards(matched)
          setMemoryFlipped([])
          if (matched.every((c) => c.matched)) {
            const deltas = activeChallenge?.scoring_rubric?.facet_deltas || {}
            awardHearts(deltas)
            setCompletedChallenges((prev) => new Set([...prev, activeChallenge!.name]))
            setChallengeResult({
              correct: matched.length / 2,
              total: matched.length / 2,
              passed: true,
              message: activeChallenge?.feedback?.correct || 'All pairs matched!',
              deltas,
            })
            setOverlay('result')
            addLog(`✅ Completed: ${activeChallenge?.name}`)
          }
        }, 500)
      } else {
        setTimeout(() => {
          const reset = [...memoryCards]
          reset[first].flipped = false
          reset[second].flipped = false
          setMemoryCards(reset)
          setMemoryFlipped([])
        }, 1000)
      }
    }
  }

  const handleSortingMove = (fromIndex: number, toIndex: number) => {
    const newItems = [...sortingItems]
    const [moved] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, moved)
    setSortingItems(newItems)
  }

  const submitSortingChallenge = () => {
    if (!activeChallenge) return
    const correctOrder = (activeChallenge.correct_answers || []).map(
      (a: any) => a.source || a.value || a.item
    )
    let correct = 0
    sortingItems.forEach((item, i) => {
      if (item === correctOrder[i]) correct++
    })
    const total = correctOrder.length
    const passed = correct === total
    const deltas = passed ? activeChallenge.scoring_rubric?.facet_deltas || {} : {}
    if (passed) {
      awardHearts(deltas)
      setCompletedChallenges((prev) => new Set([...prev, activeChallenge.name]))
      addLog(`✅ Completed: ${activeChallenge.name}`)
    }
    setChallengeResult({
      correct, total, passed,
      message: passed
        ? activeChallenge.feedback?.correct || 'Perfect order!'
        : activeChallenge.feedback?.incorrect || 'Not quite right',
      deltas,
    })
    setOverlay('result')
  }

  const submitChallenge = () => {
    if (!activeChallenge) return
    const answers = activeChallenge.correct_answers || []
    let correct = 0
    answers.forEach((a: any, i: number) => {
      const user = (challengeAnswers[i] || '').toLowerCase().trim()
      const right = (a.target || a.answer || a.value || '').toLowerCase().trim()
      if (user && (user === right || user.includes(right) || right.includes(user))) correct++
    })
    const total = answers.length || 1
    const score = correct / total
    const threshold = activeChallenge.scoring_rubric?.pass_threshold || 0.6
    const passed = score >= threshold
    const deltas = passed ? activeChallenge.scoring_rubric?.facet_deltas || {} : {}
    if (passed) {
      awardHearts(deltas)
      setCompletedChallenges((prev) => new Set([...prev, activeChallenge.name]))
      addLog(`✅ Completed: ${activeChallenge.name}`)
    } else {
      addLog(`❌ Failed: ${activeChallenge.name} (${correct}/${total})`)
    }
    const fb = activeChallenge.feedback || {}
    const msg = passed
      ? fb.correct || 'Excellent!'
      : score > 0
        ? (fb.partial || `${correct} of ${total} correct`)
            .replace('{correct_count}', String(correct))
            .replace('{total}', String(total))
        : fb.incorrect || 'Not quite — try again!'
    setChallengeResult({
      correct, total, passed, message: msg, deltas,
      explanations: answers.map((a: any) => a.explanation).filter(Boolean),
    })
    setOverlay('result')
  }

  // ─── Collect ──────────────

  const collectItem = (actor: any) => {
    setCollectedItems((prev) => new Set([...prev, actor.name]))
    const cfg = actor.behavior_config || {}
    const hd = cfg.hearts_delta || {}
    if (Object.keys(hd).length) awardHearts(hd)
    setCollectMsg(cfg.pickup_effect || `Collected ${actor.name}!`)
    setOverlay('collect')
    addLog(`Collected: ${actor.name}`)
    setTimeout(() => setOverlay('none'), 2000)
  }

  // ─── Hearts ──────────────

  const awardHearts = (deltas: Record<string, number>) => {
    setHearts((prev) => {
      const next = { ...prev }
      Object.entries(deltas).forEach(([f, d]) => {
        next[f] = (next[f] || 0) + (d as number)
      })
      return next
    })
  }

  // ─── Quest auto-complete ──────────────

  useEffect(() => {
    sceneData.quests.forEach((q: any) => {
      if (completedQuests.has(q.name)) return
      const cond = q.completion_conditions
      if (!cond) return
      const met =
        cond.type === 'challenge_complete' &&
        completedChallenges.has(cond.challenge_name)
      if (met) {
        setCompletedQuests((prev) => new Set([...prev, q.name]))
        const qd = q.rewards?.hearts_deltas || {}
        awardHearts(qd)
        notify(
          `📖 Quest complete: ${q.name}${q.rewards?.badge ? ' — 🏆 ' + q.rewards.badge : ''}`,
          'success'
        )
        addLog(`📖 Quest complete: ${q.name}`)
      }
    })
  }, [completedChallenges, completedQuests, sceneData.quests])

  // ─── Close — save current scene for next session ──────────────

  const handleClose = () => {
    try {
      if (currentScene) {
        const saveData = JSON.stringify({
          id: currentScene.id || currentScene.scene_id || null,
          name: currentScene.scene_name || currentScene.name || null,
        })
        localStorage.setItem(resumeSceneKey(currentGameId), saveData)
      }
    } catch (_) {}
    onClose()
  }

  // ─── Render ──────────────

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* ── HUD ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-sidebar/90 border-b border-card-border shrink-0 z-20">
        <div className="flex items-center gap-2">
          <span className="text-sm">{SCENE_ICONS[sceneType] || '🏞️'}</span>
          <span className="text-white text-sm font-bold">{sceneName}</span>
          {isPlanMode && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold">
              Draft
            </span>
          )}
        </div>
        {/* HEARTS mini bar */}
        <div className="flex items-center gap-1">
          {Object.entries(hearts).map(([f, v]) => (
            <div key={f} className="flex items-center gap-0.5" title={`${f}: ${v}`}>
              <div
                className={`w-1.5 h-4 rounded-full ${v > 0 ? HEARTS_COLORS[f] : 'bg-input'} transition-all`}
                style={{ height: `${Math.max(8, Math.min(v * 2 + 8, 24))}px` }}
              />
            </div>
          ))}
          <span className="text-[10px] text-pink-400/70 font-bold ml-1">
            ❤️{totalHearts}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={resetGame}
            className="text-[10px] text-white/40 hover:text-accent px-2 py-1"
          >
            🔄
          </button>
          <button
            onClick={handleClose}
            className="text-muted hover:text-white text-sm px-2"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Game Area ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Flutter background */}
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={`${FLUTTER_PREVIEW_URL}?mode=preview`}
          className="absolute inset-0 w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />

        {/* Loading */}
        {loadingScene && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/60">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Scene transition overlay */}
        {overlay === 'transition' && transitionTarget && (
          <div className="absolute inset-0 z-30 bg-black flex items-center justify-center animate-pulse">
            <div className="text-center">
              <p className="text-3xl mb-3">
                {SCENE_ICONS[displayScenes[transitionTarget.idx]?.scene_type] || '🏞️'}
              </p>
              <p className="text-white text-lg font-bold">{transitionTarget.name}</p>
              <p className="text-muted text-xs mt-1">Traveling...</p>
            </div>
          </div>
        )}

        {/* Notification toast */}
        {notification && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl text-sm font-bold shadow-lg animate-bounce ${
              notification.type === 'success'
                ? 'bg-emerald-500 text-white'
                : notification.type === 'reward'
                  ? 'bg-pink-500 text-white'
                  : 'bg-card text-accent border border-accent/40'
            }`}
          >
            {notification.text}
          </div>
        )}

        {/* Collect overlay */}
        {overlay === 'collect' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
            <div className="bg-sidebar border border-yellow-400/30 rounded-2xl px-6 py-5 text-center shadow-2xl animate-bounce">
              <p className="text-3xl mb-2">💎</p>
              <p className="text-white text-sm font-bold">{collectMsg}</p>
            </div>
          </div>
        )}

        {/* ── Dialogue Overlay ── */}
        {overlay === 'dialogue' && activeActor && (
          <div className="absolute inset-x-0 bottom-0 z-30 p-4">
            <div className="max-w-2xl mx-auto bg-sidebar/95 border border-indigo-500/30 rounded-2xl p-5 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-xl shrink-0">
                  🧑
                </div>
                <div>
                  <span className="text-white text-sm font-bold block">{activeActor.name}</span>
                  <span className="text-muted text-[10px]">{activeActor.role}</span>
                </div>
                <button
                  onClick={() => { setOverlay('none'); setActiveActor(null) }}
                  className="ml-auto text-white/40 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>
              {dialogueNode ? (
                <>
                  <p className="text-white/80 text-sm leading-relaxed mb-4 italic">
                    &ldquo;{dialogueNode.text}&rdquo;
                  </p>
                  <div className="space-y-2">
                    {(dialogueNode.options || []).map((opt: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => pickDialogueOption(opt)}
                        className="block w-full text-left px-4 py-2.5 bg-card hover:bg-indigo-500/15 border border-card-border/30 hover:border-indigo-400/40 rounded-xl text-sm text-white/70 hover:text-indigo-300 transition-all"
                      >
                        ▸ {opt.text}
                      </button>
                    ))}
                    {!dialogueNode.options?.length && (
                      <button
                        onClick={() => { setOverlay('none'); setActiveActor(null) }}
                        className="w-full px-4 py-2.5 bg-card rounded-xl text-sm text-muted hover:text-white transition-colors"
                      >
                        [Continue]
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-white/70 text-sm">{activeActor.name} nods thoughtfully.</p>
                  <button
                    onClick={() => { setOverlay('none'); setActiveActor(null) }}
                    className="mt-3 text-accent text-sm hover:text-accent"
                  >
                    [Continue]
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Bottom Action Bar ── */}
        {overlay === 'none' && (
          <div className="absolute inset-x-0 bottom-0 z-20">
            {currentScene?.description && (
              <div className="mx-4 mb-2 bg-sidebar/80 backdrop-blur-sm rounded-xl px-4 py-2 border border-card-border/30">
                <p className="text-white/70 text-xs line-clamp-2">
                  {currentScene.description}
                </p>
              </div>
            )}

            <div className="bg-sidebar/95 backdrop-blur-md border-t border-card-border px-4 py-3">
              {sceneData.quests.filter((q: any) => !completedQuests.has(q.name)).length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto">
                  {sceneData.quests
                    .filter((q: any) => !completedQuests.has(q.name))
                    .map((q: any, i: number) => (
                      <span key={i} className="text-[10px] px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 whitespace-nowrap shrink-0">
                        📖 {q.name}
                      </span>
                    ))}
                  {sceneData.quests
                    .filter((q: any) => completedQuests.has(q.name))
                    .map((q: any, i: number) => (
                      <span key={`d${i}`} className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400/60 whitespace-nowrap shrink-0">
                        ✅ {q.name} {q.rewards?.badge ? `🏆` : ''}
                      </span>
                    ))}
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-1">
                {characters.map((a: any, i: number) => (
                  <button
                    key={`ch${i}`}
                    onClick={() => startDialogue(a)}
                    className="shrink-0 flex items-center gap-2 px-3 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-400/40 rounded-xl transition-all group"
                  >
                    <span className="text-lg">🧑</span>
                    <div className="text-left">
                      <span className="text-white text-xs font-bold block">{a.name}</span>
                      <span className="text-indigo-400/50 text-[9px] group-hover:text-indigo-400">Talk →</span>
                    </div>
                  </button>
                ))}

                {creatures.map((a: any, i: number) => {
                  const isTarget = interactionTargets.some((t) => t.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t.toLowerCase()))
                  const isFound = interactionProgress.has(a.name)
                  return (
                    <button key={`cr${i}`}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all ${isFound ? 'bg-emerald-500/20 border border-emerald-400/30 opacity-50' : isTarget ? 'bg-amber-500/20 border border-amber-400/40 animate-pulse cursor-pointer hover:bg-amber-500/30' : 'bg-input border border-card-border/20'}`}
                    >
                      <span className="text-lg">{isFound ? '✅' : '🦊'}</span>
                      <div>
                        <span className="text-white text-xs font-semibold block">{a.name}</span>
                        <span className="text-[9px] text-muted">{isTarget && !isFound ? '👆 Tap!' : a.behavior_config?.observe_text || a.actor_type}</span>
                      </div>
                    </button>
                  )
                })}

                {collectibles.map((a: any, i: number) => {
                  const isTarget = interactionTargets.some((t) => t.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t.toLowerCase()))
                  const isFound = interactionProgress.has(a.name)
                  const isCollected = collectedItems.has(a.name)
                  if (isCollected) return null
                  return (
                    <button key={`col${i}`} onClick={() => collectItem(a)}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all ${isFound ? 'bg-emerald-500/20 border border-emerald-400/30' : isTarget ? 'bg-amber-500/20 border border-amber-400/40 animate-pulse' : 'bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 hover:border-yellow-400/40 animate-pulse'}`}
                    >
                      <span className="text-lg">{isFound ? '✅' : '💎'}</span>
                      <span className="text-white text-xs font-bold">{a.name}</span>
                      {isTarget && !isFound && <span className="text-[9px] text-amber-300">👆</span>}
                    </button>
                  )
                })}

                {obstacles.map((a: any, i: number) => {
                  const cond = a.behavior_config?.removal_condition || ''
                  const removed = cond.includes(':') && completedChallenges.has(cond.split(':')[1])
                  if (removed) return null
                  const isTarget = interactionTargets.some((t) => t.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t.toLowerCase()))
                  const isFound = interactionProgress.has(a.name)
                  return (
                    <button key={`ob${i}`}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all ${isFound ? 'bg-emerald-500/20 border border-emerald-400/30 opacity-50' : isTarget ? 'bg-amber-500/20 border border-amber-400/40 animate-pulse cursor-pointer' : 'bg-red-500/5 border border-red-500/15 opacity-60'}`}
                    >
                      <span className="text-lg">{isFound ? '✅' : '🪨'}</span>
                      <div>
                        <span className="text-white text-xs font-semibold">{a.name}</span>
                        <span className="text-[9px] text-accent/50 block">{isTarget && !isFound ? '👆 Tap!' : a.behavior_config?.blocking_description || 'Blocked'}</span>
                      </div>
                    </button>
                  )
                })}

                {interactives.map((a: any, i: number) => {
                  const isTarget = interactionTargets.some((t) => t.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t.toLowerCase()))
                  const isFound = interactionProgress.has(a.name)
                  return (
                    <button key={`int${i}`} onClick={() => handleInteractionTap(a.name)}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${isFound ? 'bg-emerald-500/20 border border-emerald-400/30' : isTarget ? 'bg-amber-500/20 border border-amber-400/40 animate-pulse' : 'bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-400/40'}`}
                    >
                      <span className="text-lg">{isFound ? '✅' : '🔧'}</span>
                      <div>
                        <span className="text-white text-xs font-semibold block">{a.name}</span>
                        <span className="text-[9px] text-cyan-400/60">{isTarget && !isFound ? '👆 Tap!' : 'Interact'}</span>
                      </div>
                    </button>
                  )
                })}

                {ambients.map((a: any, i: number) => {
                  const isTarget = interactionTargets.some((t) => t.toLowerCase().includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(t.toLowerCase()))
                  const isFound = interactionProgress.has(a.name)
                  if (!isTarget && !isFound && interactionTargets.length === 0) return null
                  return (
                    <button key={`amb${i}`} onClick={() => handleInteractionTap(a.name)}
                      className={`shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${isFound ? 'bg-emerald-500/20 border border-emerald-400/30' : isTarget ? 'bg-amber-500/20 border border-amber-400/40 animate-pulse' : 'bg-white/[0.1]/30 border border-card-border/20'}`}
                    >
                      <span className="text-lg">{isFound ? '✅' : '🦋'}</span>
                      <span className="text-white text-xs font-semibold">{a.name}</span>
                      {isTarget && !isFound && <span className="text-[9px] text-amber-300">👆</span>}
                    </button>
                  )
                })}

                {characters.length === 0 && collectibles.length === 0 && (
                  <p className="text-white/40 text-xs text-center py-2">
                    Look around... nothing to interact with here.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}