'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState, Spinner } from '@/components/UI'
import {
  useGameOverview,
  useSceneAnalytics,
  useChallengeAnalytics,
  useHeartsAnalytics,
  useSessionHistory,
  type TimePeriod,
} from '@/hooks/useAnalytics'
import {
  SessionsChart,
  HeartsRadarChart,
  HeartsBarChart,
  SceneAnalyticsTable,
  ChallengeAnalyticsTable,
  StatCard,
  formatNumber,
} from '@/components/AnalyticsCharts'

// ═══════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════

const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'scenes', label: 'Scenes', icon: '🏞️' },
  { id: 'challenges', label: 'Challenges', icon: '⚡' },
  { id: 'hearts', label: 'HEARTS', icon: '❤️' },
]

// ═══════════════════════════════════════════════
//  Main Analytics Page
// ═══════════════════════════════════════════════

export default function AnalyticsPage() {
  const router = useRouter()
  const { currentGame, currentPlatform, isInGame } = useStudio()
  const gameId = currentGame?.id || null

  // State
  const [activeTab, setActiveTab] = useState('overview')
  const [period, setPeriod] = useState<TimePeriod>('30d')
  const [heartsView, setHeartsView] = useState<'radar' | 'bars'>('bars')

  // Data fetching
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
  } = useGameOverview(gameId, period)
  const { data: scenes, loading: scenesLoading } = useSceneAnalytics(
    gameId,
    period
  )
  const { data: challenges, loading: challengesLoading } =
    useChallengeAnalytics(gameId, period)
  const { data: hearts, loading: heartsLoading } = useHeartsAnalytics(
    gameId,
    period
  )
  const { data: sessionHistory, loading: historyLoading } = useSessionHistory(
    gameId,
    period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
  )

  // Loading state
  const isLoading =
    overviewLoading || scenesLoading || challengesLoading || heartsLoading

  // No game selected
  if (!isInGame || !currentGame) {
    return (
      <EmptyState
        icon="📊"
        title="Select a game first"
        description="Analytics are game-specific. Select a game from the Games page."
        action={
          <Link
            href="/games"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            View Games
          </Link>
        }
      />
    )
  }

  // Error state
  if (overviewError) {
    return (
      <>
        <PageHeader
          title="Analytics"
          subtitle={`${currentGame.icon || '📊'} ${currentGame.name}`}
        />
        <Card>
          <div className="p-8 text-center">
            <span className="text-4xl mb-4 block">⚠️</span>
            <h3 className="text-white font-bold mb-2">
              Unable to load analytics
            </h3>
            <p className="text-muted text-sm mb-4">{overviewError}</p>
            <p className="text-white/40 text-xs">
              Make sure the analytics backend is running and the game has player
              data.
            </p>
          </div>
        </Card>
      </>
    )
  }

  // Computed stats
  const avgSessionMinutes = overview
    ? Math.round(overview.avg_session_duration_seconds / 60)
    : 0
  const periodDays =
    period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={`${currentGame.icon || '📊'} ${currentGame.name}`}
        breadcrumbs={[
          { label: currentGame.name, href: '/dashboard' },
          { label: 'Analytics' },
        ]}
        action={
          <div className="flex items-center gap-2">
            {/* Period Selector */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as TimePeriod)}
              className="bg-card border border-card-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-accent/50"
            >
              {TIME_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {/* Export button placeholder */}
            <button
              className="px-3 py-2 bg-card border border-card-border rounded-xl text-xs text-white/70 hover:text-white transition-colors"
              title="Export data"
            >
              📥 Export
            </button>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-card/40 rounded-xl mb-6 max-w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:text-white/70'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-7xl">
        {/* ═══════════════════════════════════════════════ */}
        {/* OVERVIEW TAB */}
        {/* ═══════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-2xl bg-card/40 animate-pulse"
                  />
                ))}
              </div>
            ) : overview ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <StatCard
                  icon="👥"
                  label="Total Players"
                  value={formatNumber(overview.total_players)}
                  subValue={`${overview.active_players_7d} active this week`}
                  color="#3b82f6"
                />
                <StatCard
                  icon="🎮"
                  label="Total Sessions"
                  value={formatNumber(overview.total_sessions)}
                  subValue={`~${Math.round(overview.total_sessions / periodDays)}/day`}
                  color="#8b5cf6"
                />
                <StatCard
                  icon="⏱️"
                  label="Avg Session"
                  value={`${avgSessionMinutes}m`}
                  subValue={`${overview.avg_scenes_per_session.toFixed(1)} scenes visited`}
                  color="#f59e0b"
                />
                <StatCard
                  icon="⚡"
                  label="Challenges/Session"
                  value={overview.avg_challenges_per_session.toFixed(1)}
                  color="#10b981"
                />
                <StatCard
                  icon="🏆"
                  label="Completion Rate"
                  value={`${overview.completion_rate_pct.toFixed(1)}%`}
                  color="#ec4899"
                  trend={overview.completion_rate_pct >= 50 ? 'up' : 'down'}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-muted">
                No analytics data available yet
              </div>
            )}

            {/* Sessions Over Time Chart */}
            <Card>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white text-sm font-bold">
                      Sessions Over Time
                    </h3>
                    <p className="text-[10px] text-muted mt-0.5">
                      Daily sessions and unique players
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-accent rounded" />
                      <span className="text-white/70">Sessions</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-0.5 bg-purple-400 rounded"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(90deg, #8b5cf6 0, #8b5cf6 4px, transparent 4px, transparent 8px)',
                        }}
                      />
                      <span className="text-white/70">Unique Players</span>
                    </div>
                  </div>
                </div>
                {historyLoading ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : (
                  <SessionsChart
                    data={sessionHistory}
                    height={200}
                    showPlayers={true}
                  />
                )}
              </div>
            </Card>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Scenes */}
              <Card>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white text-sm font-bold">Top Scenes</h3>
                    <button
                      onClick={() => setActiveTab('scenes')}
                      className="text-[10px] text-accent hover:underline"
                    >
                      View all →
                    </button>
                  </div>
                  {scenesLoading ? (
                    <div className="h-[150px] flex items-center justify-center">
                      <Spinner />
                    </div>
                  ) : (
                    <SceneAnalyticsTable
                      data={(scenes || []).slice(0, 5)}
                      onSceneClick={(id) => router.push(`/scenes/${id}`)}
                    />
                  )}
                </div>
              </Card>

              {/* Challenge Performance */}
              <Card>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white text-sm font-bold">
                      Challenge Performance
                    </h3>
                    <button
                      onClick={() => setActiveTab('challenges')}
                      className="text-[10px] text-accent hover:underline"
                    >
                      View all →
                    </button>
                  </div>
                  {challengesLoading ? (
                    <div className="h-[150px] flex items-center justify-center">
                      <Spinner />
                    </div>
                  ) : (
                    <ChallengeAnalyticsTable
                      data={(challenges || []).slice(0, 5)}
                      onChallengeClick={(id) =>
                        router.push(`/challenges/${id}`)
                      }
                    />
                  )}
                </div>
              </Card>
            </div>

            {/* HEARTS Overview */}
            <Card>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white text-sm font-bold">
                      HEARTS Overview
                    </h3>
                    <p className="text-[10px] text-muted mt-0.5">
                      Average facet scores across all players
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('hearts')}
                    className="text-[10px] text-accent hover:underline"
                  >
                    View details →
                  </button>
                </div>
                {heartsLoading ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <Spinner />
                  </div>
                ) : hearts && hearts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <HeartsBarChart data={hearts} />
                    <div className="flex items-center justify-center">
                      <HeartsRadarChart data={hearts} size={220} />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted text-sm">
                    No HEARTS data available
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* SCENES TAB */}
        {/* ═══════════════════════════════════════════════ */}
        {activeTab === 'scenes' && (
          <div className="space-y-6">
            {/* Scene Metrics Summary */}
            {scenes && scenes.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon="🏞️"
                  label="Total Scenes"
                  value={scenes.length}
                  color="#f59e0b"
                />
                <StatCard
                  icon="👁️"
                  label="Total Visits"
                  value={formatNumber(
                    scenes.reduce((sum, s) => sum + s.visit_count, 0)
                  )}
                  color="#3b82f6"
                />
                <StatCard
                  icon="⏱️"
                  label="Avg Time in Scene"
                  value={`${Math.round(scenes.reduce((sum, s) => sum + s.avg_time_spent_seconds, 0) / scenes.length / 60)}m`}
                  color="#8b5cf6"
                />
                <StatCard
                  icon="🚪"
                  label="Avg Exit Rate"
                  value={`${(scenes.reduce((sum, s) => sum + s.exit_rate_pct, 0) / scenes.length).toFixed(1)}%`}
                  color="#ef4444"
                />
              </div>
            )}

            {/* Full Scene Table */}
            <Card>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white text-sm font-bold">All Scenes</h3>
                  <span className="text-[10px] text-muted">
                    Sorted by visit count
                  </span>
                </div>
                {scenesLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : scenes && scenes.length > 0 ? (
                  <SceneAnalyticsTable
                    data={scenes}
                    onSceneClick={(id) => router.push(`/scenes/${id}`)}
                  />
                ) : (
                  <div className="text-center py-12 text-muted">
                    No scene analytics available
                  </div>
                )}
              </div>
            </Card>

            {/* Scene Insights */}
            {scenes && scenes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Most Popular */}
                <Card>
                  <div className="p-5">
                    <h3 className="text-white text-sm font-bold mb-4">
                      🔥 Most Popular
                    </h3>
                    <div className="space-y-3">
                      {scenes.slice(0, 3).map((scene, i) => (
                        <div
                          key={scene.scene_id}
                          className="flex items-center gap-3"
                        >
                          <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-[10px] font-bold text-accent">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white font-semibold truncate">
                              {scene.scene_name}
                            </div>
                            <div className="text-[10px] text-muted">
                              {scene.visit_count.toLocaleString()} visits
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* High Exit Rate */}
                <Card>
                  <div className="p-5">
                    <h3 className="text-white text-sm font-bold mb-4">
                      ⚠️ High Exit Rate
                    </h3>
                    <div className="space-y-3">
                      {[...scenes]
                        .sort((a, b) => b.exit_rate_pct - a.exit_rate_pct)
                        .slice(0, 3)
                        .map((scene) => (
                          <div
                            key={scene.scene_id}
                            className="flex items-center gap-3"
                          >
                            <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center text-[10px] font-bold text-red-400">
                              {Math.round(scene.exit_rate_pct)}%
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-white font-semibold truncate">
                                {scene.scene_name}
                              </div>
                              <div className="text-[10px] text-muted">
                                {scene.unique_visitors} unique visitors
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-white/40 mt-4">
                      High exit rates may indicate confusing navigation or
                      unengaging content.
                    </p>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* CHALLENGES TAB */}
        {/* ═══════════════════════════════════════════════ */}
        {activeTab === 'challenges' && (
          <div className="space-y-6">
            {/* Challenge Metrics Summary */}
            {challenges && challenges.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon="⚡"
                  label="Total Challenges"
                  value={challenges.length}
                  color="#f59e0b"
                />
                <StatCard
                  icon="🎯"
                  label="Total Attempts"
                  value={formatNumber(
                    challenges.reduce((sum, c) => sum + c.total_attempts, 0)
                  )}
                  color="#3b82f6"
                />
                <StatCard
                  icon="✅"
                  label="Avg Success Rate"
                  value={`${(challenges.reduce((sum, c) => sum + c.success_rate_pct, 0) / challenges.length).toFixed(1)}%`}
                  color="#10b981"
                />
                <StatCard
                  icon="⏭️"
                  label="Avg Skip Rate"
                  value={`${(challenges.reduce((sum, c) => sum + c.skip_rate_pct, 0) / challenges.length).toFixed(1)}%`}
                  color="#ef4444"
                />
              </div>
            )}

            {/* Full Challenge Table */}
            <Card>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white text-sm font-bold">
                    All Challenges
                  </h3>
                  <span className="text-[10px] text-muted">
                    Sorted by attempts
                  </span>
                </div>
                {challengesLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : challenges && challenges.length > 0 ? (
                  <ChallengeAnalyticsTable
                    data={challenges}
                    onChallengeClick={(id) => router.push(`/challenges/${id}`)}
                  />
                ) : (
                  <div className="text-center py-12 text-muted">
                    No challenge analytics available
                  </div>
                )}
              </div>
            </Card>

            {/* Challenge Insights */}
            {challenges && challenges.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Easiest */}
                <Card>
                  <div className="p-5">
                    <h3 className="text-white text-sm font-bold mb-4">
                      🟢 Easiest
                    </h3>
                    <div className="space-y-3">
                      {[...challenges]
                        .sort((a, b) => b.success_rate_pct - a.success_rate_pct)
                        .slice(0, 3)
                        .map((ch) => (
                          <div
                            key={ch.challenge_id}
                            className="flex items-center gap-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                              {Math.round(ch.success_rate_pct)}%
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-white font-semibold truncate">
                                {ch.challenge_name}
                              </div>
                              <div className="text-[10px] text-muted">
                                {ch.avg_attempts_to_complete.toFixed(1)} avg
                                attempts
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </Card>

                {/* Hardest */}
                <Card>
                  <div className="p-5">
                    <h3 className="text-white text-sm font-bold mb-4">
                      🔴 Hardest
                    </h3>
                    <div className="space-y-3">
                      {[...challenges]
                        .sort((a, b) => a.success_rate_pct - b.success_rate_pct)
                        .slice(0, 3)
                        .map((ch) => (
                          <div
                            key={ch.challenge_id}
                            className="flex items-center gap-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center text-[10px] font-bold text-red-400">
                              {Math.round(ch.success_rate_pct)}%
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-white font-semibold truncate">
                                {ch.challenge_name}
                              </div>
                              <div className="text-[10px] text-muted">
                                {ch.avg_attempts_to_complete.toFixed(1)} avg
                                attempts
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </Card>

                {/* Most Skipped */}
                <Card>
                  <div className="p-5">
                    <h3 className="text-white text-sm font-bold mb-4">
                      ⏭️ Most Skipped
                    </h3>
                    <div className="space-y-3">
                      {[...challenges]
                        .sort((a, b) => b.skip_rate_pct - a.skip_rate_pct)
                        .slice(0, 3)
                        .map((ch) => (
                          <div
                            key={ch.challenge_id}
                            className="flex items-center gap-3"
                          >
                            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-[10px] font-bold text-accent">
                              {Math.round(ch.skip_rate_pct)}%
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-white font-semibold truncate">
                                {ch.challenge_name}
                              </div>
                              <div className="text-[10px] text-muted">
                                {ch.total_attempts.toLocaleString()} attempts
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-white/40 mt-4">
                      High skip rates may indicate frustrating or unclear
                      challenges.
                    </p>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* HEARTS TAB */}
        {/* ═══════════════════════════════════════════════ */}
        {activeTab === 'hearts' && (
          <div className="space-y-6">
            {/* HEARTS Summary Stats */}
            {hearts && hearts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {hearts.map((h) => (
                  <div
                    key={h.facet}
                    className="rounded-xl border p-3 text-center"
                    style={{
                      backgroundColor: `${getHeartsColor(h.facet)}10`,
                      borderColor: `${getHeartsColor(h.facet)}30`,
                    }}
                  >
                    <div
                      className="text-2xl font-bold mb-1"
                      style={{ color: getHeartsColor(h.facet) }}
                    >
                      {Math.round(h.avg_score)}
                    </div>
                    <div
                      className="text-[10px] font-bold"
                      style={{ color: getHeartsColor(h.facet) }}
                    >
                      {h.facet}
                    </div>
                    <div className="text-[9px] text-muted">
                      {h.facet_name}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Visualization Toggle */}
            <Card>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white text-sm font-bold">
                    HEARTS Distribution
                  </h3>
                  <div className="flex items-center gap-1 p-1 bg-input rounded-lg">
                    <button
                      onClick={() => setHeartsView('bars')}
                      className={`px-3 py-1 rounded text-[10px] font-semibold transition-colors ${
                        heartsView === 'bars'
                          ? 'bg-accent/15 text-accent'
                          : 'text-muted hover:text-white/70'
                      }`}
                    >
                      📊 Bars
                    </button>
                    <button
                      onClick={() => setHeartsView('radar')}
                      className={`px-3 py-1 rounded text-[10px] font-semibold transition-colors ${
                        heartsView === 'radar'
                          ? 'bg-accent/15 text-accent'
                          : 'text-muted hover:text-white/70'
                      }`}
                    >
                      🎯 Radar
                    </button>
                  </div>
                </div>
                {heartsLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : hearts && hearts.length > 0 ? (
                  heartsView === 'bars' ? (
                    <HeartsBarChart data={hearts} />
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <HeartsRadarChart data={hearts} size={300} />
                    </div>
                  )
                ) : (
                  <div className="text-center py-12 text-muted">
                    No HEARTS data available
                  </div>
                )}
              </div>
            </Card>

            {/* HEARTS Details */}
            {hearts && hearts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Positive Events */}
                <Card>
                  <div className="p-5">
                    <h3 className="text-white text-sm font-bold mb-4">
                      📈 Positive Impact
                    </h3>
                    <div className="space-y-3">
                      {[...hearts]
                        .sort((a, b) => b.positive_events - a.positive_events)
                        .slice(0, 4)
                        .map((h) => (
                          <div
                            key={h.facet}
                            className="flex items-center gap-3"
                          >
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                              style={{
                                backgroundColor: getHeartsColor(h.facet),
                              }}
                            >
                              {h.facet}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-white font-semibold">
                                {h.facet_name}
                              </div>
                              <div className="text-[10px] text-muted">
                                +{h.positive_events.toLocaleString()} positive
                                events
                              </div>
                            </div>
                            <div className="text-emerald-400 text-xs font-semibold">
                              +
                              {h.total_delta > 0
                                ? h.total_delta.toFixed(0)
                                : '0'}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </Card>

                {/* Score Ranges */}
                <Card>
                  <div className="p-5">
                    <h3 className="text-white text-sm font-bold mb-4">
                      📊 Score Ranges
                    </h3>
                    <div className="space-y-3">
                      {hearts.map((h) => (
                        <div key={h.facet} className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ backgroundColor: getHeartsColor(h.facet) }}
                          >
                            {h.facet}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-muted">
                                {h.min_score} — {h.max_score}
                              </span>
                              <span
                                className="text-[10px] font-semibold"
                                style={{ color: getHeartsColor(h.facet) }}
                              >
                                avg {Math.round(h.avg_score)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-card rounded-full overflow-hidden relative">
                              {/* Range indicator */}
                              <div
                                className="absolute h-full opacity-30"
                                style={{
                                  left: `${h.min_score}%`,
                                  width: `${h.max_score - h.min_score}%`,
                                  backgroundColor: getHeartsColor(h.facet),
                                }}
                              />
                              {/* Average marker */}
                              <div
                                className="absolute w-1.5 h-full rounded-full"
                                style={{
                                  left: `${h.avg_score}%`,
                                  backgroundColor: getHeartsColor(h.facet),
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* HEARTS Explanation */}
            <Card>
              <div className="p-5">
                <h3 className="text-white text-sm font-bold mb-3">
                  About HEARTS Facets
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  {[
                    {
                      key: 'H',
                      name: 'Harmony',
                      desc: 'Balance & environmental connection',
                    },
                    {
                      key: 'E',
                      name: 'Empowerment',
                      desc: 'Confidence & self-efficacy',
                    },
                    {
                      key: 'A',
                      name: 'Awareness',
                      desc: 'Mindfulness & attention',
                    },
                    {
                      key: 'R',
                      name: 'Resilience',
                      desc: 'Adaptability & recovery',
                    },
                    { key: 'T', name: 'Tenacity', desc: 'Persistence & goals' },
                    {
                      key: 'Si',
                      name: 'Self-insight',
                      desc: 'Self-reflection & emotions',
                    },
                    { key: 'So', name: 'Social', desc: 'Connection & empathy' },
                  ].map((f) => (
                    <div
                      key={f.key}
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: `${getHeartsColor(f.key)}08` }}
                    >
                      <div
                        className="text-xs font-bold mb-1"
                        style={{ color: getHeartsColor(f.key) }}
                      >
                        {f.key} — {f.name}
                      </div>
                      <div className="text-[10px] text-muted">{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════
//  Helper
// ═══════════════════════════════════════════════

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
