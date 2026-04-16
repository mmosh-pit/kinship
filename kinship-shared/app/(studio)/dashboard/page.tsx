'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useStudio } from '@/lib/studio-context'
import {
  useScenes,
  useNPCs,
  useChallenges,
  useQuests,
  useRoutes,
} from '@/hooks/useApi'
import PageHeader from '@/components/PageHeader'
import {
  Card,
  EmptyState,
  Spinner,
  FacetBadge,
  SceneIcon,
} from '@/components/UI'
import GameFlowGraph from '@/components/GameFlowGraph'
import ValidationPanel from '@/components/ValidationPanel'

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

interface ValidationIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  type: string
  message: string
  entity: string
  entityId?: string
  link?: string
}

interface ContentMetric {
  label: string
  value: number
  icon: string
  color: string
  bgColor: string
  link: string
}

// ═══════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════

const ACTOR_TYPE_META: Record<string, { icon: string; label: string }> = {
  character: { icon: '🧑', label: 'Characters' },
  creature: { icon: '🦊', label: 'Creatures' },
  collectible: { icon: '💎', label: 'Collectibles' },
  obstacle: { icon: '🪨', label: 'Obstacles' },
  interactive: { icon: '🔧', label: 'Interactives' },
  ambient: { icon: '🦋', label: 'Ambient' },
  enemy: { icon: '⚔️', label: 'Enemies' },
  companion: { icon: '🐾', label: 'Companions' },
}

const QUICK_ACTIONS = [
  {
    label: '✨ AI Game Planner',
    href: '/game-editor',
    desc: 'Build with AI assistance',
    primary: true,
  },
  { label: '🏞️ Create Scene', href: '/scenes/create', desc: 'Add a new scene' },
  {
    label: '🧑 Add Actor',
    href: '/npcs/create',
    desc: 'Create NPC or creature',
  },
  {
    label: '⚡ New Challenge',
    href: '/challenges/create',
    desc: 'Add learning challenge',
  },
  {
    label: '📖 Create Quest',
    href: '/quests/create',
    desc: 'Design story beat',
  },
  { label: '⚙️ Game Settings', href: '/game-settings', desc: 'Configure game' },
]

// ═══════════════════════════════════════════════
//  Validation Logic
// ═══════════════════════════════════════════════

