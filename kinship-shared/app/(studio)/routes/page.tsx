'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, SceneIcon } from '@/components/UI'
import { useRoutes, useScenes, useChallenges } from '@/hooks/useApi'

const ITEMS_PER_PAGE = 10

const TRIGGER_ICONS: Record<string, string> = {
  quest_complete: '⚔️',
  challenge_complete: '⚡',
  npc_dialogue: '💬',
  exit_zone: '🚪',
  hearts_threshold: '💚',
  manual: '🎮',
}

const TRIGGER_LABELS: Record<string, string> = {
  quest_complete: 'Quest Complete',
  challenge_complete: 'Challenge Complete',
  npc_dialogue: 'NPC Dialogue',
  exit_zone: 'Exit Zone',
  hearts_threshold: 'HEARTS Threshold',
  manual: 'Manual',
}

const ROUTE_TYPE_LABELS: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  scene_to_scene: {
    label: 'Scene → Scene',
    icon: '🏞️',
    color: 'text-accent bg-accent/20',
  },
  challenge_within_scene: {
    label: 'Challenge → Challenge',
    icon: '⚡',
    color: 'text-accent bg-amber-400/10',
  },
  challenge_between_scenes: {
    label: 'Challenge → Scene',
    icon: '🔀',
    color: 'text-purple-400 bg-purple-400/10',
  },
}

