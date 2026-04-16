'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge, EmptyState } from '@/components/UI'
import { useQuests } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type { BeatType, QuestStatus, HeartsFacet } from '@/lib/types'

const BEAT_TYPES: BeatType[] = [
  'Introduction',
  'Exploration',
  'Challenge',
  'Climax',
  'Reflection',
  'Resolution',
]

export default function QuestsPage() {
  const router = useRouter()
  const [beatFilter, setBeatFilter] = useState<BeatType | 'All'>('All')
  const [facetFilter, setFacetFilter] = useState<HeartsFacet | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<QuestStatus | 'All'>('All')
  const [searchQuery, setSearchQuery] = useState('')

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {}
    if (beatFilter !== 'All') params.beat_type = beatFilter
    if (facetFilter !== 'All') params.facet = facetFilter
    if (statusFilter !== 'All') params.status = statusFilter
    return Object.keys(params).length > 0 ? params : undefined
  }, [beatFilter, facetFilter, statusFilter])

  const { data: quests, loading, error, refetch } = useQuests(queryParams)

  const filteredQuests = useMemo(() => {
    if (!quests) return []
    if (!searchQuery.trim()) return quests
    const q = searchQuery.toLowerCase()
    return quests.filter(
      (quest) =>
        quest.name.toLowerCase().includes(q) ||
        quest.description.toLowerCase().includes(q)
    )
  }, [quests, searchQuery])

  if (loading) {
    return (
      <>
        <PageHeader
          title="Quests"
          subtitle="Quest beats and narrative arcs"
          action={
            <Link
              href="/quests/create"
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
            >
              + New Quest Beat
            </Link>
          }
        />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5 animate-pulse">
              <div className="flex items-center gap-5">
                <div className="w-10 h-10 rounded-xl bg-input" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-input rounded w-1/3" />
                  <div className="h-3 bg-white/[0.1]/30 rounded w-2/3" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-input" />
                <div className="w-20 h-6 rounded-full bg-input" />
              </div>
            </Card>
          ))}
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <PageHeader title="Quests" subtitle="Quest beats and narrative arcs" />
        <Card className="p-8 text-center">
          <div className="text-red-400 mb-4">
            <p className="font-medium">Failed to load quests</p>
            <p className="text-sm text-muted mt-1">{error}</p>
          </div>
          <button
            onClick={refetch}
            className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl px-5 py-2"
          >
            Try Again
          </button>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Quests"
        subtitle={`${filteredQuests.length} quest beat${filteredQuests.length !== 1 ? 's' : ''}`}
        action={
          <Link
            href="/quests/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
          >
            + New Quest Beat
          </Link>
        }
      />

      <div className="mb-6 space-y-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search quests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-card-border rounded-xl px-4 py-3 pl-11 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2 flex-wrap">
            <span className="text-muted text-sm self-center mr-1">
              Beat:
            </span>
            {['All', ...BEAT_TYPES].map((type) => (
              <button
                key={type}
                onClick={() => setBeatFilter(type as BeatType | 'All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${beatFilter === type ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-card text-white/70 hover:text-white border border-card-border'}`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-muted text-sm self-center mr-1">
              Facet:
            </span>
            <button
              onClick={() => setFacetFilter('All')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${facetFilter === 'All' ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-card text-white/70 border border-card-border'}`}
            >
              All
            </button>
            {HEARTS_FACETS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFacetFilter(f.key as HeartsFacet)}
                className={`w-8 h-8 rounded-lg text-xs font-bold ${facetFilter === f.key ? 'ring-2 ring-white/50 scale-110' : 'opacity-60 hover:opacity-100'}`}
                style={{ backgroundColor: f.color }}
                title={f.name}
              >
                {f.key}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <span className="text-muted text-sm self-center mr-1">
              Status:
            </span>
            {['All', 'draft', 'published', 'archived'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as QuestStatus | 'All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${statusFilter === status ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-card text-white/70 border border-card-border'}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredQuests.length === 0 ? (
        <EmptyState
          icon="⚔️"
          title="No quests found"
          description={
            searchQuery ||
            beatFilter !== 'All' ||
            facetFilter !== 'All' ||
            statusFilter !== 'All'
              ? 'No quests match your filters.'
              : 'Create your first quest beat.'
          }
          action={
            <Link
              href="/quests/create"
              className="btn bg-accent hover:bg-accent-dark text-white rounded-xl font-bold px-5 py-2.5"
            >
              + Create Quest
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredQuests.map((quest, i) => (
            <Card
              key={quest.id}
              hover
              className="p-5 group"
              onClick={() => router.push(`/quests/${quest.id}`)}
            >
              <div className="flex items-center gap-5">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sidebar/80 text-lg font-bold text-muted group-hover:text-accent">
                  {quest.sequence_order || i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-medium group-hover:text-accent">
                      {quest.name}
                    </h3>
                    <span className="text-white/40 text-xs bg-sidebar px-2 py-0.5 rounded-full">
                      {quest.beat_type}
                    </span>
                  </div>
                  <p className="text-muted text-sm truncate">
                    {quest.description || 'No description'}
                  </p>
                </div>
                <FacetBadge facet={quest.facet} size="md" />
                <StatusBadge status={quest.status} />
                <svg
                  className="w-5 h-5 text-white/40 group-hover:text-accent group-hover:translate-x-1 transition-all"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
