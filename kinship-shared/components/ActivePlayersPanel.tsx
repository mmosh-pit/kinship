'use client'

import { useState, useMemo } from 'react'
import { ActivePlayer } from '../hooks/useRealtimeEvents'

// ═══════════════════════════════════════════════════════════════════
//  Active Players Panel
// ═══════════════════════════════════════════════════════════════════

interface ActivePlayersPanelProps {
  players: ActivePlayer[]
  scenes?: { id: string; name: string }[]
  onPlayerClick?: (player: ActivePlayer) => void
  compact?: boolean
}

export default function ActivePlayersPanel({
  players,
  scenes = [],
  onPlayerClick,
  compact = false,
}: ActivePlayersPanelProps) {
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'scene'>('recent')
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null)

  // Scene lookup
  const sceneMap = useMemo(() => {
    const map: Record<string, string> = {}
    scenes.forEach((s) => {
      map[s.id] = s.name
    })
    return map
  }, [scenes])

  // Sort players
  const sortedPlayers = useMemo(() => {
    const sorted = [...players]
    switch (sortBy) {
      case 'recent':
        sorted.sort(
          (a, b) =>
            new Date(b.last_activity).getTime() -
            new Date(a.last_activity).getTime()
        )
        break
      case 'name':
        sorted.sort((a, b) =>
          (a.player_name || a.player_id).localeCompare(
            b.player_name || b.player_id
          )
        )
        break
      case 'scene':
        sorted.sort((a, b) =>
          (a.current_scene_id || '').localeCompare(b.current_scene_id || '')
        )
        break
    }
    return sorted
  }, [players, sortBy])

  // Group by scene
  const playersByScene = useMemo(() => {
    const groups: Record<string, ActivePlayer[]> = {}
    players.forEach((p) => {
      const key = p.current_scene_id || 'unknown'
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return groups
  }, [players])

  // Format relative time
  const formatRelative = (timestamp: string) => {
    const seconds = Math.floor(
      (Date.now() - new Date(timestamp).getTime()) / 1000
    )
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    return `${Math.floor(seconds / 3600)}h ago`
  }

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-3xl mb-2 opacity-50">👥</div>
        <div className="text-muted text-sm">No active players</div>
        <div className="text-white/40 text-xs mt-1">
          Players will appear here when they connect
        </div>
      </div>
    )
  }

  // Compact view
  if (compact) {
    return (
      <div className="space-y-2">
        {/* Player avatars */}
        <div className="flex flex-wrap gap-1">
          {sortedPlayers.slice(0, 12).map((player) => (
            <PlayerAvatar
              key={player.player_id}
              player={player}
              onClick={() => onPlayerClick?.(player)}
            />
          ))}
          {players.length > 12 && (
            <div className="w-8 h-8 rounded-full bg-white/[0.1] flex items-center justify-center text-[10px] text-white/70 font-bold">
              +{players.length - 12}
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span>{players.length} online</span>
          <span>•</span>
          <span>{Object.keys(playersByScene).length} scenes</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-white/70">
            <span className="text-white font-semibold">{players.length}</span>{' '}
            online
          </span>
        </div>

        {/* Sort options */}
        <div className="flex items-center gap-1">
          {[
            { id: 'recent', label: '🕐' },
            { id: 'name', label: '🔤' },
            { id: 'scene', label: '🗺️' },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSortBy(opt.id as any)}
              className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-colors ${
                sortBy === opt.id
                  ? 'bg-white/[0.1] text-white'
                  : 'text-muted hover:text-white/70'
              }`}
              title={`Sort by ${opt.id}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Player list */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
        {sortedPlayers.map((player) => (
          <PlayerRow
            key={player.player_id}
            player={player}
            sceneName={
              (sceneMap[player.current_scene_id || ''] || player.current_scene_id) ?? undefined
            }
            formatTime={formatRelative}
            isExpanded={expandedPlayer === player.player_id}
            onToggleExpand={() =>
              setExpandedPlayer(
                expandedPlayer === player.player_id ? null : player.player_id
              )
            }
            onClick={() => onPlayerClick?.(player)}
          />
        ))}
      </div>

      {/* Scene breakdown */}
      <div className="pt-2 border-t border-card-border">
        <div className="text-[10px] text-muted mb-2">By Scene</div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(playersByScene).map(([sceneId, scenePlayers]) => (
            <div
              key={sceneId}
              className="px-2 py-1 bg-card rounded text-[10px]"
            >
              <span className="text-white/70">
                {sceneMap[sceneId] || sceneId.slice(0, 12)}
              </span>
              <span className="text-white font-semibold ml-1">
                {scenePlayers.length}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Player Avatar
// ═══════════════════════════════════════════════════════════════════

interface PlayerAvatarProps {
  player: ActivePlayer
  onClick?: () => void
}

function PlayerAvatar({ player, onClick }: PlayerAvatarProps) {
  // Generate color from player ID
  const getColor = (id: string) => {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`
  }

  const initial = (player.player_name || player.player_id)[0].toUpperCase()
  const color = getColor(player.player_id)

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer group"
      title={player.player_name || player.player_id}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold transition-transform group-hover:scale-110"
        style={{ backgroundColor: color }}
      >
        {initial}
      </div>
      {/* Online indicator */}
      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#050824]" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Player Row
// ═══════════════════════════════════════════════════════════════════

interface PlayerRowProps {
  player: ActivePlayer
  sceneName?: string
  formatTime: (ts: string) => string
  isExpanded: boolean
  onToggleExpand: () => void
  onClick?: () => void
}

function PlayerRow({
  player,
  sceneName,
  formatTime,
  isExpanded,
  onToggleExpand,
  onClick,
}: PlayerRowProps) {
  // Generate color from player ID
  const getColor = (id: string) => {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`
  }

  const initial = (player.player_name || player.player_id)[0].toUpperCase()
  const color = getColor(player.player_id)

  return (
    <div className="group">
      <div
        className={`
          flex items-center gap-2 px-2 py-2 rounded-lg transition-colors cursor-pointer
          ${isExpanded ? 'bg-card' : 'hover:bg-card/40'}
        `}
        onClick={onToggleExpand}
      >
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {initial}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-white font-medium truncate">
            {player.player_name || player.player_id.slice(0, 12)}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            {sceneName && (
              <>
                <span className="truncate max-w-[80px]">{sceneName}</span>
                <span>•</span>
              </>
            )}
            <span>{formatTime(player.last_activity)}</span>
          </div>
        </div>

        {/* Online indicator */}
        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-2 pb-2">
          <div className="ml-10 p-2 bg-input rounded-lg space-y-2">
            {/* HEARTS scores */}
            {Object.keys(player.hearts_scores).length > 0 && (
              <div>
                <div className="text-[9px] text-muted mb-1">HEARTS</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(player.hearts_scores).map(
                    ([facet, score]) => (
                      <div
                        key={facet}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                        style={{
                          backgroundColor: `${getHeartsColor(facet)}20`,
                          color: getHeartsColor(facet),
                        }}
                      >
                        {facet}: {Math.round(score)}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Session info */}
            <div className="text-[9px] text-muted">
              Session: {player.session_id.slice(0, 12)}...
            </div>
            <div className="text-[9px] text-muted">
              Joined: {new Date(player.joined_at).toLocaleTimeString()}
            </div>

            {/* Actions */}
            {onClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClick()
                }}
                className="text-[10px] text-accent hover:underline"
              >
                View Details →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Helper
// ═══════════════════════════════════════════════════════════════════

function getHeartsColor(facet: string): string {
  const colors: Record<string, string> = {
    H: '#10b981',
    E: '#f59e0b',
    A: '#8b5cf6',
    R: '#ef4444',
    T: '#3b82f6',
    Si: '#ec4899',
    So: '#06b6d4',
  }
  return colors[facet] || '#6b7280'
}
