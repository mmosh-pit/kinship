'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'
import { usePrompts } from '@/hooks/useApi'
import type { PromptStatus, Prompt } from '@/lib/types'

export default function GlobalPromptsPage() {
  const router = useRouter()
  const {
    data: prompts,
    loading,
    error,
    refetch,
  } = usePrompts({ tier: '1' } as any)

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

  // Loading state
  if (loading) {
    return (
      <>
        <PageHeader
          title="Global Constitution"
          subtitle="Loading..."
          breadcrumbs={[
            { label: 'Prompts', href: '/prompts' },
            { label: 'Global' },
          ]}
        />
        <Card className="p-6 animate-pulse">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white/[0.1]/30 rounded" />
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
          title="Global Constitution"
          subtitle="Error"
          breadcrumbs={[
            { label: 'Prompts', href: '/prompts' },
            { label: 'Global' },
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

  const globalPrompts = prompts || []

  return (
    <>
      <PageHeader
        title="🌍 Global Constitution"
        subtitle={`${globalPrompts.length} Tier 1 prompt${globalPrompts.length !== 1 ? 's' : ''}`}
        breadcrumbs={[
          { label: 'Prompts', href: '/prompts' },
          { label: 'Global' },
        ]}
        action={
          <Link
            href="/prompts/create"
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
          >
            + New Global Prompt
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {globalPrompts.length === 0 ? (
            <EmptyState
              icon="🌍"
              title="No global prompts"
              description="Create Tier 1 prompts that apply to all conversations."
              action={
                <Link
                  href="/prompts/create"
                  className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5"
                >
                  + Create Prompt
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {globalPrompts.map((prompt) => (
                <Card
                  key={prompt.id}
                  hover
                  className="p-6 cursor-pointer"
                  onClick={() => router.push(`/prompts/${prompt.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {prompt.is_guardian && <span title="Guardian">🛡️</span>}
                      <h3 className="text-white font-bold">{prompt.name}</h3>
                    </div>
                    <StatusBadge status={prompt.status} />
                  </div>
                  <p className="text-white/70 text-sm line-clamp-2 mb-3">
                    {prompt.content.substring(0, 200)}...
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>Priority: {prompt.priority}</span>
                    <span>•</span>
                    <span>v{prompt.version}</span>
                    <span>•</span>
                    <span>
                      Updated {new Date(prompt.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">About Tier 1</h3>
            <div className="space-y-3">
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Scope
                </p>
                <p className="text-white text-sm">All conversations</p>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Purpose
                </p>
                <p className="text-white/70 text-sm">
                  Core AI behavior rules, safety guidelines, and universal
                  instructions
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-purple-500/5 border-purple-500/20">
            <p className="text-purple-400 text-sm font-medium mb-1">
              🌍 Global Prompts
            </p>
            <p className="text-muted text-xs leading-relaxed">
              Tier 1 prompts are injected into every AI call regardless of scene
              or NPC context. They establish the foundational behavior and
              safety rules.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}
