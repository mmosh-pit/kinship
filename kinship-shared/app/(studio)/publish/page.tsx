'use client'

import Link from 'next/link'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'

const STEPS = [
  {
    num: 1,
    label: 'Validate Game',
    desc: 'Check for broken routes, missing assets, orphaned scenes',
    status: 'ready' as const,
  },
  {
    num: 2,
    label: 'Build Web Preview',
    desc: 'Deploy to Flutter Web for testing in browser',
    status: 'ready' as const,
  },
  {
    num: 3,
    label: 'Build Mobile',
    desc: 'Generate Flutter mobile build for iOS & Android',
    status: 'pending' as const,
  },
  {
    num: 4,
    label: 'Export Manifest',
    desc: 'Download full game manifest as JSON',
    status: 'ready' as const,
  },
]

export default function PublishPage() {
  const { currentGame, isInGame } = useStudio()

  if (!isInGame) {
    return (
      <EmptyState
        icon="🚀"
        title="Select a game first"
        description="Publishing is game-specific."
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
        title="Publish"
        subtitle={`Build and deploy ${currentGame!.name}`}
        breadcrumbs={[
          { label: currentGame!.name, href: '/dashboard' },
          { label: 'Publish' },
        ]}
      />

      <div className="space-y-3 max-w-2xl">
        {STEPS.map((step) => (
          <Card key={step.num}>
            <div className="flex items-center gap-4 p-4">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.status === 'ready'
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-amber-400/10 text-accent border border-amber-400/20'
                }`}
              >
                {step.num}
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-sm">{step.label}</h3>
                <p className="text-muted text-xs">{step.desc}</p>
              </div>
              <button
                className={`btn btn-sm rounded-lg border-0 text-xs font-semibold ${
                  step.status === 'ready'
                    ? 'bg-accent hover:bg-accent-dark text-white'
                    : 'bg-white/[0.1] text-white/70 cursor-not-allowed'
                }`}
              >
                {step.status === 'ready' ? 'Run' : 'Pending'}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
