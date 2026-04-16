'use client'

import Link from 'next/link'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetTag, EmptyState } from '@/components/UI'
import { HEARTS_FACETS } from '@/lib/data'

// TODO: Replace with API hook when backend is ready
const MOCK_CYCLES = [
  {
    id: '1',
    name: 'Week 1: Foundation',
    description: 'Establishing core emotional awareness',
    arcs_count: 3,
    facets: ['E', 'A', 'H'],
    status: 'published',
    order: 1,
  },
  {
    id: '2',
    name: 'Week 2: Growth',
    description: 'Building resilience and tenacity',
    arcs_count: 2,
    facets: ['T', 'R'],
    status: 'draft',
    order: 2,
  },
  {
    id: '3',
    name: 'Week 3: Connection',
    description: 'Developing social bonds and self-insight',
    arcs_count: 2,
    facets: ['So', 'Si'],
    status: 'draft',
    order: 3,
  },
]

export default function CyclesPage() {
  const { currentGame, isInGame } = useStudio()

  if (!isInGame) {
    return (
      <EmptyState
        icon="🔄"
        title="Select a game first"
        description="Cycles are game-specific. Enter a game to manage its cycles."
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

  return (
    <>
      <PageHeader
        title="Cycles"
        subtitle="Time-bound content groupings that control player pacing"
        breadcrumbs={[
          { label: currentGame!.name, href: '/dashboard' },
          { label: 'Cycles' },
        ]}
        action={
          <Link
            href="/cycles/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            + New Cycle
          </Link>
        }
      />

      {/* Info banner */}
      <div className="bg-orange-500/5 border border-orange-500/15 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-lg">💡</span>
          <div>
            <div className="text-xs font-bold text-orange-400 mb-1">
              What are Cycles?
            </div>
            <div className="text-xs text-white/70 leading-relaxed">
              Cycles are time-bound content groupings (e.g. &quot;Week 1&quot;,
              &quot;Month 2&quot;) that control the player&apos;s progression
              pace. Each cycle contains multiple Arcs that target specific
              HEARTS facets.
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {MOCK_CYCLES.map((cycle) => (
          <Card key={cycle.id} hover>
            <div className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-sm font-bold">
                {cycle.order}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-white font-bold text-sm">{cycle.name}</h3>
                  <StatusBadge status={cycle.status} />
                </div>
                <p className="text-muted text-xs mb-2">
                  {cycle.description}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/40">
                    {cycle.arcs_count} arcs ·
                  </span>
                  <div className="flex gap-1">
                    {cycle.facets.map((f) => (
                      <FacetTag key={f} facet={f} />
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-white/30 text-xs">→</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
