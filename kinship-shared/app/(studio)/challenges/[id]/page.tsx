'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge } from '@/components/UI'
import { useChallenge, deleteChallenge } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type { Difficulty } from '@/lib/types'

export default function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: challenge, loading, error } = useChallenge(id)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteChallenge(id)
      router.push('/challenges')
    } catch (err) {
      console.error('Failed to delete challenge:', err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // Difficulty badge
  const DifficultyBadge = ({ difficulty }: { difficulty: Difficulty }) => {
    const styles: Record<Difficulty, string> = {
      Easy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      Medium: 'bg-accent/15 text-accent border-accent/20',
      Hard: 'bg-red-500/15 text-red-400 border-red-500/20',
    }
    return (
      <span
        className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${styles[difficulty]}`}
      >
        {difficulty}
      </span>
    )
  }

  // Loading state
  if (loading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[
            { label: 'Challenges', href: '/challenges' },
            { label: '...' },
          ]}
        />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Card className="p-6 animate-pulse">
              <div className="flex gap-3 mb-4">
                <div className="h-6 w-16 bg-input rounded-full" />
                <div className="h-6 w-16 bg-input rounded-full" />
              </div>
              <div className="space-y-3">
                <div className="h-4 bg-white/[0.1]/30 rounded w-full" />
                <div className="h-4 bg-white/[0.1]/30 rounded w-3/4" />
              </div>
            </Card>
          </div>
          <Card className="p-6 animate-pulse">
            <div className="h-5 bg-input rounded w-1/2 mb-4" />
            <div className="space-y-3">
              <div className="h-4 bg-white/[0.1]/30 rounded" />
              <div className="h-4 bg-white/[0.1]/30 rounded" />
            </div>
          </Card>
        </div>
      </>
    )
  }

  // Error state
  if (error || !challenge) {
    return (
      <>
        <PageHeader
          title="Challenge Not Found"
          breadcrumbs={[
            { label: 'Challenges', href: '/challenges' },
            { label: 'Error' },
          ]}
        />
        <Card className="p-8 text-center">
          <div className="text-red-400 mb-4">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-60"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="font-medium">Challenge not found</p>
            <p className="text-sm text-muted mt-1">
              {error || 'The challenge does not exist.'}
            </p>
          </div>
          <Link
            href="/challenges"
            className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl px-5 py-2"
          >
            Back to Challenges
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={challenge.name}
        subtitle={`${challenge.difficulty} Challenge`}
        breadcrumbs={[
          { label: 'Challenges', href: '/challenges' },
          { label: challenge.name },
        ]}
        action={
          <Link
            href={`/challenges/${id}/edit`}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 transition-all hover:scale-105"
          >
            ✏️ Edit Challenge
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <DifficultyBadge difficulty={challenge.difficulty} />
              <StatusBadge status={challenge.status} />
            </div>

            <h3 className="text-white font-bold mb-3">Description</h3>
            <p className="text-white/70 mb-6">
              {challenge.description || 'No description provided'}
            </p>

            {challenge.success_criteria && (
              <>
                <h3 className="text-white font-bold mb-3">Success Criteria</h3>
                <p className="text-white/70 bg-sidebar/40 rounded-xl p-4 border border-card-border">
                  {challenge.success_criteria}
                </p>
              </>
            )}
          </Card>

          {/* Steps */}
          {challenge.steps && challenge.steps.length > 0 && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">📋</span> Challenge Steps
              </h3>
              <div className="space-y-3">
                {challenge.steps.map((step, index) => (
                  <div key={index} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <p className="text-white/70">{step.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">💚</span> Target Facets
            </h3>
            <div className="flex flex-wrap gap-3">
              {challenge.facets.map((facet) => {
                const f = HEARTS_FACETS.find((h) => h.key === facet)
                return (
                  <div
                    key={facet}
                    className="flex items-center gap-3 bg-sidebar/40 rounded-xl p-3 border border-card-border"
                  >
                    <FacetBadge facet={facet} size="md" />
                    <div>
                      <p className="text-white text-sm font-medium">
                        {f?.name}
                      </p>
                      <p className="text-muted text-xs">{f?.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Timestamps */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">🕐</span> Timeline
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted text-sm mb-1">Created</p>
                <p className="text-white text-sm">
                  {new Date(challenge.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p className="text-muted text-sm mb-1">Last Updated</p>
                <p className="text-white text-sm">
                  {new Date(challenge.updated_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Details</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted text-sm">Steps</span>
                <span className="text-white font-medium">
                  {challenge.steps?.length || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted text-sm">Base Delta</span>
                <span className="text-accent font-bold">
                  +{challenge.base_delta}
                </span>
              </div>
              {challenge.time_limit_sec && (
                <div className="flex justify-between items-center">
                  <span className="text-muted text-sm">Time Limit</span>
                  <span className="text-white">
                    {Math.floor(challenge.time_limit_sec / 60)} min
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Scene Reference */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Scene</h3>
            {challenge.scene_id ? (
              <div className="bg-sidebar rounded-xl p-4 border border-card-border">
                <p className="text-white text-sm font-medium">Scene ID</p>
                <p className="text-white/70 text-xs font-mono mt-1 break-all">
                  {challenge.scene_id}
                </p>
              </div>
            ) : (
              <p className="text-muted text-sm italic">No scene assigned</p>
            )}
          </Card>

          {/* Danger Zone */}
          <Card className="p-6 border-red-500/20">
            <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
            {showDeleteConfirm ? (
              <div className="space-y-3">
                <p className="text-white/70 text-sm">
                  Are you sure you want to delete this challenge?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 btn bg-red-500 hover:bg-red-400 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full btn bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl py-2.5 font-medium transition-all"
              >
                🗑️ Delete Challenge
              </button>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
