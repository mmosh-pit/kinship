'use client'

import { useState, useMemo } from 'react'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState, Spinner } from '@/components/UI'

import { formatScore } from '@/hooks/useLeaderboards'

import {
  useScoresLeaderboard,
  mapToLeaderboardEntries,
} from '@/hooks/useScoresLeaderboard'

import { Podium, PlayerAvatar } from '@/components/LeaderboardTable'

// ═══════════════════════════════════════════════════════════════════
//  Pagination Controls Component
// ═══════════════════════════════════════════════════════════════════

interface PaginationControlsProps {
  page: number
  totalPages: number
  totalItems: number
  limit: number
  hasMore: boolean
  loading: boolean
  onPageChange: (page: number) => void
  onNextPage: () => void
  onPrevPage: () => void
}

function PaginationControls({
  page,
  totalPages,
  totalItems,
  limit,
  hasMore,
  loading,
  onPageChange,
  onNextPage,
  onPrevPage,
}: PaginationControlsProps) {
  const startItem = (page - 1) * limit + 1
  const endItem = Math.min(page * limit, totalItems)

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (page <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      } else if (page >= totalPages - 2) {
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i)
      } else {
        pages.push(1)
        pages.push('...')
        for (let i = page - 1; i <= page + 1; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      }
    }

    return pages
  }

  if (totalItems === 0) return null

  return (
    <div className="flex items-center justify-between pt-4 border-t border-card-border">
      {/* Info */}
      <div className="text-xs text-muted">
        Showing <span className="text-white font-medium">{startItem}</span> to{' '}
        <span className="text-white font-medium">{endItem}</span> of{' '}
        <span className="text-white font-medium">
          {totalItems.toLocaleString()}
        </span>{' '}
        players
      </div>

      {/* Page Controls */}
      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={onPrevPage}
          disabled={page <= 1 || loading}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${
              page <= 1 || loading
                ? 'text-white/40 cursor-not-allowed'
                : 'text-white/70 hover:text-white hover:bg-card'
            }
          `}
        >
          ← Prev
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((pageNum, index) =>
            pageNum === '...' ? (
              <span
                key={`ellipsis-${index}`}
                className="px-2 text-white/40 text-xs"
              >
                ...
              </span>
            ) : (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum as number)}
                disabled={loading}
                className={`
                  w-8 h-8 rounded-lg text-xs font-medium transition-colors
                  ${
                    page === pageNum
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'text-white/70 hover:text-white hover:bg-card'
                  }
                  ${loading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {pageNum}
              </button>
            )
          )}
        </div>

        {/* Next */}
        <button
          onClick={onNextPage}
          disabled={!hasMore || loading}
          className={`
            px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${
              !hasMore || loading
                ? 'text-white/40 cursor-not-allowed'
                : 'text-white/70 hover:text-white hover:bg-card'
            }
          `}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Scores Leaderboard Table
// ═══════════════════════════════════════════════════════════════════

interface ScoresTableProps {
  entries: ReturnType<typeof mapToLeaderboardEntries>
  loading?: boolean
  scorePrecision?: number
  maxHeight?: string
}

