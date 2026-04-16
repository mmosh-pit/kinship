'use client'

import { useState } from 'react'
import {
  LeaderboardEntry,
  LeaderboardPeriod,
  PERIOD_LABELS,
  formatScore,
  formatRankChange,
  getOrdinalSuffix,
} from '../hooks/useLeaderboards'

// ═══════════════════════════════════════════════════════════════════
//  Leaderboard Table
// ═══════════════════════════════════════════════════════════════════

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  period: LeaderboardPeriod
  onPeriodChange?: (period: LeaderboardPeriod) => void
  enabledPeriods?: LeaderboardPeriod[]
  currentPlayerId?: string
  scorePrecision?: number
  scoreLabel?: string
  showRankChange?: boolean
  onPlayerClick?: (playerId: string) => void
  loading?: boolean
  maxHeight?: string
}

export default function LeaderboardTable({
  entries,
  period,
  onPeriodChange,
  enabledPeriods = ['all_time', 'weekly', 'monthly'],
  currentPlayerId,
  scorePrecision = 0,
  scoreLabel = 'Score',
  showRankChange = true,
  onPlayerClick,
  loading = false,
  maxHeight = '500px',
}: LeaderboardTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-lg bg-card/40 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-2 opacity-50">🏆</div>
        <div className="text-muted text-sm">No entries yet</div>
        <div className="text-white/40 text-xs mt-1">
          Be the first to claim the top spot!
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Period Tabs */}
      {onPeriodChange && enabledPeriods.length > 1 && (
        <div className="flex items-center gap-1 mb-4 p-1 bg-card/40 rounded-lg max-w-fit">
          {enabledPeriods.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                period === p
                  ? 'bg-accent/20 text-accent'
                  : 'text-muted hover:text-white/70'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-muted border-b border-card-border">
              <th className="text-left py-2 pl-2 w-12">Rank</th>
              <th className="text-left py-2">Player</th>
              <th className="text-right py-2 pr-2">{scoreLabel}</th>
              {showRankChange && (
                <th className="text-right py-2 pr-2 w-16">Change</th>
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <LeaderboardRow
                key={entry.player_id}
                entry={entry}
                isCurrentPlayer={entry.player_id === currentPlayerId}
                scorePrecision={scorePrecision}
                showRankChange={showRankChange}
                onClick={() => onPlayerClick?.(entry.player_id)}
                isTop3={entry.rank <= 3}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Leaderboard Row
// ═══════════════════════════════════════════════════════════════════

interface LeaderboardRowProps {
  entry: LeaderboardEntry
  isCurrentPlayer: boolean
  scorePrecision: number
  showRankChange: boolean
  onClick?: () => void
  isTop3: boolean
}

function LeaderboardRow({
  entry,
  isCurrentPlayer,
  scorePrecision,
  showRankChange,
  onClick,
  isTop3,
}: LeaderboardRowProps) {
  const rankColors = {
    1: 'from-amber-400 to-amber-600',
    2: 'from-white/30 to-white/50',
    3: 'from-orange-400 to-amber-700',
  }

  const rankBg = rankColors[entry.rank as 1 | 2 | 3]

  return (
    <tr
      className={`
        border-b border-card-border/20 transition-colors
        ${isCurrentPlayer ? 'bg-accent/10' : 'hover:bg-card/30'}
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
    >
      {/* Rank */}
      <td className="py-3 pl-2">
        {isTop3 ? (
          <div
            className={`
              w-8 h-8 rounded-full bg-gradient-to-br ${rankBg}
              flex items-center justify-center text-white font-bold text-sm shadow-lg
            `}
          >
            {entry.rank}
          </div>
        ) : (
          <div className="w-8 h-8 flex items-center justify-center text-white/70 text-sm font-semibold">
            {entry.rank}
          </div>
        )}
      </td>

      {/* Player */}
      <td className="py-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            playerId={entry.player_id}
            playerName={entry.player_name}
            avatarUrl={entry.player_avatar_url}
          />
          <div>
            <div
              className={`text-sm font-medium ${isCurrentPlayer ? 'text-accent' : 'text-white'}`}
            >
              {entry.player_name || entry.player_id.slice(0, 12)}
              {isCurrentPlayer && (
                <span className="ml-2 text-[10px] text-accent">(You)</span>
              )}
            </div>
            <div className="text-[10px] text-muted">
              {entry.games_played} games played
            </div>
          </div>
        </div>
      </td>

      {/* Score */}
      <td className="py-3 pr-2 text-right">
        <div className="text-sm font-bold text-white">
          {formatScore(entry.score, scorePrecision)}
        </div>
        {entry.best_score !== entry.score && (
          <div className="text-[10px] text-muted">
            Best: {formatScore(entry.best_score, scorePrecision)}
          </div>
        )}
      </td>

      {/* Rank Change */}
      {showRankChange && (
        <td className="py-3 pr-2 text-right">
          {entry.rank_change !== null && entry.rank_change !== 0 && (
            <span
              className={`text-xs font-semibold ${
                entry.rank_change > 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {formatRankChange(entry.rank_change)}
            </span>
          )}
        </td>
      )}
    </tr>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Player Avatar
// ═══════════════════════════════════════════════════════════════════

interface PlayerAvatarProps {
  playerId: string
  playerName: string | null
  avatarUrl: string | null
  size?: 'sm' | 'md' | 'lg'
}

export function PlayerAvatar({
  playerId,
  playerName,
  avatarUrl,
  size = 'md',
}: PlayerAvatarProps) {
  const sizes = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-12 h-12 text-sm',
  }

  const getColor = (id: string) => {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`
  }

  const initial = (playerName || playerId)[0].toUpperCase()
  const color = getColor(playerId)

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={playerName || playerId}
        className={`${sizes[size]} rounded-full object-cover`}
      />
    )
  }

  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center text-white font-bold`}
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Top 3 Podium
// ═══════════════════════════════════════════════════════════════════

interface PodiumProps {
  entries: LeaderboardEntry[]
  scorePrecision?: number
  onPlayerClick?: (playerId: string) => void
}

export function Podium({
  entries,
  scorePrecision = 0,
  onPlayerClick,
}: PodiumProps) {
  const top3 = entries.slice(0, 3)

  if (top3.length < 3) {
    return null
  }

  // Reorder for podium display: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]]
  const heights = ['h-20', 'h-28', 'h-16']
  const medals = ['🥈', '🥇', '🥉']

  return (
    <div className="flex items-end justify-center gap-2 mb-6 pt-8">
      {podiumOrder.map((entry, index) => (
        <div
          key={entry.player_id}
          className="flex flex-col items-center"
          onClick={() => onPlayerClick?.(entry.player_id)}
        >
          {/* Player info */}
          <div className="text-center mb-2">
            <PlayerAvatar
              playerId={entry.player_id}
              playerName={entry.player_name}
              avatarUrl={entry.player_avatar_url}
              size="lg"
            />
            <div className="text-xs text-white font-medium mt-1 max-w-[80px] truncate">
              {entry.player_name || entry.player_id.slice(0, 8)}
            </div>
            <div className="text-[10px] text-white/70">
              {formatScore(entry.score, scorePrecision)}
            </div>
          </div>

          {/* Podium block */}
          <div
            className={`
              ${heights[index]} w-20 rounded-t-lg flex items-start justify-center pt-2
              ${
                index === 1
                  ? 'bg-gradient-to-b from-amber-400/30 to-amber-600/20 border-t-2 border-amber-400'
                  : index === 0
                    ? 'bg-gradient-to-b from-white/20 to-white/15 border-t-2 border-white/30'
                    : 'bg-gradient-to-b from-orange-400/30 to-amber-700/20 border-t-2 border-orange-400'
              }
            `}
          >
            <span className="text-2xl">{medals[index]}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Mini Leaderboard (Compact View)
// ═══════════════════════════════════════════════════════════════════

interface MiniLeaderboardProps {
  entries: LeaderboardEntry[]
  title?: string
  currentPlayerId?: string
  scorePrecision?: number
  maxEntries?: number
  onViewAll?: () => void
  onPlayerClick?: (playerId: string) => void
}

export function MiniLeaderboard({
  entries,
  title = 'Leaderboard',
  currentPlayerId,
  scorePrecision = 0,
  maxEntries = 5,
  onViewAll,
  onPlayerClick,
}: MiniLeaderboardProps) {
  const displayEntries = entries.slice(0, maxEntries)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {onViewAll && entries.length > maxEntries && (
          <button
            onClick={onViewAll}
            className="text-[10px] text-accent hover:underline"
          >
            View all →
          </button>
        )}
      </div>

      <div className="space-y-2">
        {displayEntries.map((entry) => {
          const isCurrentPlayer = entry.player_id === currentPlayerId

          return (
            <div
              key={entry.player_id}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${isCurrentPlayer ? 'bg-accent/10 border border-accent/20' : 'bg-card/40 hover:bg-card'}
              `}
              onClick={() => onPlayerClick?.(entry.player_id)}
            >
              {/* Rank */}
              <div className="w-6 text-center">
                {entry.rank <= 3 ? (
                  <span className="text-sm">
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                  </span>
                ) : (
                  <span className="text-xs text-muted font-semibold">
                    {entry.rank}
                  </span>
                )}
              </div>

              {/* Player */}
              <PlayerAvatar
                playerId={entry.player_id}
                playerName={entry.player_name}
                avatarUrl={entry.player_avatar_url}
                size="sm"
              />

              <div className="flex-1 min-w-0">
                <span
                  className={`text-xs font-medium truncate ${isCurrentPlayer ? 'text-accent' : 'text-white'}`}
                >
                  {entry.player_name || entry.player_id.slice(0, 10)}
                </span>
              </div>

              {/* Score */}
              <span className="text-xs font-bold text-white">
                {formatScore(entry.score, scorePrecision)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Player Rank Card
// ═══════════════════════════════════════════════════════════════════

interface PlayerRankCardProps {
  entry: LeaderboardEntry
  totalPlayers: number
  leaderboardName: string
  period: LeaderboardPeriod
  scorePrecision?: number
}

export function PlayerRankCard({
  entry,
  totalPlayers,
  leaderboardName,
  period,
  scorePrecision = 0,
}: PlayerRankCardProps) {
  const percentile = Math.round((1 - entry.rank / totalPlayers) * 100)

  return (
    <div className="p-4 rounded-xl bg-gradient-to-br from-[#eb8000]/10 to-[#eb8000]/5 border border-accent/20">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wide">
            Your Rank on {leaderboardName}
          </div>
          <div className="text-[10px] text-white/40">
            {PERIOD_LABELS[period]}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-accent">#{entry.rank}</div>
          <div className="text-[10px] text-muted">
            of {totalPlayers.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-2 bg-card rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#eb8000] to-[#c96d00] rounded-full"
            style={{ width: `${percentile}%` }}
          />
        </div>
        <div className="text-[10px] text-accent mt-1">
          Top {100 - percentile}%
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold text-white">
            {formatScore(entry.score, scorePrecision)}
          </div>
          <div className="text-[9px] text-muted">Score</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">
            {entry.games_played}
          </div>
          <div className="text-[9px] text-muted">Games</div>
        </div>
        <div>
          <div className="text-lg font-bold text-white">
            {formatScore(entry.best_score, scorePrecision)}
          </div>
          <div className="text-[9px] text-muted">Best</div>
        </div>
      </div>
    </div>
  )
}
