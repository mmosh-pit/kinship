'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FacetBadge, Spinner } from '@/components/UI'

// ═══════════════════════════════════════════════
//  Scene Preview Card
// ═══════════════════════════════════════════════

interface ScenePreviewProps {
  scene: {
    id: string
    scene_name?: string
    name?: string
    scene_type?: string
    description?: string
    mood?: string
    lighting?: string
    manifest_url?: string
  }
  isStarting?: boolean
  actorCount?: number
  challengeCount?: number
  onSetStarting?: () => void
  onDelete?: () => void
}

export function ScenePreviewCard({
  scene,
  isStarting,
  actorCount = 0,
  challengeCount = 0,
  onSetStarting,
  onDelete,
}: ScenePreviewProps) {
  const [showDelete, setShowDelete] = useState(false)
  const sceneName = scene.scene_name || scene.name || 'Untitled Scene'
  const typeColor = getTypeColor(scene.scene_type || 'unknown')

  return (
    <div className="group relative bg-card/40 rounded-xl border border-card-border hover:border-card-border/60 transition-all overflow-hidden">
      {/* Thumbnail / Type Banner */}
      <div
        className="h-20 relative"
        style={{ backgroundColor: `${typeColor}20` }}
      >
        {/* Scene type watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <span className="text-4xl font-bold" style={{ color: typeColor }}>
            {(scene.scene_type || 'UN').slice(0, 2).toUpperCase()}
          </span>
        </div>

        {/* Starting badge */}
        {isStarting && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-accent/20 border border-accent/30 text-[9px] font-bold text-accent">
            🚀 START
          </div>
        )}

        {/* Mood/lighting badges */}
        <div className="absolute bottom-2 left-2 flex gap-1">
          {scene.mood && (
            <span className="px-1.5 py-0.5 rounded text-[8px] bg-black/40 text-white/70">
              {scene.mood}
            </span>
          )}
          {scene.lighting && (
            <span className="px-1.5 py-0.5 rounded text-[8px] bg-black/40 text-white/70">
              {scene.lighting}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onSetStarting && !isStarting && (
            <button
              onClick={onSetStarting}
              className="w-6 h-6 rounded bg-black/50 hover:bg-accent/50 text-white text-[10px] flex items-center justify-center"
              title="Set as starting scene"
            >
              🚀
            </button>
          )}
          <Link
            href={`/scenes/${scene.id}`}
            className="w-6 h-6 rounded bg-black/50 hover:bg-blue-500/50 text-white text-[10px] flex items-center justify-center"
            title="Edit scene"
          >
            ✏️
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <Link href={`/scenes/${scene.id}`}>
          <h4 className="text-white text-xs font-semibold truncate hover:text-accent transition-colors">
            {sceneName}
          </h4>
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{
              backgroundColor: `${typeColor}20`,
              color: typeColor,
            }}
          >
            {scene.scene_type || 'unknown'}
          </span>
          {actorCount > 0 && (
            <span className="text-[9px] text-muted">🎭 {actorCount}</span>
          )}
          {challengeCount > 0 && (
            <span className="text-[9px] text-muted">
              ⚡ {challengeCount}
            </span>
          )}
        </div>
        {scene.description && (
          <p className="text-[10px] text-muted mt-1.5 line-clamp-2">
            {scene.description}
          </p>
        )}
      </div>

      {/* Delete confirmation */}
      {onDelete && (
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {showDelete ? (
            <div className="flex gap-1">
              <button
                onClick={() => {
                  onDelete()
                  setShowDelete(false)
                }}
                className="text-[9px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDelete(false)}
                className="text-[9px] px-2 py-0.5 rounded text-muted hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDelete(true)}
              className="text-white/40 hover:text-red-400 text-xs"
            >
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Actor Preview Card
// ═══════════════════════════════════════════════

interface ActorPreviewProps {
  actor: {
    id: string
    name: string
    actor_type?: string
    role?: string
    facet?: string
    sprite_asset_id?: string | null
    sprite_url?: string | null
    greeting?: string
    dialogue_tree?: any[]
    scene_id?: string
  }
  sceneName?: string
  onAssignSprite?: () => void
  onDelete?: () => void
}

const ACTOR_TYPE_META: Record<string, { icon: string; color: string }> = {
  character: { icon: '🧑', color: '#3b82f6' },
  creature: { icon: '🦊', color: '#f59e0b' },
  collectible: { icon: '💎', color: '#eab308' },
  obstacle: { icon: '🪨', color: '#6b7280' },
  interactive: { icon: '🔧', color: '#8b5cf6' },
  ambient: { icon: '🦋', color: '#06b6d4' },
  enemy: { icon: '⚔️', color: '#ef4444' },
  companion: { icon: '🐾', color: '#10b981' },
}

export function ActorPreviewCard({
  actor,
  sceneName,
  onAssignSprite,
  onDelete,
}: ActorPreviewProps) {
  const [showDelete, setShowDelete] = useState(false)
  const type = actor.actor_type || 'character'
  const meta = ACTOR_TYPE_META[type] || { icon: '❓', color: '#6b7280' }
  const hasSprite = !!actor.sprite_asset_id || !!actor.sprite_url
  const hasDialogue = (actor.dialogue_tree?.length || 0) > 0 || !!actor.greeting

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card/30 border border-card-border/30 hover:border-card-border transition-all">
      {/* Sprite/Icon */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden"
        style={{
          backgroundColor: `${meta.color}15`,
          borderColor: `${meta.color}30`,
        }}
      >
        {hasSprite && actor.sprite_url ? (
          <img
            src={actor.sprite_url}
            alt={actor.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg">{meta.icon}</span>
        )}
        {!hasSprite && (
          <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
            <span className="text-[8px] text-accent font-bold">!</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link href={`/npcs/${actor.id}`}>
          <h4 className="text-white text-xs font-semibold truncate hover:text-accent transition-colors">
            {actor.name}
          </h4>
        </Link>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{
              backgroundColor: `${meta.color}20`,
              color: meta.color,
            }}
          >
            {type}
          </span>
          {actor.role && (
            <span className="text-[9px] text-muted">{actor.role}</span>
          )}
          {sceneName && (
            <span className="text-[9px] text-white/40">· {sceneName}</span>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5">
        {actor.facet && <FacetBadge facet={actor.facet} />}
        {hasDialogue && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400">
            💬
          </span>
        )}
        {!hasSprite && onAssignSprite && (
          <button
            onClick={onAssignSprite}
            className="text-[9px] px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-amber-500/25 font-semibold"
          >
            + Sprite
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/npcs/${actor.id}/edit`}
          className="text-white/40 hover:text-accent text-xs"
        >
          ✏️
        </Link>
        {onDelete &&
          (showDelete ? (
            <div className="flex gap-1">
              <button
                onClick={() => {
                  onDelete()
                  setShowDelete(false)
                }}
                className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400"
              >
                Yes
              </button>
              <button
                onClick={() => setShowDelete(false)}
                className="text-[9px] text-muted"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDelete(true)}
              className="text-white/40 hover:text-red-400 text-xs"
            >
              🗑️
            </button>
          ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Challenge Preview Card
// ═══════════════════════════════════════════════

interface ChallengePreviewProps {
  challenge: {
    id: string
    name: string
    mechanic_type?: string
    difficulty?: string
    facets?: string[]
    correct_answers?: any[]
    hints?: string[]
    question?: string
    scene_id?: string
  }
  sceneName?: string
  onDelete?: () => void
}

const MECHANIC_COLORS: Record<string, string> = {
  multiple_choice: '#3b82f6',
  sorting: '#8b5cf6',
  matching: '#06b6d4',
  fill_blank: '#f59e0b',
  drag_drop: '#10b981',
  timed: '#ef4444',
}

export function ChallengePreviewCard({
  challenge,
  sceneName,
  onDelete,
}: ChallengePreviewProps) {
  const [showDelete, setShowDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const mechanic = challenge.mechanic_type || 'quiz'
  const mechanicColor = MECHANIC_COLORS[mechanic] || '#6b7280'
  const hasAnswers = (challenge.correct_answers?.length || 0) > 0
  const hasHints = (challenge.hints?.length || 0) > 0

  return (
    <div className="group bg-card/30 rounded-xl border border-card-border/30 hover:border-card-border transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${mechanicColor}15` }}
        >
          <span className="text-sm">⚡</span>
        </div>

        <div className="flex-1 min-w-0">
          <Link href={`/challenges/${challenge.id}`}>
            <h4 className="text-white text-xs font-semibold truncate hover:text-accent transition-colors">
              {challenge.name}
            </h4>
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
              style={{
                backgroundColor: `${mechanicColor}20`,
                color: mechanicColor,
              }}
            >
              {mechanic}
            </span>
            {challenge.difficulty && (
              <span className="text-[9px] text-muted">
                {challenge.difficulty}
              </span>
            )}
            {sceneName && (
              <span className="text-[9px] text-white/40">· {sceneName}</span>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5">
          {hasAnswers ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400">
              ✅ {challenge.correct_answers?.length}
            </span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400">
              ❌ No answers
            </span>
          )}
          {hasHints && (
            <span className="text-[9px] text-yellow-400/60">
              💡{challenge.hints?.length}
            </span>
          )}
          {challenge.facets?.map((f) => (
            <FacetBadge key={f} facet={f} />
          ))}
        </div>

        {/* Expand/Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-white/40 hover:text-white text-xs"
          >
            {expanded ? '▴' : '▾'}
          </button>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Link
              href={`/challenges/${challenge.id}/edit`}
              className="text-white/40 hover:text-accent text-xs"
            >
              ✏️
            </Link>
            {onDelete &&
              (showDelete ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      onDelete()
                      setShowDelete(false)
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowDelete(false)}
                    className="text-[9px] text-muted"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDelete(true)}
                  className="text-white/40 hover:text-red-400 text-xs"
                >
                  🗑️
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-card-border/30">
          {challenge.question && (
            <p className="text-[10px] text-white/70 mb-2">
              "{challenge.question}"
            </p>
          )}
          {hasAnswers && (
            <div className="flex flex-wrap gap-1">
              {challenge.correct_answers
                ?.slice(0, 4)
                .map((ans: any, i: number) => (
                  <span
                    key={i}
                    className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400"
                  >
                    {typeof ans === 'string'
                      ? ans
                      : ans.value ||
                        ans.text ||
                        JSON.stringify(ans).slice(0, 20)}
                  </span>
                ))}
              {(challenge.correct_answers?.length || 0) > 4 && (
                <span className="text-[9px] text-muted">
                  +{(challenge.correct_answers?.length || 0) - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Quest Preview Card
// ═══════════════════════════════════════════════

interface QuestPreviewProps {
  quest: {
    id: string
    name: string
    beat_type?: string
    facet?: string
    sequence_order?: number
    completion_conditions?: Record<string, any>
    rewards?: Record<string, any>
    learning_objectives?: string[]
    description?: string
    scene_id?: string
  }
  sceneName?: string
  index?: number
  onDelete?: () => void
}

export function QuestPreviewCard({
  quest,
  sceneName,
  index = 0,
  onDelete,
}: QuestPreviewProps) {
  const [showDelete, setShowDelete] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const hasConditions =
    Object.keys(quest.completion_conditions || {}).length > 0
  const hasRewards = Object.keys(quest.rewards || {}).length > 0
  const hasObjectives = (quest.learning_objectives?.length || 0) > 0

  return (
    <div className="group bg-card/30 rounded-xl border border-card-border/30 hover:border-card-border transition-all overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-lg bg-pink-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-pink-400">
            {quest.sequence_order || index + 1}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <Link href={`/quests/${quest.id}`}>
            <h4 className="text-white text-xs font-semibold truncate hover:text-accent transition-colors">
              {quest.name}
            </h4>
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5">
            {quest.beat_type && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-400/15 text-purple-400 font-semibold">
                {quest.beat_type}
              </span>
            )}
            {sceneName && (
              <span className="text-[9px] text-white/40">· {sceneName}</span>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5">
          {quest.facet && <FacetBadge facet={quest.facet} />}
          {hasConditions && (
            <span
              className="text-[9px] text-purple-400/60"
              title="Has completion conditions"
            >
              🔒
            </span>
          )}
          {hasRewards && (
            <span className="text-[9px] text-pink-400/60" title="Has rewards">
              🎁
            </span>
          )}
          {hasObjectives && (
            <span
              className="text-[9px] text-cyan-400/60"
              title="Learning objectives"
            >
              📚{quest.learning_objectives?.length}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-white/40 hover:text-white text-xs"
          >
            {expanded ? '▴' : '▾'}
          </button>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <Link
              href={`/quests/${quest.id}/edit`}
              className="text-white/40 hover:text-accent text-xs"
            >
              ✏️
            </Link>
            {onDelete &&
              (showDelete ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      onDelete()
                      setShowDelete(false)
                    }}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowDelete(false)}
                    className="text-[9px] text-muted"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDelete(true)}
                  className="text-white/40 hover:text-red-400 text-xs"
                >
                  🗑️
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-card-border/30 space-y-2">
          {quest.description && (
            <p className="text-[10px] text-white/70">{quest.description}</p>
          )}
          {hasObjectives && (
            <div>
              <div className="text-[9px] text-muted mb-1">
                Learning Objectives:
              </div>
              <div className="flex flex-wrap gap-1">
                {quest.learning_objectives?.map((obj, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400"
                  >
                    {obj}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Helper: Generate consistent color from string
// ═══════════════════════════════════════════════

function getTypeColor(type: string): string {
  let hash = 0
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 50%, 50%)`
}