function ScoresLeaderboardTable({
  entries,
  loading = false,
  scorePrecision = 0,
  maxHeight = '500px',
}: ScoresTableProps) {
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

  const rankColors = {
    1: 'from-amber-400 to-amber-600',
    2: 'from-white/30 to-white/50',
    3: 'from-orange-400 to-amber-700',
  }

  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full">
        <thead>
          <tr className="text-[10px] text-muted border-b border-card-border">
            <th className="text-left py-2 pl-2 w-12">Rank</th>
            <th className="text-left py-2">Player</th>
            <th className="text-right py-2">Challenges</th>
            <th className="text-right py-2">Coins</th>
            <th className="text-right py-2 pr-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isTop3 = entry.rank <= 3
            const rankBg = rankColors[entry.rank as 1 | 2 | 3]
            const extraData = entry.extra_data as {
              completed_challenges?: string[]
              collected_coins?: string[]
            } | null

            return (
              <tr
                key={entry.player_id}
                className="border-b border-card-border/20 hover:bg-card/30 transition-colors"
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
                      <div className="text-sm font-medium text-white">
                        {entry.player_name || entry.player_id.slice(0, 12)}
                      </div>
                      <div className="text-[10px] text-muted">
                        Last active:{' '}
                        {entry.last_played_at
                          ? new Date(entry.last_played_at).toLocaleDateString()
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Challenges */}
                <td className="py-3 text-right">
                  <span className="text-xs text-white/70">
                    {extraData?.completed_challenges?.length ?? 0}
                  </span>
                </td>

                {/* Coins */}
                <td className="py-3 text-right">
                  <span className="text-xs text-white/70">
                    {extraData?.collected_coins?.length ?? 0}
                  </span>
                </td>

                {/* Score */}
                <td className="py-3 pr-2 text-right">
                  <div className="text-sm font-bold text-accent">
                    {formatScore(entry.score, scorePrecision)}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Main Page
// ═══════════════════════════════════════════════════════════════════

export default function LeaderboardsPage() {
  const { currentGame, isInGame } = useStudio()
  const gameId = currentGame?.id || null

  // Display settings
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Scores leaderboard with pagination (uses kinship-assets API)
  const {
    entries: scoreEntries,
    totalPlayers,
    playerScore,
    loading: scoresLoading,
    error: scoresError,
    page,
    limit,
    hasMore,
    totalPages,
    setPage,
    nextPage,
    prevPage,
    refetch: refetchScores,
  } = useScoresLeaderboard({
    gameId,
    limit: itemsPerPage,
  })

  // Map entries to LeaderboardTable format
  const mappedEntries = useMemo(
    () => mapToLeaderboardEntries(scoreEntries),
    [scoreEntries]
  )

  // No game selected
  if (!isInGame || !currentGame) {
    return (
      <EmptyState
        icon="🏆"
        title="Select a game first"
        description="Leaderboards are game-specific. Select a game from the Games page."
        action={
          <a
            href="/games"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            View Games
          </a>
        }
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Leaderboards"
        subtitle={`${currentGame.icon || '🏆'} ${currentGame.name}`}
        breadcrumbs={[
          { label: currentGame.name, href: '/dashboard' },
          { label: 'Leaderboards' },
        ]}
      />

      {/* Content */}
      <div className="max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Quick Stats */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-bold text-white mb-3">📊 Stats</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/70">Total Players</span>
                    <span className="text-xs font-bold text-white">
                      {totalPlayers.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/70">Current Page</span>
                    <span className="text-xs font-bold text-white">
                      {page} of {totalPages}
                    </span>
                  </div>
                  {mappedEntries[0] && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/70">Top Score</span>
                      <span className="text-xs font-bold text-accent">
                        {mappedEntries[0].score.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Items Per Page */}
            <Card>
              <div className="p-4">
                <h3 className="text-sm font-bold text-white mb-3">
                  ⚙️ Display
                </h3>
                <div className="space-y-2">
                  <label className="text-xs text-white/70">
                    Items per page
                  </label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value))
                      setPage(1) // Reset to first page when changing limit
                    }}
                    className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-xs text-white focus:border-accent focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </Card>

            {/* Player's Own Score */}
            {playerScore && (
              <Card>
                <div className="p-4">
                  <h3 className="text-sm font-bold text-white mb-3">
                    🎮 Your Score
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/70">Rank</span>
                      <span className="text-lg font-bold text-accent">
                        #{playerScore.rank}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/70">Score</span>
                      <span className="text-xs font-bold text-white">
                        {playerScore.total_score.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/70">Challenges</span>
                      <span className="text-xs font-bold text-white">
                        {playerScore.completed_challenges.length}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card>
              <div className="p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-lg">
                      🏆
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">
                        Game Leaderboard
                      </h2>
                      <p className="text-xs text-white/70">
                        Top players ranked by total score
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={refetchScores}
                    disabled={scoresLoading}
                    className={`
                      px-3 py-1.5 text-[10px] bg-card rounded-lg transition-colors
                      ${
                        scoresLoading
                          ? 'text-white/40 cursor-not-allowed'
                          : 'text-white/70 hover:text-white'
                      }
                    `}
                  >
                    🔄 Refresh
                  </button>
                </div>

                {/* Error State */}
                {scoresError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400">⚠️ {scoresError}</p>
                  </div>
                )}

                {/* Podium for top 3 (only on first page) */}
                {!scoresLoading && page === 1 && mappedEntries.length >= 3 && (
                  <Podium entries={mappedEntries} scorePrecision={0} />
                )}

                {/* Scores Table */}
                <ScoresLeaderboardTable
                  entries={mappedEntries}
                  loading={scoresLoading}
                  scorePrecision={0}
                  maxHeight="400px"
                />

                {/* Pagination Controls */}
                <PaginationControls
                  page={page}
                  totalPages={totalPages}
                  totalItems={totalPlayers}
                  limit={limit}
                  hasMore={hasMore}
                  loading={scoresLoading}
                  onPageChange={setPage}
                  onNextPage={nextPage}
                  onPrevPage={prevPage}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
