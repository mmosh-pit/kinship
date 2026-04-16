'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge, EmptyState } from '@/components/UI'
import { useNPCs } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type { NPCStatus, HeartsFacet } from '@/lib/types'

export default function NPCsPage() {
  const router = useRouter()
  const [facetFilter, setFacetFilter] = useState<HeartsFacet | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<NPCStatus | 'All'>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Build query params for API including pagination
  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = {
      page: currentPage,
      limit: pageSize,
    }
    if (facetFilter !== 'All') params.facet = facetFilter
    if (statusFilter !== 'All') params.status = statusFilter
    return params
  }, [facetFilter, statusFilter, currentPage, pageSize])

  const { data: response, loading, error, refetch } = useNPCs(queryParams)

  // Extract NPCs and pagination from response
  const npcs = response?.data ?? []
  const pagination = response?.pagination ?? {
    page: 1,
    limit: 10,
    total: 0,
    total_pages: 1,
  }

  // Client-side search filter
  const filteredNPCs = useMemo(() => {
    if (!npcs) return []
    if (!searchQuery.trim()) return npcs
    const q = searchQuery.toLowerCase()
    return npcs.filter(
      (npc) =>
        npc.name.toLowerCase().includes(q) ||
        (npc.role?.toLowerCase().includes(q) ?? false) ||
        (npc.personality?.toLowerCase().includes(q) ?? false)
    )
  }, [npcs, searchQuery])

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (val: any) => void, value: any) => {
    setter(value)
    setCurrentPage(1)
  }

  // Pagination component
  const PaginationControls = () => {
    const { page, total, total_pages } = pagination

    if (total_pages <= 1) return null

    return (
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-card-border">
        <div className="text-sm text-muted">
          Showing {(page - 1) * pageSize + 1} -{' '}
          {Math.min(page * pageSize, total)} of {total} NPCs
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
          title="NPCs"
          subtitle="Non-player characters and their personas"
          action={
            <Link
              href="/npcs/create"
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
            >
              + New NPC
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-input" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-input rounded w-1/3" />
                  <div className="h-4 bg-white/[0.1]/30 rounded w-1/2" />
                  <div className="h-4 bg-white/[0.1]/30 rounded w-full" />
                </div>
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
          title="NPCs"
          subtitle="Non-player characters and their personas"
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
            <p className="font-medium">Failed to load NPCs</p>
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
        title="NPCs"
        subtitle={`${pagination.total} character${pagination.total !== 1 ? 's' : ''} total`}
        action={
          <Link
            href="/npcs/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 transition-all hover:scale-105"
          >
            + New NPC
          </Link>
        }
      />

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search NPCs by name, role, or personality..."
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
                    status as NPCStatus | 'All'
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

      {/* NPC Grid */}
      {filteredNPCs.length === 0 ? (
        <EmptyState
          icon="🧑"
          title="No NPCs found"
          description={
            searchQuery || facetFilter !== 'All' || statusFilter !== 'All'
              ? 'No NPCs match your filters. Try adjusting your search.'
              : 'Create your first NPC character to populate your world.'
          }
          action={
            <Link
              href="/npcs/create"
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
            >
              + Create NPC
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredNPCs.map((npc) => (
            <Card
              key={npc.id}
              hover
              className="p-6 group"
              onClick={() => router.push(`/npcs/${npc.id}`)}
            >
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-sidebar/80 flex items-center justify-center text-3xl shrink-0 group-hover:scale-105 transition-transform">
                  🧑
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-bold group-hover:text-accent transition-colors">
                      {npc.name}
                    </h3>
                    <FacetBadge facet={npc.facet} size="sm" />
                    <StatusBadge status={npc.status} />
                  </div>
                  <p className="text-accent text-sm mb-2">{npc.role}</p>
                  <p className="text-muted text-sm line-clamp-2">
                    {npc.personality || 'No personality defined'}
                  </p>
                  {npc.catchphrases && npc.catchphrases.length > 0 && (
                    <p className="text-white/40 text-xs mt-2 italic">
                      "{npc.catchphrases[0]}"
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {/* Add New Card */}
          <Link href="/npcs/create">
            <div className="border-2 border-dashed border-card-border rounded-2xl p-6 flex flex-col items-center justify-center hover:border-accent/40 hover:bg-card/30 transition-all cursor-pointer h-full min-h-[140px]">
              <span className="text-3xl mb-2 opacity-40">➕</span>
              <p className="text-muted text-sm">Create New NPC</p>
            </div>
          </Link>
        </div>
      )}

      {/* Pagination */}
      <PaginationControls />
    </>
  )
}