function validateGame(
  game: any,
  scenes: any[],
  actors: any[],
  challenges: any[],
  quests: any[],
  routes: any[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const sceneIds = new Set(scenes.map((s) => s.id))

  // Game-level checks
  if (!game.starting_scene_id) {
    issues.push({
      id: 'no-starting-scene',
      severity: 'error',
      type: 'game',
      message: 'No starting scene set',
      entity: 'Game',
      link: '/game-settings',
    })
  } else if (!sceneIds.has(game.starting_scene_id)) {
    issues.push({
      id: 'invalid-starting-scene',
      severity: 'error',
      type: 'game',
      message: 'Starting scene no longer exists',
      entity: 'Game',
      link: '/game-settings',
    })
  }

  if (scenes.length === 0) {
    issues.push({
      id: 'no-scenes',
      severity: 'error',
      type: 'game',
      message: 'Game has no scenes',
      entity: 'Game',
      link: '/scenes/create',
    })
  }

  // Scene-level checks
  const scenesWithRoutesOut = new Set<string>()
  const scenesWithRoutesIn = new Set<string>()

  routes.forEach((r) => {
    if (r.from_scene) scenesWithRoutesOut.add(r.from_scene)
    if (r.to_scene) scenesWithRoutesIn.add(r.to_scene)
    if (r.bidirectional) {
      if (r.to_scene) scenesWithRoutesOut.add(r.to_scene)
      if (r.from_scene) scenesWithRoutesIn.add(r.from_scene)
    }
  })

  scenes.forEach((scene) => {
    const isStarting = scene.id === game.starting_scene_id

    // Dead end (no routes out, and not the only scene)
    if (!scenesWithRoutesOut.has(scene.id) && scenes.length > 1) {
      issues.push({
        id: `dead-end-${scene.id}`,
        severity: 'warning',
        type: 'scene',
        message: `No routes leading out (dead end)`,
        entity: scene.scene_name || scene.name || 'Untitled Scene',
        entityId: scene.id,
        link: `/scenes/${scene.id}`,
      })
    }

    // Unreachable (no routes in, and not starting scene)
    if (!scenesWithRoutesIn.has(scene.id) && !isStarting && scenes.length > 1) {
      issues.push({
        id: `unreachable-${scene.id}`,
        severity: 'warning',
        type: 'scene',
        message: `Unreachable (no routes leading in)`,
        entity: scene.scene_name || scene.name || 'Untitled Scene',
        entityId: scene.id,
        link: `/scenes/${scene.id}`,
      })
    }

    // Scene has no actors
    const sceneActors = actors.filter((a) => a.scene_id === scene.id)
    if (sceneActors.length === 0) {
      issues.push({
        id: `empty-scene-${scene.id}`,
        severity: 'info',
        type: 'scene',
        message: `Scene has no actors`,
        entity: scene.scene_name || scene.name || 'Untitled Scene',
        entityId: scene.id,
        link: `/scenes/${scene.id}`,
      })
    }
  })

  // Actor checks
  actors.forEach((actor) => {
    if (!actor.sprite_asset_id) {
      issues.push({
        id: `no-sprite-${actor.id}`,
        severity: 'warning',
        type: 'actor',
        message: `No sprite assigned`,
        entity: actor.name,
        entityId: actor.id,
        link: `/npcs/${actor.id}`,
      })
    }

    // Character without dialogue
    if (actor.actor_type === 'character') {
      if (!actor.dialogue_tree || actor.dialogue_tree.length === 0) {
        if (!actor.greeting) {
          issues.push({
            id: `no-dialogue-${actor.id}`,
            severity: 'info',
            type: 'actor',
            message: `Character has no dialogue`,
            entity: actor.name,
            entityId: actor.id,
            link: `/npcs/${actor.id}/edit`,
          })
        }
      }
    }
  })

  // Challenge checks
  challenges.forEach((ch) => {
    if (!ch.correct_answers || ch.correct_answers.length === 0) {
      issues.push({
        id: `no-answers-${ch.id}`,
        severity: 'error',
        type: 'challenge',
        message: `No correct answers defined`,
        entity: ch.name,
        entityId: ch.id,
        link: `/challenges/${ch.id}/edit`,
      })
    }

    if (!ch.hints || ch.hints.length === 0) {
      issues.push({
        id: `no-hints-${ch.id}`,
        severity: 'info',
        type: 'challenge',
        message: `No hints provided`,
        entity: ch.name,
        entityId: ch.id,
        link: `/challenges/${ch.id}/edit`,
      })
    }
  })

  // Quest checks
  quests.forEach((q) => {
    if (
      !q.completion_conditions ||
      Object.keys(q.completion_conditions).length === 0
    ) {
      issues.push({
        id: `no-completion-${q.id}`,
        severity: 'warning',
        type: 'quest',
        message: `No completion conditions`,
        entity: q.name,
        entityId: q.id,
        link: `/quests/${q.id}/edit`,
      })
    }

    if (!q.rewards || Object.keys(q.rewards).length === 0) {
      issues.push({
        id: `no-rewards-${q.id}`,
        severity: 'info',
        type: 'quest',
        message: `No rewards defined`,
        entity: q.name,
        entityId: q.id,
        link: `/quests/${q.id}/edit`,
      })
    }
  })

  // Route checks
  routes.forEach((r) => {
    if (r.from_scene && !sceneIds.has(r.from_scene)) {
      issues.push({
        id: `broken-route-from-${r.id}`,
        severity: 'error',
        type: 'route',
        message: `Source scene doesn't exist`,
        entity: r.name,
        entityId: r.id,
        link: `/routes/${r.id}`,
      })
    }
    if (r.to_scene && !sceneIds.has(r.to_scene)) {
      issues.push({
        id: `broken-route-to-${r.id}`,
        severity: 'error',
        type: 'route',
        message: `Destination scene doesn't exist`,
        entity: r.name,
        entityId: r.id,
        link: `/routes/${r.id}`,
      })
    }
  })

  return issues
}

// ═══════════════════════════════════════════════
//  Health Score Calculator
// ═══════════════════════════════════════════════

function calculateHealthScore(
  game: any,
  scenes: any[],
  actors: any[],
  challenges: any[],
  quests: any[],
  routes: any[],
  issues: ValidationIssue[]
): number {
  let score = 0
  const maxScore = 100

  // Base content (40 points)
  if (scenes.length > 0) score += 10
  if (scenes.length >= 3) score += 5
  if (actors.length > 0) score += 10
  if (actors.length >= 5) score += 5
  if (challenges.length > 0) score += 5
  if (quests.length > 0) score += 5

  // Configuration (20 points)
  if (game.starting_scene_id) score += 10
  if (game.name?.trim()) score += 5
  if (game.description?.trim()) score += 5

  // Connectivity (20 points)
  if (routes.length > 0) score += 10
  if (scenes.length > 1 && routes.length >= scenes.length - 1) score += 10

  // Quality (20 points)
  const actorsWithSprites = actors.filter((a) => a.sprite_asset_id).length
  if (actors.length > 0 && actorsWithSprites === actors.length) score += 10

  const challengesWithAnswers = challenges.filter(
    (c) => c.correct_answers?.length > 0
  ).length
  if (challenges.length > 0 && challengesWithAnswers === challenges.length)
    score += 5

  const errorCount = issues.filter((i) => i.severity === 'error').length
  if (errorCount === 0) score += 5

  return Math.min(score, maxScore)
}

// ═══════════════════════════════════════════════
//  Stat Card Component
// ═══════════════════════════════════════════════

function StatCard({ metric }: { metric: ContentMetric }) {
  return (
    <Link href={metric.link}>
      <div
        className={`rounded-2xl border p-4 ${metric.bgColor} hover:scale-[1.02] transition-transform cursor-pointer`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-lg">{metric.icon}</span>
          <span className={`text-2xl font-bold ${metric.color}`}>
            {metric.value}
          </span>
        </div>
        <div className="text-[10px] text-muted font-semibold">
          {metric.label}
        </div>
      </div>
    </Link>
  )
}

// ═══════════════════════════════════════════════
//  Health Score Ring
// ═══════════════════════════════════════════════

function HealthScoreRing({
  score,
  size = 120,
}: {
  score: number
  size?: number
}) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const getColor = (s: number) => {
    if (s >= 80) return '#10b981' // emerald
    if (s >= 60) return '#f59e0b' // amber
    if (s >= 40) return '#f97316' // orange
    return '#ef4444' // red
  }

  const getLabel = (s: number) => {
    if (s >= 80) return 'Excellent'
    if (s >= 60) return 'Good'
    if (s >= 40) return 'Needs Work'
    return 'Incomplete'
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-white/30"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{score}</span>
        <span className="text-[10px] text-white/70 font-semibold">
          {getLabel(score)}
        </span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Actor Breakdown Component
// ═══════════════════════════════════════════════

function ActorBreakdown({ actors }: { actors: any[] }) {
  const byType: Record<string, number> = {}
  actors.forEach((a) => {
    const t = a.actor_type || 'character'
    byType[t] = (byType[t] || 0) + 1
  })

  const types = Object.entries(byType).sort((a, b) => b[1] - a[1])

  if (types.length === 0) return null

  return (
    <div className="space-y-1.5">
      {types.map(([type, count]) => {
        const meta = ACTOR_TYPE_META[type] || { icon: '❓', label: type }
        const pct = Math.round((count / actors.length) * 100)
        return (
          <div key={type} className="flex items-center gap-2">
            <span className="text-sm w-6">{meta.icon}</span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-white/70">{meta.label}</span>
                <span className="text-[10px] text-muted">{count}</span>
              </div>
              <div className="h-1 bg-input rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent/60 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  HEARTS Coverage Component
// ═══════════════════════════════════════════════

function HeartsCoverage({
  actors,
  challenges,
  quests,
}: {
  actors: any[]
  challenges: any[]
  quests: any[]
}) {
  const facetCounts: Record<string, number> = {
    H: 0,
    E: 0,
    A: 0,
    R: 0,
    T: 0,
    Si: 0,
    So: 0,
  }

  actors.forEach((a) => {
    if (a.facet && facetCounts[a.facet] !== undefined) {
      facetCounts[a.facet]++
    }
  })

  challenges.forEach((c) => {
    ;(c.facets || []).forEach((f: string) => {
      if (facetCounts[f] !== undefined) facetCounts[f]++
    })
  })

  quests.forEach((q) => {
    if (q.facet && facetCounts[q.facet] !== undefined) {
      facetCounts[q.facet]++
    }
  })

  const total = Object.values(facetCounts).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const facetMeta: Record<string, { name: string; color: string }> = {
    H: { name: 'Harmony', color: '#10b981' },
    E: { name: 'Empowerment', color: '#f59e0b' },
    A: { name: 'Awareness', color: '#8b5cf6' },
    R: { name: 'Resilience', color: '#ef4444' },
    T: { name: 'Tenacity', color: '#3b82f6' },
    Si: { name: 'Self-insight', color: '#ec4899' },
    So: { name: 'Social', color: '#06b6d4' },
  }

  return (
    <div className="space-y-2">
      {Object.entries(facetCounts).map(([facet, count]) => {
        const meta = facetMeta[facet]
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        return (
          <div key={facet} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: meta.color }}
            >
              {facet}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-white/70">{meta.name}</span>
                <span className="text-[10px] text-muted">{count}</span>
              </div>
              <div className="h-1 bg-input rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: meta.color + '99',
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  MAIN DASHBOARD PAGE
// ═══════════════════════════════════════════════

export default function DashboardPage() {
  const { currentGame, currentPlatform, isInGame } = useStudio()
  const gameId = currentGame?.id

  const { data: scenes, loading: scenesLoading } = useScenes(undefined, gameId)
  const { data: actorsResponse, loading: actorsLoading } = useNPCs(
    gameId ? { game_id: gameId } : undefined
  )
  const { data: challengesResponse } = useChallenges(
    gameId ? { game_id: gameId } : undefined
  )
  const { data: quests } = useQuests(gameId ? { game_id: gameId } : undefined)
  const { data: routes } = useRoutes(gameId ? { game_id: gameId } : undefined)

  // Extract arrays from paginated responses
  const actors = actorsResponse?.data || []
  const challenges = challengesResponse?.data || []

  const loading = scenesLoading || actorsLoading

  // Compute validation issues
  const validationIssues = useMemo(() => {
    if (!currentGame || !scenes) return []
    return validateGame(
      currentGame,
      scenes || [],
      actors,
      challenges,
      quests || [],
      routes || []
    )
  }, [currentGame, scenes, actors, challenges, quests, routes])

  // Compute health score
  const healthScore = useMemo(() => {
    if (!currentGame) return 0
    return calculateHealthScore(
      currentGame,
      scenes || [],
      actors,
      challenges,
      quests || [],
      routes || [],
      validationIssues
    )
  }, [
    currentGame,
    scenes,
    actors,
    challenges,
    quests,
    routes,
    validationIssues,
  ])

  // No game selected
  if (!isInGame || !currentGame) {
    return (
      <EmptyState
        icon="🎮"
        title="No game selected"
        description="Select a game from the Games page to view its dashboard."
        action={
          <Link
            href="/games"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-6 py-2.5"
          >
            View Games
          </Link>
        }
      />
    )
  }

  const sceneCount = scenes?.length || 0
  const actorCount = actors?.length || 0
  const challengeCount = challenges?.length || 0
  const questCount = quests?.length || 0
  const routeCount = routes?.length || 0

  const actorsWithSprites = actors?.filter((a) => a.sprite_asset_id).length || 0
  const errorCount = validationIssues.filter(
    (i) => i.severity === 'error'
  ).length
  const warningCount = validationIssues.filter(
    (i) => i.severity === 'warning'
  ).length

  const platformName = currentPlatform?.name || 'Platform'

  // Content metrics
  const metrics: ContentMetric[] = [
    {
      label: 'Scenes',
      value: sceneCount,
      icon: '🏞️',
      color: 'text-accent',
      bgColor: 'bg-amber-400/8 border-amber-400/15',
      link: '/scenes',
    },
    {
      label: 'Actors',
      value: actorCount,
      icon: '🎭',
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/8 border-purple-400/15',
      link: '/npcs',
    },
    {
      label: 'Challenges',
      value: challengeCount,
      icon: '⚡',
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/8 border-blue-400/15',
      link: '/challenges',
    },
    {
      label: 'Quests',
      value: questCount,
      icon: '📖',
      color: 'text-pink-400',
      bgColor: 'bg-pink-400/8 border-pink-400/15',
      link: '/quests',
    },
    {
      label: 'Routes',
      value: routeCount,
      icon: '🔀',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-400/8 border-cyan-400/15',
      link: '/routes',
    },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${currentGame.icon || '🎮'} ${currentGame.name}`}
        breadcrumbs={[{ label: currentGame.name }]}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-6 max-w-7xl">
          {/* ═══ TOP ROW: Health + Metrics ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
            {/* Health Score */}
            <Card className="lg:col-span-1">
              <div className="p-4 flex flex-col items-center">
                <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-3">
                  Game Health
                </h3>
                <HealthScoreRing score={healthScore} />
                <div className="mt-3 flex items-center gap-3 text-[10px]">
                  {errorCount > 0 && (
                    <span className="text-red-400">
                      {errorCount} error{errorCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="text-accent">
                      {warningCount} warning{warningCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {errorCount === 0 && warningCount === 0 && (
                    <span className="text-emerald-400">All checks passed</span>
                  )}
                </div>
              </div>
            </Card>

            {/* Content Metrics */}
            <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {metrics.map((m, i) => (
                <StatCard key={i} metric={m} />
              ))}
            </div>
          </div>

          {/* ═══ MIDDLE ROW: Flow Graph + Validation ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Game Flow Graph */}
            <Card className="lg:col-span-2">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase">
                    Game Flow
                  </h3>
                  {sceneCount > 0 && (
                    <Link
                      href="/routes"
                      className="text-[10px] text-accent hover:underline font-semibold"
                    >
                      Manage Routes →
                    </Link>
                  )}
                </div>
                {sceneCount > 0 ? (
                  <GameFlowGraph
                    scenes={scenes || []}
                    routes={routes || []}
                    startingSceneId={currentGame.starting_scene_id}
                  />
                ) : (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-4xl mb-2 block">🏞️</span>
                      <p className="text-muted text-xs">No scenes yet</p>
                      <Link
                        href="/game-editor"
                        className="text-accent text-xs hover:underline mt-1 inline-block"
                      >
                        Create with AI →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Validation Panel */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase">
                    Validation
                  </h3>
                  <span className="text-[10px] text-muted">
                    {validationIssues.length} issue
                    {validationIssues.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ValidationPanel issues={validationIssues} maxHeight={300} />
              </div>
            </Card>
          </div>

          {/* ═══ BOTTOM ROW: Details ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Quick Actions */}
            <Card className="lg:col-span-1">
              <div className="p-4">
                <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-3">
                  Quick Actions
                </h3>
                <div className="space-y-1.5">
                  {QUICK_ACTIONS.map((action, i) => (
                    <Link
                      key={i}
                      href={action.href}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
                        action.primary
                          ? 'bg-accent/15 border border-accent/20 hover:bg-accent/25'
                          : 'hover:bg-card'
                      }`}
                    >
                      <span
                        className={`text-xs ${action.primary ? 'text-accent font-semibold' : 'text-white/70'}`}
                      >
                        {action.label}
                      </span>
                      <span className="text-white/40 text-[10px]">→</span>
                    </Link>
                  ))}
                </div>
              </div>
            </Card>

            {/* Actor Breakdown */}
            <Card className="lg:col-span-1">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase">
                    Actor Types
                  </h3>
                  <span className="text-[10px] text-muted">
                    {actorsWithSprites}/{actorCount} sprites
                  </span>
                </div>
                {actorCount > 0 ? (
                  <ActorBreakdown actors={actors || []} />
                ) : (
                  <div className="text-center py-6">
                    <span className="text-2xl mb-2 block">🎭</span>
                    <p className="text-muted text-[10px]">No actors yet</p>
                  </div>
                )}
              </div>
            </Card>

            {/* HEARTS Coverage */}
            <Card className="lg:col-span-1">
              <div className="p-4">
                <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-3">
                  HEARTS Coverage
                </h3>
                {actorCount > 0 || challengeCount > 0 || questCount > 0 ? (
                  <HeartsCoverage
                    actors={actors || []}
                    challenges={challenges || []}
                    quests={quests || []}
                  />
                ) : (
                  <div className="text-center py-6">
                    <span className="text-2xl mb-2 block">❤️</span>
                    <p className="text-muted text-[10px]">
                      Add content to see coverage
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Game Info */}
            <Card className="lg:col-span-1">
              <div className="p-4">
                <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-3">
                  Game Info
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted">Status</span>
                    <span
                      className={`text-xs font-semibold ${
                        currentGame.status === 'published'
                          ? 'text-emerald-400'
                          : 'text-accent'
                      }`}
                    >
                      {currentGame.status || 'draft'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted">Grid Size</span>
                    <span className="text-xs text-white/70">
                      {currentGame.config?.grid_width || 16}×
                      {currentGame.config?.grid_height || 16}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted">Platform</span>
                    <span className="text-xs text-white/70 truncate max-w-[100px]">
                      {platformName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted">
                      Starting Scene
                    </span>
                    <span className="text-xs text-white/70 truncate max-w-[100px]">
                      {currentGame.starting_scene_id
                        ? scenes?.find(
                            (s) => s.id === currentGame.starting_scene_id
                          )?.scene_name || 'Set'
                        : '—'}
                    </span>
                  </div>
                </div>
                <Link
                  href="/game-settings"
                  className="mt-3 block text-center text-[10px] text-accent hover:underline"
                >
                  Edit Settings →
                </Link>
              </div>
            </Card>
          </div>

          {/* Description */}
          {currentGame.description && (
            <Card>
              <div className="p-4">
                <h3 className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-2">
                  Description
                </h3>
                <p className="text-sm text-white/70">
                  {currentGame.description}
                </p>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
