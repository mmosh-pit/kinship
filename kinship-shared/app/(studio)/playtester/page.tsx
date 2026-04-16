'use client'

import Link from 'next/link'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState } from '@/components/UI'

const TEST_ACTIONS = [
  {
    icon: '🎯',
    label: 'Simulate New Player',
    desc: 'Full playthrough from starting scene',
    color: 'rose',
  },
  {
    icon: '🔀',
    label: 'Test Specific Route',
    desc: 'Check a particular scene transition',
    color: 'orange',
  },
  {
    icon: '❤️',
    label: 'HEARTS Balance Check',
    desc: 'Verify scoring distribution is balanced',
    color: 'red',
  },
  {
    icon: '📊',
    label: 'Coverage Report',
    desc: 'Find unreachable scenes and dead ends',
    color: 'blue',
  },
]

export default function PlaytesterPage() {
  const { currentGame, isInGame } = useStudio()

  if (!isInGame) {
    return (
      <EmptyState
        icon="🎯"
        title="Select a game first"
        description="The AI playtester needs a game to test."
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
        title="AI Playtester"
        subtitle="Simulate player journeys to find issues before real players do"
        breadcrumbs={[
          { label: currentGame!.name, href: '/dashboard' },
          { label: 'Playtester' },
        ]}
      />

      <div className="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-lg">🤖</span>
          <div>
            <div className="text-xs font-bold text-rose-400 mb-1">
              How it works
            </div>
            <div className="text-xs text-white/70 leading-relaxed">
              The AI playtester simulates a player walking through your game. It
              follows routes, interacts with NPCs, attempts challenges, and
              reports on dead ends, broken routes, or unbalanced HEARTS scoring.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TEST_ACTIONS.map((action, i) => (
          <Card key={i} hover>
            <div className="p-5">
              <span className="text-2xl block mb-3">{action.icon}</span>
              <h3 className="text-white font-bold text-sm mb-1">
                {action.label}
              </h3>
              <p className="text-muted text-xs mb-4">{action.desc}</p>
              <button className="btn btn-sm bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-lg border-0 text-xs font-semibold">
                Run Test
              </button>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
