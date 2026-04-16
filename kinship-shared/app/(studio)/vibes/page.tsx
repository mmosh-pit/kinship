'use client'

import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'

export default function VibesPage() {
  // Placeholder - will be connected to API
  const signals: Array<{
    id: string
    name: string
    description: string
    type: string
    frequency: string
    lastTriggered: string | null
  }> = []

  return (
    <>
      <PageHeader
        title="Vibes"
        subtitle="Monitor agent signals and behavioral patterns"
        action={
          <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2">
            <span className="text-lg">+</span>
            Create Signal
          </button>
        }
      />

      {/* Empty State */}
      {signals.length === 0 && (
        <EmptyState
          icon="📡"
          title="No signals configured"
          description="Create signals to monitor agent behavior and receive notifications when specific conditions are met. Use vibes to track agent performance and health."
          action={
            <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors">
              + Create Signal
            </button>
          }
        />
      )}

      {/* Signals Grid */}
      {signals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map((signal) => (
            <Card key={signal.id} hover className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <span className="text-accent text-lg">📡</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-muted">
                  {signal.frequency}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1">{signal.name}</h3>
              <p className="text-sm text-muted line-clamp-2">{signal.description}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted">{signal.type}</span>
                {signal.lastTriggered && (
                  <span className="text-xs text-muted">
                    Last: {new Date(signal.lastTriggered).toLocaleDateString()}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
