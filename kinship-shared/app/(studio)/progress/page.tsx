'use client'

import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import { useHeartsFacets, useHeartsStats } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'

export default function HeartsPage() {
  const { data: facets, loading, error } = useHeartsFacets()
  const { data: stats } = useHeartsStats()

  // Merge API data with static data for colors/display
  const mergedFacets = HEARTS_FACETS.map((staticFacet) => {
    const apiFacet = facets?.find((f) => f.key === staticFacet.key)
    const avgScore = stats?.averages?.[staticFacet.key] ?? null
    return {
      ...staticFacet,
      ...apiFacet,
      color: apiFacet?.color || staticFacet.color,
      avgScore,
    }
  })

  if (loading) {
    return (
      <>
        <PageHeader title="HEARTS Framework" subtitle="Loading..." />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.1]" />
                <div className="flex-1">
                  <div className="h-5 bg-white/[0.1] rounded w-24 mb-2" />
                  <div className="h-4 bg-card rounded w-40" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="HEARTS Framework"
        subtitle={`${mergedFacets.length} facets of personal growth measurement${stats?.total_players ? ` • ${stats.total_players} players` : ''}`}
        action={
          <Link
            href="/progress/rubric"
            className="btn bg-white/[0.1] border-white/[0.15] text-white hover:bg-white/[0.1] rounded-xl"
          >
            📋 Rubric Editor
          </Link>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-accent/15 border border-amber-500/30 rounded-xl">
          <p className="text-accent text-sm">
            ⚠️ Using cached data: {error}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {mergedFacets.map((f) => (
          <Link key={f.key} href={`/progress/${f.key}`}>
            <Card hover className="p-6">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
                  style={{ backgroundColor: f.color }}
                >
                  {f.key}
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-bold text-lg">{f.name}</h3>
                  <p className="text-muted text-sm line-clamp-1">
                    {f.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white text-2xl font-bold">
                    {f.avgScore !== null ? f.avgScore : '—'}
                  </p>
                  <p className="text-white/40 text-xs">avg score</p>
                </div>
              </div>
              <div className="mt-4 h-2 bg-sidebar rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    backgroundColor: f.color,
                    width: f.avgScore !== null ? `${f.avgScore}%` : '0%',
                  }}
                />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Stats Summary */}
      {stats && stats.total_players > 0 && (
        <Card className="mt-6 p-6">
          <h3 className="text-white font-bold mb-4">Player Statistics</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-accent">
                {stats.total_players}
              </p>
              <p className="text-muted text-sm">Total Players</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-400">
                {Math.round(
                  Object.values(stats.averages).reduce((a, b) => a + b, 0) / 7
                )}
              </p>
              <p className="text-muted text-sm">Overall Avg</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-400">
                {Object.entries(stats.averages).sort(
                  (a, b) => b[1] - a[1]
                )[0]?.[0] || '—'}
              </p>
              <p className="text-muted text-sm">Highest Facet</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-accent">
                {Object.entries(stats.averages).sort(
                  (a, b) => a[1] - b[1]
                )[0]?.[0] || '—'}
              </p>
              <p className="text-muted text-sm">Lowest Facet</p>
            </div>
          </div>
        </Card>
      )}

      {/* No Players Message */}
      {stats && stats.total_players === 0 && (
        <Card className="mt-6 p-6 text-center">
          <p className="text-white/70">
            No player data yet. Scores will appear once players start using the
            app.
          </p>
        </Card>
      )}
    </>
  )
}
