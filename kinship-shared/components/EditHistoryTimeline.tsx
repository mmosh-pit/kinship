'use client'

import { useMemo } from 'react'
import type { EditHistoryItem } from '@/lib/types'

interface Props {
  history: EditHistoryItem[]
  currentVersion: number
  onJumpToVersion?: (version: number) => void
  maxItems?: number
  compact?: boolean
}

const EDIT_TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  generate: {
    icon: '✨',
    color: 'text-emerald-400',
    label: 'Generated',
  },
  add_object: {
    icon: '➕',
    color: 'text-blue-400',
    label: 'Added object',
  },
  remove_object: {
    icon: '➖',
    color: 'text-red-400',
    label: 'Removed object',
  },
  modify_scene: {
    icon: '🎨',
    color: 'text-purple-400',
    label: 'Modified scene',
  },
  add_npc: {
    icon: '🧑',
    color: 'text-pink-400',
    label: 'Added NPC',
  },
  remove_npc: {
    icon: '🧑',
    color: 'text-red-400',
    label: 'Removed NPC',
  },
  modify_npc: {
    icon: '🧑',
    color: 'text-amber-400',
    label: 'Modified NPC',
  },
  add_challenge: {
    icon: '⚡',
    color: 'text-yellow-400',
    label: 'Added challenge',
  },
  remove_challenge: {
    icon: '⚡',
    color: 'text-red-400',
    label: 'Removed challenge',
  },
  modify_challenge: {
    icon: '⚡',
    color: 'text-amber-400',
    label: 'Modified challenge',
  },
  add_route: {
    icon: '🔀',
    color: 'text-teal-400',
    label: 'Added route',
  },
  remove_route: {
    icon: '🔀',
    color: 'text-red-400',
    label: 'Removed route',
  },
  default: {
    icon: '📝',
    color: 'text-white/70',
    label: 'Edit',
  },
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

export default function EditHistoryTimeline({
  history,
  currentVersion,
  onJumpToVersion,
  maxItems = 10,
  compact = false,
}: Props) {
  // Sort history by version descending (newest first)
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => b.version - a.version).slice(0, maxItems)
  }, [history, maxItems])

  const getEditConfig = (editType: string) =>
    EDIT_TYPE_CONFIG[editType] || EDIT_TYPE_CONFIG.default

  if (history.length === 0) {
    return (
      <div className="bg-card rounded-xl p-4 border border-card-border">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">📜</span>
          <span className="text-xs font-medium text-white">Edit History</span>
        </div>
        <p className="text-xs text-muted text-center py-4">
          No edits yet. Generate or modify your game to see history.
        </p>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="bg-card rounded-xl p-3 border border-card-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">📜</span>
            <span className="text-xs font-medium text-white">Edit History</span>
          </div>
          <span className="text-[10px] text-muted">
            v{currentVersion} • {history.length} edit
            {history.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Timeline */}
        <div className="relative pl-4">
          {/* Timeline Line */}
          <div className="absolute left-[5px] top-1 bottom-1 w-0.5 bg-white/[0.1]" />

          {sortedHistory.map((item, idx) => {
            const config = getEditConfig(item.change.edit_type)
            const isLatest = item.version === currentVersion
            const isCurrent = idx === 0

            return (
              <div
                key={`${item.version}-${idx}`}
                className={`relative mb-3 last:mb-0 ${!isCurrent && 'opacity-60'}`}
              >
                {/* Timeline Dot */}
                <div
                  className={`absolute -left-4 top-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                    isLatest
                      ? 'bg-amber-500'
                      : item.change.edit_type === 'generate'
                        ? 'bg-emerald-500'
                        : 'bg-white/30'
                  }`}
                />

                {/* Content */}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs ${config.color}`}>
                      {config.icon}
                    </span>
                    <p className="text-[11px] font-medium text-white truncate">
                      {item.change.description || config.label}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5">
                    v{item.version} • {formatTimeAgo(item.timestamp)}
                  </p>
                </div>
              </div>
            )
          })}

          {history.length > maxItems && (
            <p className="text-[10px] text-muted mt-2 ml-0">
              +{history.length - maxItems} earlier edit
              {history.length - maxItems !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Full view
  return (
    <div className="bg-card rounded-xl border border-card-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📜</span>
          <span className="text-sm font-medium text-white">Edit History</span>
        </div>
        <span className="text-xs text-muted">
          Version {currentVersion} • {history.length} edit
          {history.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Timeline */}
      <div className="px-4 py-3 max-h-80 overflow-y-auto">
        <div className="relative pl-5">
          {/* Timeline Line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-white/[0.1]" />

          {sortedHistory.map((item, idx) => {
            const config = getEditConfig(item.change.edit_type)
            const isLatest = item.version === currentVersion
            const canJump = onJumpToVersion && !isLatest

            return (
              <div
                key={`${item.version}-${idx}`}
                className={`relative mb-4 last:mb-0 group ${canJump ? 'cursor-pointer' : ''}`}
                onClick={() => canJump && onJumpToVersion?.(item.version)}
              >
                {/* Timeline Dot */}
                <div
                  className={`absolute -left-5 top-1 w-3.5 h-3.5 rounded-full border-2 border-card transition-all ${
                    isLatest
                      ? 'bg-amber-500 scale-110'
                      : item.change.edit_type === 'generate'
                        ? 'bg-emerald-500'
                        : 'bg-white/30 group-hover:bg-white/50'
                  }`}
                />

                {/* Content */}
                <div
                  className={`p-2 rounded-lg transition-all ${
                    canJump ? 'hover:bg-white/[0.05]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-base ${config.color}`}>
                        {config.icon}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-white">
                          {item.change.description || config.label}
                        </p>
                        <p className="text-[10px] text-muted mt-0.5">
                          {formatTimeAgo(item.timestamp)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isLatest
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-white/[0.1] text-muted'
                        }`}
                      >
                        v{item.version}
                      </span>
                      {canJump && (
                        <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          Jump →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {history.length > maxItems && (
          <p className="text-[10px] text-muted text-center mt-2 pt-2 border-t border-white/[0.08]">
            Showing {maxItems} of {history.length} edits
          </p>
        )}
      </div>
    </div>
  )
}
