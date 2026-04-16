'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge } from '@/components/UI'
import {
  useChallenge,
  updateChallenge,
  deleteChallenge,
  useSceneOptions,
} from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type {
  Difficulty,
  ChallengeStatus,
  HeartsFacet,
  ChallengeUpdate,
  ChallengeStep,
} from '@/lib/types'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const STATUSES: ChallengeStatus[] = ['draft', 'active', 'archived']

export default function ChallengeEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const {
    data: challenge,
    loading: challengeLoading,
    error: challengeError,
  } = useChallenge(id)
  const { data: scenes } = useSceneOptions()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sceneId, setSceneId] = useState<string>('')
  const [facets, setFacets] = useState<HeartsFacet[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium')
  const [steps, setSteps] = useState<ChallengeStep[]>([
    { order: 1, description: '' },
  ])
  const [successCriteria, setSuccessCriteria] = useState('')
  const [baseDelta, setBaseDelta] = useState(5)
  const [timeLimitSec, setTimeLimitSec] = useState<number | null>(null)
  const [status, setStatus] = useState<ChallengeStatus>('draft')

  // UI state
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form when challenge loads
  useEffect(() => {
    if (challenge) {
      setName(challenge.name)
      setDescription(challenge.description || '')
      setSceneId(challenge.scene_id || '')
      setFacets(challenge.facets)
      setDifficulty(challenge.difficulty)
      setSteps(
        challenge.steps?.length
          ? challenge.steps
          : [{ order: 1, description: '' }]
      )
      setSuccessCriteria(challenge.success_criteria || '')
      setBaseDelta(challenge.base_delta)
      setTimeLimitSec(challenge.time_limit_sec)
      setStatus(challenge.status)
    }
  }, [challenge])

  // Track changes
  useEffect(() => {
    if (challenge) {
      const currentSteps = steps.filter((s) => s.description.trim())
      const originalSteps = challenge.steps || []

      const changed =
        name !== challenge.name ||
        description !== (challenge.description || '') ||
        sceneId !== (challenge.scene_id || '') ||
        JSON.stringify(facets) !== JSON.stringify(challenge.facets) ||
        difficulty !== challenge.difficulty ||
        JSON.stringify(currentSteps.map((s) => s.description)) !==
          JSON.stringify(originalSteps.map((s) => s.description)) ||
        successCriteria !== (challenge.success_criteria || '') ||
        baseDelta !== challenge.base_delta ||
        timeLimitSec !== challenge.time_limit_sec ||
        status !== challenge.status
      setHasChanges(changed)
    }
  }, [
    challenge,
    name,
    description,
    sceneId,
    facets,
    difficulty,
    steps,
    successCriteria,
    baseDelta,
    timeLimitSec,
    status,
  ])

  const toggleFacet = (facet: HeartsFacet) => {
    setFacets((prev) =>
      prev.includes(facet) ? prev.filter((f) => f !== facet) : [...prev, facet]
    )
  }

  const addStep = () => {
    setSteps([...steps, { order: steps.length + 1, description: '' }])
  }

  const updateStep = (index: number, value: string) => {
    const updated = [...steps]
    updated[index] = { ...updated[index], description: value }
    setSteps(updated)
  }

  const removeStep = (index: number) => {
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, order: i + 1 }))
    setSteps(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!name.trim()) {
      setError('Challenge name is required')
      return
    }

    if (facets.length === 0) {
      setError('Select at least one HEARTS facet')
      return
    }

    setSaving(true)
    try {
      const payload: ChallengeUpdate = {
        name: name.trim(),
        description: description.trim(),
        scene_id: sceneId || null,
        facets,
        difficulty,
        steps: steps
          .filter((s) => s.description.trim())
          .map((s, i) => ({ order: i + 1, description: s.description.trim() })),
        success_criteria: successCriteria.trim(),
        base_delta: baseDelta,
        time_limit_sec: timeLimitSec,
        status,
      }

      await updateChallenge(id, payload)
      setSuccess(true)
      setHasChanges(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to update challenge:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to update challenge'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteChallenge(id)
      router.push('/challenges')
    } catch (err) {
      console.error('Failed to delete challenge:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to delete challenge'
      )
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  // Loading state
  if (challengeLoading) {
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
              <div className="h-6 bg-input rounded w-1/4 mb-4" />
              <div className="space-y-4">
                <div className="h-10 bg-white/[0.1]/30 rounded" />
                <div className="h-24 bg-white/[0.1]/30 rounded" />
              </div>
            </Card>
          </div>
          <Card className="p-6 animate-pulse">
            <div className="h-5 bg-input rounded w-1/2 mb-4" />
            <div className="space-y-4">
              <div className="h-10 bg-white/[0.1]/30 rounded" />
              <div className="h-10 bg-white/[0.1]/30 rounded" />
            </div>
          </Card>
        </div>
      </>
    )
  }

  // Error state
  if (challengeError || !challenge) {
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
            <p className="font-medium">Challenge not found</p>
            <p className="text-sm text-muted mt-1">
              {challengeError || 'The challenge does not exist.'}
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
        title={`Edit: ${challenge.name}`}
        subtitle={`${challenge.difficulty} Challenge`}
        breadcrumbs={[
          { label: 'Challenges', href: '/challenges' },
          { label: challenge.name, href: `/challenges/${id}` },
          { label: 'Edit' },
        ]}
        action={
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-accent text-sm flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                Unsaved changes
              </span>
            )}
            <Link
              href={`/challenges/${id}`}
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={
                saving || !name.trim() || facets.length === 0 || !hasChanges
              }
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>
        }
      />

      {/* Success Banner */}
      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
          <svg
            className="w-5 h-5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <p className="text-emerald-400 text-sm">
            Challenge updated successfully!
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <svg
            className="w-5 h-5 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="col-span-2 space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Challenge Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Success Criteria
                  </label>
                  <textarea
                    value={successCriteria}
                    onChange={(e) => setSuccessCriteria(e.target.value)}
                    rows={2}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">📋</span> Challenge Steps
              </h3>
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-muted text-sm w-6 pt-3">
                      {index + 1}.
                    </span>
                    <input
                      type="text"
                      value={step.description}
                      onChange={(e) => updateStep(index, e.target.value)}
                      placeholder={`Step ${index + 1}...`}
                      className="flex-1 bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                    />
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addStep}
                  className="w-full py-2 border border-dashed border-card-border rounded-xl text-muted hover:text-accent hover:border-accent/40 transition-colors text-sm"
                >
                  + Add Step
                </button>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">
                Target Facets <span className="text-red-400">*</span>
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {HEARTS_FACETS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleFacet(f.key as HeartsFacet)}
                    className={`p-3 rounded-xl border transition-all ${
                      facets.includes(f.key as HeartsFacet)
                        ? 'border-white/30 bg-card'
                        : 'border-card-border bg-sidebar/40 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs mx-auto mb-1"
                      style={{ backgroundColor: f.color }}
                    >
                      {f.key}
                    </div>
                    <p className="text-white text-xs">{f.name}</p>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Configuration</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Scene
                  </label>
                  <select
                    value={sceneId}
                    onChange={(e) => setSceneId(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  >
                    <option value="">No scene assigned</option>
                    {scenes?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.scene_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Difficulty
                  </label>
                  <div className="flex gap-2">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDifficulty(d)}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          difficulty === d
                            ? d === 'Easy'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : d === 'Medium'
                                ? 'bg-accent/15 text-accent border border-amber-500/30'
                                : 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : 'bg-sidebar text-white/70 border border-card-border'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Base Delta
                  </label>
                  <input
                    type="number"
                    value={baseDelta}
                    onChange={(e) =>
                      setBaseDelta(parseInt(e.target.value) || 0)
                    }
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Time Limit (minutes)
                  </label>
                  <input
                    type="number"
                    value={timeLimitSec ? Math.floor(timeLimitSec / 60) : ''}
                    onChange={(e) => {
                      const mins = parseInt(e.target.value)
                      setTimeLimitSec(mins ? mins * 60 : null)
                    }}
                    placeholder="No limit"
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Status
                  </label>
                  <div className="flex gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`flex-1 px-2 py-2 rounded-xl text-xs font-medium capitalize ${
                          status === s
                            ? s === 'active'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : s === 'archived'
                                ? 'bg-white/[0.1] text-white/70 border border-card-border'
                                : 'bg-accent/15 text-accent border border-amber-500/30'
                            : 'bg-sidebar text-white/70 border border-card-border'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Danger Zone */}
            <Card className="p-6 border-red-500/20">
              <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
              {showDeleteConfirm ? (
                <div className="space-y-3">
                  <p className="text-white/70 text-sm">
                    Delete this challenge?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 btn bg-red-500 hover:bg-red-400 text-white rounded-xl py-2 text-sm disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full btn bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl py-2.5"
                >
                  🗑️ Delete Challenge
                </button>
              )}
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
