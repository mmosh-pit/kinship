'use client'

import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'

export default function AlignPage() {
  // Placeholder - will be connected to API
  const alignments: Array<{
    id: string
    name: string
    description: string
    agentCount: number
    isActive: boolean
  }> = []

  return (
    <>
      <PageHeader
        title="Align"
        subtitle="Configure agent workflows and orchestration patterns"
        action={
          <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2">
            <span className="text-lg">+</span>
            Create Alignment
          </button>
        }
      />

      {/* Empty State */}
      {alignments.length === 0 && (
        <EmptyState
          icon="🔄"
          title="No alignments configured"
          description="Create alignments to define how your agents coordinate and orchestrate tasks together. Alignments control the flow of information between agents."
          action={
            <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors">
              + Create Alignment
            </button>
          }
        />
      )}

      {/* Alignments Grid */}
      {alignments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {alignments.map((alignment) => (
            <Card key={alignment.id} hover className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <span className="text-accent text-lg">🔄</span>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    alignment.isActive
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-white/10 text-muted'
                  }`}
                >
                  {alignment.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1">{alignment.name}</h3>
              <p className="text-sm text-muted line-clamp-2">{alignment.description}</p>
              <p className="text-xs text-muted mt-3">{alignment.agentCount} agents</p>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
