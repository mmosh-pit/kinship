'use client'

import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'

export default function OfferingsPage() {
  // Placeholder - will be connected to API
  const offerings: Array<{
    id: string
    name: string
    description: string
    price: string
    currency: string
    isActive: boolean
    sales: number
  }> = []

  return (
    <>
      <PageHeader
        title="Offerings"
        subtitle="Manage products and services for your agents"
        action={
          <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2">
            <span className="text-lg">+</span>
            Create Offering
          </button>
        }
      />

      {/* Empty State */}
      {offerings.length === 0 && (
        <EmptyState
          icon="🏪"
          title="No offerings yet"
          description="Create offerings to monetize your agent services. Define products, subscriptions, or one-time services that users can purchase."
          action={
            <button className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors">
              + Create Offering
            </button>
          }
        />
      )}

      {/* Offerings Grid */}
      {offerings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offerings.map((offering) => (
            <Card key={offering.id} hover className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <span className="text-accent text-lg">🏪</span>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    offering.isActive
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-white/10 text-muted'
                  }`}
                >
                  {offering.isActive ? 'Active' : 'Draft'}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1">{offering.name}</h3>
              <p className="text-sm text-muted line-clamp-2 mb-3">{offering.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-accent font-bold">
                  {offering.price} {offering.currency}
                </span>
                <span className="text-xs text-muted">{offering.sales} sales</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