export default function RoutesPage() {
  const { data: routes, loading, error } = useRoutes()
  const { data: scenes } = useScenes()
  const { data: challengesResponse } = useChallenges()
  const challenges = challengesResponse?.data || []

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [page, setPage] = useState(1)

  // Helper functions
  const getSceneName = (sceneId: string | null) => {
    if (!sceneId) return 'Unknown'
    if (sceneId === '*') return 'Any Scene'
    const scene = scenes?.find((s) => s.id === sceneId)
    return scene?.scene_name || scene?.name || 'Unknown'
  }

  const getSceneType = (sceneId: string | null) => {
    if (!sceneId || sceneId === '*') return 'Any'
    const scene = scenes?.find((s) => s.id === sceneId)
    return scene?.scene_type || 'Unknown'
  }

  const getChallengeName = (challengeId: string | null) => {
    if (!challengeId) return null
    const challenge = challenges?.find((c) => c.id === challengeId)
    return challenge?.name || null
  }

  // Determine route type
  const getRouteType = (route: any) => {
    if (route.from_challenge && route.to_challenge) {
      if (route.from_scene === route.to_scene) {
        return 'challenge_within_scene'
      }
      return 'challenge_between_scenes'
    }
    if (route.from_challenge || route.to_challenge) {
      return 'challenge_between_scenes'
    }
    return 'scene_to_scene'
  }

  // Filter and search routes
  const filteredRoutes = useMemo(() => {
    if (!routes) return []
    let result = routes

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.name?.toLowerCase().includes(searchLower) ||
          r.description?.toLowerCase().includes(searchLower) ||
          getSceneName(r.from_scene).toLowerCase().includes(searchLower) ||
          getSceneName(r.to_scene).toLowerCase().includes(searchLower) ||
          getChallengeName(r.from_challenge)
            ?.toLowerCase()
            .includes(searchLower) ||
          getChallengeName(r.to_challenge)?.toLowerCase().includes(searchLower)
      )
    }

    // Type filter
    if (filterType) {
      result = result.filter((r) => getRouteType(r) === filterType)
    }

    return result
  }, [routes, search, filterType, scenes, challenges])

  // Pagination
  const totalPages = Math.ceil(filteredRoutes.length / ITEMS_PER_PAGE)
  const paginatedRoutes = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredRoutes.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredRoutes, page])

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleFilterType = (value: string) => {
    setFilterType(value)
    setPage(1)
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Routes" subtitle="Loading..." />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/[0.1]" />
                <div className="h-5 bg-white/[0.1] rounded w-48" />
                <div className="flex-1 h-4 bg-card rounded" />
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
        title="Routes"
        subtitle={`${routes?.length || 0} routes configured`}
        action={
          <Link
            href="/routes/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            + New Route
          </Link>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Search and Filter */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search routes by name, scene, or challenge..."
              className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <select
              value={filterType}
              onChange={(e) => handleFilterType(e.target.value)}
              className="bg-card border border-card-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
            >
              <option value="">All Route Types</option>
              <option value="scene_to_scene">🏞️ Scene → Scene</option>
              <option value="challenge_within_scene">
                ⚡ Challenge → Challenge (same scene)
              </option>
              <option value="challenge_between_scenes">
                🔀 Challenge → Scene (cross-scene)
              </option>
            </select>
          </div>
          <div className="text-muted text-sm">
            {filteredRoutes.length} route
            {filteredRoutes.length !== 1 ? 's' : ''}
          </div>
        </div>
      </Card>

      {/* Route List */}
      {paginatedRoutes.length > 0 ? (
        <div className="space-y-3">
          {paginatedRoutes.map((route) => {
            const routeType = getRouteType(route)
            const routeTypeInfo = ROUTE_TYPE_LABELS[routeType]
            const fromChallengeName = getChallengeName(route.from_challenge)
            const toChallengeName = getChallengeName(route.to_challenge)

            return (
              <Link key={route.id} href={`/routes/${route.id}`}>
                <Card hover className="p-5 mb-3">
                  <div className="flex items-center gap-4">
                    {/* Route type icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${routeTypeInfo.color}`}
                    >
                      {routeTypeInfo.icon}
                    </div>

                    {/* From → To */}
                    <div className="flex items-center gap-3 min-w-[320px]">
                      {/* From */}
                      <div className="flex items-center gap-2">
                        {fromChallengeName ? (
                          <>
                            <span className="text-accent">⚡</span>
                            <div>
                              <span className="text-white text-sm font-medium truncate max-w-[100px] block">
                                {fromChallengeName}
                              </span>
                              <span className="text-muted text-[10px]">
                                in {getSceneName(route.from_scene)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <SceneIcon
                              type={getSceneType(route.from_scene)}
                              size="sm"
                            />
                            <span className="text-white text-sm font-medium truncate max-w-[100px]">
                              {getSceneName(route.from_scene)}
                            </span>
                          </>
                        )}
                      </div>

                      <span className="text-accent text-lg">→</span>

                      {/* To */}
                      <div className="flex items-center gap-2">
                        {toChallengeName ? (
                          <>
                            <span className="text-accent">⚡</span>
                            <div>
                              <span className="text-white text-sm font-medium truncate max-w-[100px] block">
                                {toChallengeName}
                              </span>
                              <span className="text-muted text-[10px]">
                                in {getSceneName(route.to_scene)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <SceneIcon
                              type={getSceneType(route.to_scene)}
                              size="sm"
                            />
                            <span className="text-white text-sm font-medium truncate max-w-[100px]">
                              {getSceneName(route.to_scene)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Name & Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">
                        {route.name}
                      </p>
                      {route.description && (
                        <p className="text-muted text-xs truncate">
                          {route.description}
                        </p>
                      )}
                    </div>

                    {/* Route type badge */}
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap ${routeTypeInfo.color}`}
                    >
                      {routeTypeInfo.label}
                    </span>

                    {/* Trigger badge */}
                    {route.trigger_type && (
                      <span className="text-xs bg-sidebar text-white/70 px-3 py-1 rounded-full whitespace-nowrap flex items-center gap-1">
                        <span>{TRIGGER_ICONS[route.trigger_type] || '🔀'}</span>
                        {TRIGGER_LABELS[route.trigger_type] ||
                          route.trigger_type}
                      </span>
                    )}

                    {/* Bidirectional */}
                    {route.bidirectional && (
                      <span className="text-xs bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full">
                        ↔️
                      </span>
                    )}

                    <StatusBadge status={route.status} />
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <Card className="p-8 text-center">
          {routes && routes.length > 0 ? (
            <>
              <p className="text-white/70 mb-2">No routes match your search</p>
              <button
                onClick={() => {
                  setSearch('')
                  setFilterType('')
                }}
                className="text-accent text-sm hover:underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-white/70 mb-4">No routes configured yet</p>
              <Link
                href="/routes/create"
                className="inline-block btn bg-accent hover:bg-accent-dark text-white rounded-xl px-4 py-2"
              >
                Create First Route
              </Link>
            </>
          )}
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-card text-white/70 text-sm disabled:opacity-30 hover:bg-white/[0.1]"
          >
            ← Previous
          </button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (page <= 3) {
                pageNum = i + 1
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 rounded-xl text-sm ${page === pageNum ? 'bg-accent text-white font-bold' : 'bg-card text-white/70 hover:bg-white/[0.1]'}`}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-xl bg-card text-white/70 text-sm disabled:opacity-30 hover:bg-white/[0.1]"
          >
            Next →
          </button>
        </div>
      )}
    </>
  )
}
