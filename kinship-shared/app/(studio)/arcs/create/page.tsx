'use client'

import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge } from '@/components/UI'
import { HEARTS_FACETS } from '@/lib/data'

export default function CreateArcPage() {
  const { currentGame } = useStudio()

  return (
    <>
      <PageHeader
        title="New Arc"
        subtitle="Create a narrative thread within a cycle"
        breadcrumbs={[
          { label: currentGame?.name || 'Game', href: '/dashboard' },
          { label: 'Arcs', href: '/arcs' },
          { label: 'Create' },
        ]}
      />

      <Card>
        <div className="p-6 max-w-lg space-y-4">
          <div>
            <label className="text-xs text-white/70 font-semibold block mb-1">
              Arc Name
            </label>
            <input
              placeholder="e.g. Building Confidence"
              className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="text-xs text-white/70 font-semibold block mb-1">
              Cycle
            </label>
            <select className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent/50">
              <option value="">Select a cycle...</option>
              <option value="1">Week 1: Foundation</option>
              <option value="2">Week 2: Growth</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-white/70 font-semibold block mb-2">
              Primary HEARTS Facet
            </label>
            <div className="flex flex-wrap gap-2">
              {HEARTS_FACETS.map((f) => (
                <button
                  key={f.key}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-card-border hover:border-white/[0.15] transition-colors"
                >
                  <FacetBadge facet={f.key} size="sm" />
                  <span className="text-xs text-white/70">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pt-2">
            <button className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold">
              Create Arc
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}
