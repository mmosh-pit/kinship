'use client'

import Link from 'next/link'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge, EmptyState } from '@/components/UI'
import { HEARTS_FACETS } from '@/lib/data'

const MOCK_ARCS = [
  {
    id: '1',
    name: 'Building Confidence',
    cycle: 'Week 1: Foundation',
    quests_count: 3,
    facet: 'E',
    status: 'published',
  },
  {
    id: '2',
    name: 'Finding Calm',
    cycle: 'Week 1: Foundation',
    quests_count: 2,
    facet: 'H',
    status: 'published',
  },
  {
    id: '3',
    name: 'Roots of Awareness',
    cycle: 'Week 1: Foundation',
    quests_count: 2,
    facet: 'A',
    status: 'draft',
  },
  {
    id: '4',
    name: 'Inner Strength',
    cycle: 'Week 2: Growth',
    quests_count: 3,
    facet: 'T',
    status: 'draft',
  },
  {
    id: '5',
    name: 'Bouncing Back',
    cycle: 'Week 2: Growth',
    quests_count: 2,
    facet: 'R',
    status: 'draft',
  },
]

export default function ArcsPage() {
  const { currentGame, isInGame } = useStudio()

  if (!isInGame) {
    return (
      <EmptyState
        icon="📖"
        title="Select a game first"
        description="Arcs are game-specific. Enter a game to manage its arcs."
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
        title="Arcs"
        subtitle="Narrative threads within cycles, each mapping to HEARTS facets"
        breadcrumbs={[
          { label: currentGame!.name, href: '/dashboard' },
          { label: 'Arcs' },
        ]}
        action={
          <Link
            href="/arcs/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold"
          >
            + New Arc
          </Link>
        }
      />

      <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-lg">💡</span>
          <div>
            <div className="text-xs font-bold text-blue-400 mb-1">
              What are Arcs?
            </div>
            <div className="text-xs text-white/70 leading-relaxed">
              Arcs are narrative threads within a Cycle. Each arc maps to one or
              more HEARTS facets and contains a sequence of Quests that tell a
              coherent story. The player experiences arcs as their
              &quot;emotional journey&quot; through the game.
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {MOCK_ARCS.map((arc) => {
          const facetData = HEARTS_FACETS.find((f) => f.key === arc.facet)
          return (
            <Card key={arc.id} hover>
              <div className="flex items-center gap-4 p-4">
                <FacetBadge facet={arc.facet} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-bold text-sm">{arc.name}</h3>
                    <StatusBadge status={arc.status} />
                  </div>
                  <div className="text-xs text-muted">
                    {arc.cycle} · {arc.quests_count} quests ·{' '}
                    {facetData?.name || arc.facet}
                  </div>
                </div>
                <span className="text-white/30 text-xs">→</span>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
