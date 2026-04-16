'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge } from '@/components/UI'
import { createChallenge, useSceneOptions } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type {
  Difficulty,
  ChallengeStatus,
  HeartsFacet,
  ChallengeCreate,
  ChallengeStep,
} from '@/lib/types'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']
const STATUSES: ChallengeStatus[] = ['draft', 'active']

export default function ChallengeCreatePage() {
  const router = useRouter()
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
  const [error, setError] = useState<string | null>(null)

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
      const payload: ChallengeCreate = {
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

      const challenge = await createChallenge(payload)
      router.push(`/challenges/${challenge.id}`)
    } catch (err) {
      console.error('Failed to create challenge:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to create challenge'
      )
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="New Challenge"
        subtitle="Create an interactive activity"
        breadcrumbs={[
          { label: 'Challenges', href: '/challenges' },
          { label: 'Create' },
        ]}
        action={
          <div className="flex gap-3">
            <Link
              href="/challenges"
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || facets.length === 0}
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Saving...
                </span>
              ) : (
                '💾 Save Challenge'
              )}
            </button>
          </div>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0"
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
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="col-span-2 space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">⚡</span> Challenge Details
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Cardio Champion"
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                    autoFocus
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
                    placeholder="Complete 3 rounds on the treadmill..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none transition-colors"
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
                    placeholder="Player must complete all steps within the time limit..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none transition-colors"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">📋</span> Challenge Steps
              </h3>
              <p className="text-muted text-sm mb-4">
                Define the steps players must complete
              </p>
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
                      className="flex-1 bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                    />
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
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
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">💚</span> Target Facets{' '}
                <span className="text-red-400">*</span>
              </h3>
              <p className="text-muted text-sm mb-4">
                Select which HEARTS facets this challenge develops
              </p>
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
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white text-sm mx-auto mb-2"
                      style={{ backgroundColor: f.color }}
                    >
                      {f.key}
                    </div>
                    <p className="text-white text-xs font-medium">{f.name}</p>
                    {facets.includes(f.key as HeartsFacet) && (
                      <div className="absolute top-2 right-2 w-4 h-4 bg-accent rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {facets.length > 0 && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  <span className="text-muted text-sm">Selected:</span>
                  {facets.map((f) => (
                    <FacetBadge key={f} facet={f} size="sm" />
                  ))}
                </div>
              )}
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
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors"
                  >
                    <option value="">No scene assigned</option>
                    {scenes?.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.scene_name}
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
                            : 'bg-sidebar text-white/70 hover:text-white border border-card-border hover:border-card-border'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Base HEARTS Delta
                  </label>
                  <input
                    type="number"
                    value={baseDelta}
                    onChange={(e) =>
                      setBaseDelta(parseInt(e.target.value) || 0)
                    }
                    min={0}
                    max={20}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors"
                  />
                  <p className="text-white/40 text-xs mt-1">
                    Points added to selected facets on completion
                  </p>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Time Limit (optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={timeLimitSec ? Math.floor(timeLimitSec / 60) : ''}
                      onChange={(e) => {
                        const mins = parseInt(e.target.value)
                        setTimeLimitSec(mins ? mins * 60 : null)
                      }}
                      placeholder="—"
                      min={0}
                      className="flex-1 bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors"
                    />
                    <span className="self-center text-muted text-sm">
                      minutes
                    </span>
                  </div>
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
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all capitalize ${
                          status === s
                            ? s === 'active'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-accent/15 text-accent border border-amber-500/30'
                            : 'bg-sidebar text-white/70 hover:text-white border border-card-border hover:border-card-border'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
