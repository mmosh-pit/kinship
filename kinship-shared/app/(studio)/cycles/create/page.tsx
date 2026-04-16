'use client'

import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'

export default function CreateCyclePage() {
  const { currentGame } = useStudio()

  return (
    <>
      <PageHeader
        title="New Cycle"
        subtitle="Create a new time-bound content grouping"
        breadcrumbs={[
          { label: currentGame?.name || 'Game', href: '/dashboard' },
          { label: 'Cycles', href: '/cycles' },
          { label: 'Create' },
        ]}
      />

      <Card>
        <div className="p-6 max-w-lg space-y-4">
          <div>
            <label className="text-xs text-white/70 font-semibold block mb-1">
              Cycle Name
            </label>
            <input
              placeholder="e.g. Week 1: Foundation"
              className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="text-xs text-white/70 font-semibold block mb-1">
              Description
            </label>
            <textarea
              placeholder="What is this cycle about?"
              rows={3}
              className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-white/70 font-semibold block mb-1">
              Order
            </label>
            <input
              type="number"
              defaultValue={1}
              min={1}
              className="w-32 bg-input border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-accent/50"
            />
          </div>
          <div className="pt-2">
            <button className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold">
              Create Cycle
            </button>
          </div>
        </div>
      </Card>
    </>
  )
}
