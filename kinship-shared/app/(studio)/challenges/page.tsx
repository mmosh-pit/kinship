'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge, EmptyState } from '@/components/UI'
import { useChallenges } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type { Difficulty, ChallengeStatus, HeartsFacet } from '@/lib/types'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

export default function ChallengesPage() {
  const router = useRouter()
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'All'>(
    'All'
  )
  const [facetFilter, setFacetFilter] = useState<HeartsFacet | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<ChallengeStatus | 'All'>(
    'All'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Build query params including pagination
  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = {
      page: currentPage,
      limit: pageSize,
    }
    if (difficultyFilter !== 'All')
      params.difficulty = difficultyFilter.toLowerCase()
    if (statusFilter !== 'All') params.status = statusFilter
    return params
  }, [difficultyFilter, statusFilter, currentPage, pageSize])

  const { data: response, loading, error, refetch } = useChallenges(queryParams)

  // Extract challenges and pagination from response
  const challenges = response?.data ?? []
  const pagination = response?.pagination ?? {
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 1,
  }

  // Client-side search and facet filter
  const filteredChallenges = useMemo(() => {
    if (!challenges) return []
    let result = challenges

    // Facet filter (client-side since API may not support it)
    if (facetFilter !== 'All') {
      result = result.filter((ch) => ch.facets.includes(facetFilter))
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (ch) =>
          ch.name.toLowerCase().includes(q) ||
          (ch.description?.toLowerCase().includes(q) ?? false)
      )
    }

    return result
  }, [challenges, facetFilter, searchQuery])

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (val: any) => void, value: any) => {
    setter(value)
    setCurrentPage(1)
  }

  // Difficulty badge component
  const DifficultyBadge = ({ difficulty }: { difficulty: Difficulty }) => {
    const styles: Record<Difficulty, string> = {
      Easy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      Medium: 'bg-accent/15 text-accent border-accent/20',
      Hard: 'bg-red-500/15 text-red-400 border-red-500/20',
    }
    return (
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${styles[difficulty]}`}
      >
        {difficulty}
      </span>
    )
  }

  // Pagination component
  const PaginationControls = () => {
    const { page, total, total_pages } = pagination

    if (total_pages <= 1) return null

    return (
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-card-border">
        <div className="text-sm text-muted">
          Showing {(page - 1) * pageSize + 1} -{' '}
          {Math.min(page * pageSize, total)} of {total} challenges
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card text-white/70 hover:text-white border border-card-border hover:border-card-border disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            First
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card text-white/70 hover:text-white border border-card-border hover:border-card-border disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            ← Prev
          </button>
          <span className="px-4 py-1.5 text-sm text-white">
            Page {page} of {total_pages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(total_pages, p + 1))}
            disabled={page === total_pages}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card text-white/70 hover:text-white border border-card-border hover:border-card-border disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Next →
          </button>
          <button
            onClick={() => setCurrentPage(total_pages)}
            disabled={page === total_pages}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card text-white/70 hover:text-white border border-card-border hover:border-card-border disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Last
          </button>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="ml-4 px-3 py-1.5 rounded-lg text-xs font-medium bg-card text-white/70 border border-card-border hover:border-card-border transition-all"
          >
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </div>
    )
  }

  // Loading skeleton
  if (loading) {
    return (
      <>
        <PageHeader
          title="Challenges"
          subtitle="Interactive activities and skill-building exercises"
          action={
            <Link
              href="/challenges/create"
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
            >
              + New Challenge
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-5 bg-input rounded w-1/2 mb-3" />
              <div className="h-4 bg-white/[0.1]/30 rounded w-full mb-2" />
              <div className="h-4 bg-white/[0.1]/30 rounded w-3/4 mb-4" />
              <div className="flex gap-2">
                <div className="w-6 h-6 bg-input rounded" />
                <div className="w-6 h-6 bg-input rounded" />
              </div>
            </Card>
          ))}
        </div>
      </>
    )
  }

  // Error state
  if (error) {
    return (
      <>
        <PageHeader
          title="Challenges"
          subtitle="Interactive activities and skill-building exercises"
        />
        <Card className="p-8 text-center">
          <div className="text-red-400 mb-4">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-60"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="font-medium">Failed to load challenges</p>
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
        title="Challenges"
        subtitle={`${pagination.total} challenge${pagination.total !== 1 ? 's' : ''} total`}
        action={
          <Link
            href="/challenges/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 transition-all hover:scale-105"
          >
            + New Challenge
          </Link>
        }
      />

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search challenges..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-card-border rounded-xl px-4 py-3 pl-11 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
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

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-4">
          {/* Difficulty Filter */}
          <div className="flex gap-2">
            <span className="text-muted text-sm self-center mr-1">
              Difficulty:
            </span>
            {['All', ...DIFFICULTIES].map((diff) => (
              <button
                key={diff}
                onClick={() =>
                  handleFilterChange(
                    setDifficultyFilter,
                    diff as Difficulty | 'All'
                  )
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  difficultyFilter === diff
                    ? diff === 'Easy'
                      ? 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/30'
                      : diff === 'Medium'
                        ? 'bg-amber-400/15 text-accent border border-amber-400/30'
                        : diff === 'Hard'
                          ? 'bg-red-400/15 text-red-400 border border-red-400/30'
                          : 'bg-accent/20 text-accent border border-accent/40'
                    : 'bg-card text-white/70 hover:text-white border border-card-border hover:border-card-border'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>

          {/* Facet Filter */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-muted text-sm self-center mr-1">
              Facet:
            </span>
            <button
              onClick={() => handleFilterChange(setFacetFilter, 'All')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                facetFilter === 'All'
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-card text-white/70 hover:text-white border border-card-border hover:border-card-border'
              }`}
            >
              All
            </button>
            {HEARTS_FACETS.map((f) => (
              <button
                key={f.key}
                onClick={() =>
                  handleFilterChange(setFacetFilter, f.key as HeartsFacet)
                }
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  facetFilter === f.key
                    ? 'ring-2 ring-white/50 scale-110'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{ backgroundColor: f.color }}
                title={f.name}
              >
                {f.key}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <span className="text-muted text-sm self-center mr-1">
              Status:
            </span>
            {['All', 'draft', 'active', 'archived'].map((status) => (
              <button
                key={status}
                onClick={() =>
                  handleFilterChange(
                    setStatusFilter,
                    status as ChallengeStatus | 'All'
                  )
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                  statusFilter === status
                    ? 'bg-accent/20 text-accent border border-accent/40'
                    : 'bg-card text-white/70 hover:text-white border border-card-border hover:border-card-border'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Challenge Grid */}
      {filteredChallenges.length === 0 ? (
        <EmptyState
          icon="⚡"
          title="No challenges found"
          description={
            searchQuery ||
            difficultyFilter !== 'All' ||
            facetFilter !== 'All' ||
            statusFilter !== 'All'
              ? 'No challenges match your filters. Try adjusting your search.'
              : 'Create engaging challenges for players to complete.'
          }
          action={
            <Link
              href="/challenges/create"
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
            >
              + Create Challenge
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredChallenges.map((ch) => (
            <Card
              key={ch.id}
              hover
              className="p-6 group"
              onClick={() => router.push(`/challenges/${ch.id}`)}
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-white font-bold group-hover:text-accent transition-colors">
                  {ch.name}
                </h3>
                <DifficultyBadge difficulty={ch.difficulty} />
                <StatusBadge status={ch.status} />
              </div>
              <p className="text-muted text-sm line-clamp-2 mb-4">
                {ch.description || 'No description'}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {ch.facets.map((f) => (
                    <FacetBadge key={f} facet={f} size="sm" />
                  ))}
                </div>
                <div className="flex items-center gap-3 text-muted text-xs">
                  <span>{ch.steps?.length || 0} steps</span>
                  {ch.time_limit_sec && (
                    <span className="flex items-center gap-1">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {Math.floor(ch.time_limit_sec / 60)}m
                    </span>
                  )}
                  <span className="text-accent">+{ch.base_delta}</span>
                </div>
              </div>
            </Card>
          ))}

          {/* Add New Card */}
          <Link href="/challenges/create">
            <div className="border-2 border-dashed border-card-border rounded-2xl p-6 flex flex-col items-center justify-center hover:border-accent/40 hover:bg-card/30 transition-all cursor-pointer h-full min-h-[160px]">
              <span className="text-3xl mb-2 opacity-40">➕</span>
              <p className="text-muted text-sm">Create New Challenge</p>
            </div>
          </Link>
        </div>
      )}

      {/* Pagination */}
      <PaginationControls />
    </>
  )
}
