'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'
import { usePrompts } from '@/hooks/useApi'
import type { PromptStatus } from '@/lib/types'

export default function GuardiansPage() {
  const router = useRouter()
  const {
    data: prompts,
    loading,
    error,
    refetch,
  } = usePrompts({ is_guardian: 'true' } as any)

  // Status badge
  const StatusBadge = ({ status }: { status: PromptStatus }) => {
    const styles: Record<PromptStatus, string> = {
      draft: 'bg-accent/15 text-accent border-accent/20',
      active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      archived: 'bg-white/[0.1] text-white/70 border-card-border',
    }
    return (
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${styles[status]}`}
      >
        {status}
      </span>
    )
  }

  // Tier badge
  const TierBadge = ({ tier }: { tier: number }) => {
    const colors: Record<number, string> = {
      1: 'bg-purple-500/15 text-purple-400',
      2: 'bg-blue-500/15 text-blue-400',
      3: 'bg-accent/15 text-accent',
    }
    return (
      <span
        className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${colors[tier] || colors[1]}`}
      >
        T{tier}
      </span>
    )
  }

  // Loading state
  if (loading) {
    return (
      <>
        <PageHeader
          title="Room Guardians"
          subtitle="Loading..."
          breadcrumbs={[
            { label: 'Prompts', href: '/prompts' },
            { label: 'Guardians' },
          ]}
        />
        <Card className="p-6 animate-pulse">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white/[0.1]/30 rounded" />
            ))}
          </div>
        </Card>
      </>
    )
  }

  // Error state
  if (error) {
    return (
      <>
        <PageHeader
          title="Room Guardians"
          subtitle="Error"
          breadcrumbs={[
            { label: 'Prompts', href: '/prompts' },
            { label: 'Guardians' },
          ]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="btn bg-accent hover:bg-accent-dark text-white rounded-xl px-4 py-2"
          >
            Retry
          </button>
        </Card>
      </>
    )
  }

  const guardianPrompts = prompts || []

  return (
    <>
      <PageHeader
        title="🛡️ Room Guardians"
        subtitle={`${guardianPrompts.length} guardian prompt${guardianPrompts.length !== 1 ? 's' : ''}`}
        breadcrumbs={[
          { label: 'Prompts', href: '/prompts' },
          { label: 'Guardians' },
        ]}
        action={
          <Link
            href="/prompts/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
          >
            + New Guardian
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {guardianPrompts.length === 0 ? (
            <EmptyState
              icon="🛡️"
              title="No guardian prompts"
              description="Create guardian prompts to enforce safety rules and persona boundaries."
              action={
                <Link
                  href="/prompts/create"
                  className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
                >
                  + Create Guardian
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {guardianPrompts.map((prompt) => (
                <Card
                  key={prompt.id}
                  hover
                  className="p-6 cursor-pointer border-red-500/10"
                  onClick={() => router.push(`/prompts/${prompt.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🛡️</span>
                      <h3 className="text-white font-bold">{prompt.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <TierBadge tier={prompt.tier} />
                      <StatusBadge status={prompt.status} />
                    </div>
                  </div>
                  <p className="text-white/70 text-sm line-clamp-2 mb-3">
                    {prompt.content.substring(0, 200)}...
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>Priority: {prompt.priority}</span>
                    {prompt.scene_type && (
                      <>
                        <span>•</span>
                        <span>Scene: {prompt.scene_type}</span>
                      </>
                    )}
                    {prompt.npc_id && (
                      <>
                        <span>•</span>
                        <span>NPC-specific</span>
                      </>
                    )}
                    <span>•</span>
                    <span>v{prompt.version}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">About Guardians</h3>
            <div className="space-y-3">
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Purpose
                </p>
                <p className="text-white/70 text-sm">
                  Enforce safety rules, maintain character boundaries, and
                  ensure appropriate responses.
                </p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Priority
                </p>
                <p className="text-white/70 text-sm">
                  Guardian prompts typically have high priority to ensure
                  they're processed first.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-red-500/5 border-red-500/20">
            <p className="text-red-400 text-sm font-medium mb-1">
              🛡️ Guardian Prompts
            </p>
            <p className="text-muted text-xs leading-relaxed">
              Guardian prompts act as safety rails for AI interactions. They
              enforce boundaries, prevent inappropriate content, and maintain
              consistent character behavior.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
