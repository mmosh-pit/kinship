'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, SceneIcon } from '@/components/UI'
import {
  useScenes,
  useNPCs,
  useChallenges,
  useSceneManifest,
} from '@/hooks/useApi'
import { useStudio } from '@/lib/studio-context'

const ITEMS_PER_PAGE = 9

export default function ScenesPage() {
  const { currentGame } = useStudio()
  const { data: scenes, loading, error } = useScenes(undefined, currentGame?.id)
  const { data: npcsResponse } = useNPCs()
  const { data: challengesResponse } = useChallenges()
  const npcs = npcsResponse?.data || []
  const challenges = challengesResponse?.data || []

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')

  // Get unique scene types for filter
  const sceneTypes = useMemo(() => {
    if (!scenes) return []
    const types = [...new Set(scenes.map((s) => s.scene_type).filter(Boolean))]
    return types.sort()
  }, [scenes])

  // Filter scenes
  const filteredScenes = useMemo(() => {
    if (!scenes) return []
    let result = scenes

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      result = result.filter(
        (s) =>
          (s.scene_name || s.name || '').toLowerCase().includes(searchLower) ||
          (s.scene_type || '').toLowerCase().includes(searchLower) ||
          (s.description || '').toLowerCase().includes(searchLower)
      )
    }

    // Type filter
    if (filterType) {
      result = result.filter((s) => s.scene_type === filterType)
    }

    return result
  }, [scenes, search, filterType])

  // Pagination
  const totalPages = Math.ceil(filteredScenes.length / ITEMS_PER_PAGE)
  const paginatedScenes = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredScenes.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredScenes, page])

  // Reset page when filters change
  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleFilterType = (value: string) => {
    setFilterType(value)
    setPage(1)
  }

  // Count NPCs and challenges per scene
  const getNpcCount = (sceneId: string) =>
    npcs?.filter((n) => n.scene_id === sceneId).length || 0
  const getChallengeCount = (sceneId: string) =>
    challenges?.filter((c) => c.scene_id === sceneId).length || 0

  if (loading) {
    return (
      <>
        <PageHeader title="Scenes" subtitle="Loading..." />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden animate-pulse">
              <div className="h-40 bg-card" />
              <div className="p-5">
                <div className="h-5 bg-white/[0.1] rounded w-32 mb-2" />
                <div className="h-4 bg-card rounded w-24" />
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
        title="Scenes"
        subtitle={`${scenes?.length || 0} scenes for Flutter/Flame`}
        action={
          <div className="flex gap-2">
            {/* <Link
              href="/builder"
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl font-bold"
            >
              🔨 Builder
            </Link> */}
            {/* <Link
              href="/scenes/create"
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
            >
              + Create Scene
            </Link> */}
            <Link
              href="/builder"
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
            >
              🔨 Builder
            </Link>
          </div>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Search and Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search scenes by name, type, or description..."
              className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <select
              value={filterType}
              onChange={(e) => handleFilterType(e.target.value)}
              className="bg-card border border-card-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
            >
              <option value="">All Types</option>
              {sceneTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="text-muted text-sm">
            {filteredScenes.length} scene
            {filteredScenes.length !== 1 ? 's' : ''}
          </div>
        </div>
      </Card>

      {/* Scene Grid */}
      <div className="grid grid-cols-3 gap-4">
        {paginatedScenes.map((scene) => {
          const sceneName = scene.scene_name || scene.name || 'Untitled'
          const npcCount = getNpcCount(scene.id)
          const challengeCount = getChallengeCount(scene.id)
          const lighting = scene.ambient?.lighting || 'day'
          const weather = scene.ambient?.weather || 'clear'

          return (
            <Link key={scene.id} href={`/scenes/${scene.id}`}>
              <Card hover className="overflow-hidden h-full">
                {/* Preview area with lighting effect */}
                <div
                  className={`h-40 flex items-center justify-center border-b border-card-border relative bg-gradient-to-br ${
                    lighting === 'night'
                      ? 'from-indigo-950 to-[#050824]'
                      : lighting === 'dawn'
                        ? 'from-orange-900/30 to-[#050824]'
                        : lighting === 'dusk'
                          ? 'from-purple-900/30 to-[#050824]'
                          : 'from-sky-900/20 to-[#050824]'
                  }`}
                >
                  {/* Weather overlay */}
                  {weather === 'rain' && (
                    <div
                      className="absolute inset-0 opacity-10"
                      style={{
                        background:
                          'repeating-linear-gradient(180deg, transparent, transparent 4px, rgba(100,149,237,0.5) 4px, rgba(100,149,237,0.5) 5px)',
                      }}
                    />
                  )}
                  {weather === 'fog' && (
                    <div className="absolute inset-0 bg-white/[0.08]" />
                  )}
                  {weather === 'snow' && (
                    <div
                      className="absolute inset-0 opacity-20"
                      style={{
                        background:
                          'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 40%, white 1px, transparent 1px)',
                      }}
                    />
                  )}

                  <SceneIcon type={scene.scene_type || 'Unknown'} size="lg" />

                  {/* Type badge */}
                  <div className="absolute top-2 left-2 bg-sidebar/80 rounded-lg px-2 py-1">
                    <span className="text-white/70 text-[10px] uppercase tracking-wider">
                      {scene.scene_type}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div className="absolute top-2 right-2">
                    <StatusBadge
                      status={scene.is_active ? 'active' : 'draft'}
                    />
                  </div>
                </div>

                <div className="p-5">
                  {/* Scene name - prominently displayed */}
                  <h3 className="text-white font-semibold text-lg mb-1 truncate">
                    {sceneName}
                  </h3>
                  <p className="text-muted text-xs mb-3">
                    {scene.scene_type} · {lighting} · {weather}
                  </p>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-sidebar rounded-lg px-3 py-2 text-center">
                      <p className="text-white text-sm font-bold">
                        {scene.asset_ids?.length || 0}
                      </p>
                      <p className="text-white/40 text-[10px]">Assets</p>
                    </div>
                    <div className="bg-sidebar rounded-lg px-3 py-2 text-center">
                      <p className="text-white text-sm font-bold">{npcCount}</p>
                      <p className="text-white/40 text-[10px]">NPCs</p>
                    </div>
                    <div className="bg-sidebar rounded-lg px-3 py-2 text-center">
                      <p className="text-white text-sm font-bold">
                        {challengeCount}
                      </p>
                      <p className="text-white/40 text-[10px]">Challenges</p>
                    </div>
                  </div>

                  {/* System prompt indicator */}
                  {scene.system_prompt && (
                    <div className="flex items-center gap-1 text-accent text-xs">
                      <span>💬</span>
                      <span>Has system prompt</span>
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          )
        })}

        {/* Create New Scene Card */}
        <Link href="/scenes/create">
          <div className="border-2 border-dashed border-card-border rounded-2xl flex flex-col items-center justify-center hover:border-accent/40 transition-colors cursor-pointer h-full min-h-[300px]">
            <span className="text-4xl mb-3 opacity-30">✨</span>
            <p className="text-muted font-medium">Create New Scene</p>
            <p className="text-white/40 text-xs mt-1">
              Build for Flutter/Flame
            </p>
          </div>
        </Link>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl bg-card text-white/70 text-sm disabled:opacity-30 hover:bg-white/[0.1] disabled:hover:bg-card"
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
                  className={`w-10 h-10 rounded-xl text-sm ${
                    page === pageNum
                      ? 'bg-accent text-white font-bold'
                      : 'bg-card text-white/70 hover:bg-white/[0.1]'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-xl bg-card text-white/70 text-sm disabled:opacity-30 hover:bg-white/[0.1] disabled:hover:bg-card"
          >
            Next →
          </button>
        </div>
      )}

      {/* Empty State */}
      {filteredScenes.length === 0 && scenes && scenes.length > 0 && (
        <Card className="p-8 text-center mt-6">
          <p className="text-white/70 mb-2">No scenes match your search</p>
          <button
            onClick={() => {
              setSearch('')
              setFilterType('')
            }}
            className="text-accent text-sm hover:underline"
          >
            Clear filters
          </button>
        </Card>
      )}

      {scenes && scenes.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-white/70 mb-4">No scenes created yet</p>
          <Link
            href="/scenes/create"
            className="inline-block btn bg-accent hover:bg-accent-dark text-white rounded-xl px-4 py-2"
          >
            Create First Scene
          </Link>
        </Card>
      )}
    </>
  )
}
