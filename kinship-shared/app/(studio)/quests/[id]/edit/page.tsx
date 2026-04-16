'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import {
  useQuest,
  updateQuest,
  deleteQuest,
  useSceneOptions,
} from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type {
  BeatType,
  HeartsFacet,
  QuestStatus,
  UpdateQuestPayload,
} from '@/lib/types'

const BEAT_TYPES: BeatType[] = [
  'Introduction',
  'Exploration',
  'Challenge',
  'Climax',
  'Reflection',
  'Resolution',
]
const STATUSES: QuestStatus[] = ['draft', 'published', 'archived']

export default function QuestEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: quest, loading: questLoading, error: questError } = useQuest(id)
  const { data: scenes } = useSceneOptions()

  const [name, setName] = useState('')
  const [beatType, setBeatType] = useState<BeatType>('Introduction')
  const [facet, setFacet] = useState<HeartsFacet>('H')
  const [sceneId, setSceneId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [narrativeContent, setNarrativeContent] = useState('')
  const [sequenceOrder, setSequenceOrder] = useState(1)
  const [status, setStatus] = useState<QuestStatus>('draft')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (quest) {
      setName(quest.name)
      setBeatType(quest.beat_type)
      setFacet(quest.facet)
      setSceneId(quest.scene_id || '')
      setDescription(quest.description || '')
      setNarrativeContent(quest.narrative_content || '')
      setSequenceOrder(quest.sequence_order)
      setStatus(quest.status)
    }
  }, [quest])

  useEffect(() => {
    if (quest) {
      const changed =
        name !== quest.name ||
        beatType !== quest.beat_type ||
        facet !== quest.facet ||
        sceneId !== (quest.scene_id || '') ||
        description !== (quest.description || '') ||
        narrativeContent !== (quest.narrative_content || '') ||
        sequenceOrder !== quest.sequence_order ||
        status !== quest.status
      setHasChanges(changed)
    }
  }, [
    quest,
    name,
    beatType,
    facet,
    sceneId,
    description,
    narrativeContent,
    sequenceOrder,
    status,
  ])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (!name.trim()) {
      setError('Quest name is required')
      return
    }

    setSaving(true)
    try {
      const payload: UpdateQuestPayload = {
        name: name.trim(),
        beat_type: beatType,
        facet,
        scene_id: sceneId || null,
        description: description.trim(),
        narrative_content: narrativeContent.trim(),
        sequence_order: sequenceOrder,
        status,
      }
      await updateQuest(id, payload)
      setSuccess(true)
      setHasChanges(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quest')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteQuest(id)
      router.push('/quests')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const selectedFacet = HEARTS_FACETS.find((f) => f.key === facet)

  if (questLoading)
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'Quests', href: '/quests' }, { label: '...' }]}
        />
        <Card className="p-6 animate-pulse">
          <div className="h-10 bg-white/[0.1]/30 rounded mb-4" />
          <div className="h-24 bg-white/[0.1]/30 rounded" />
        </Card>
      </>
    )
  if (questError || !quest)
    return (
      <>
        <PageHeader
          title="Quest Not Found"
          breadcrumbs={[
            { label: 'Quests', href: '/quests' },
            { label: 'Error' },
          ]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400">Quest not found</p>
          <Link
            href="/quests"
            className="btn bg-white/[0.1] text-white rounded-xl px-5 py-2 mt-4 inline-block"
          >
            Back to Quests
          </Link>
        </Card>
      </>
    )

  return (
    <>
      <PageHeader
        title={`Edit: ${quest.name}`}
        subtitle={`${quest.beat_type} Beat`}
        breadcrumbs={[
          { label: 'Quests', href: '/quests' },
          { label: quest.name, href: `/quests/${id}` },
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
              href={`/quests/${id}`}
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !hasChanges}
              className="btn bg-accent hover:bg-accent-dark text-white rounded-xl font-bold px-5 py-2.5 disabled:opacity-50"
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>
        }
      />

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
          <p className="text-emerald-400 text-sm">Quest updated!</p>
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">⚔️ Beat Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Beat Name <span className="text-red-400">*</span>
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
                    Beat Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {BEAT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setBeatType(type)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium ${beatType === type ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-sidebar text-white/70 border border-card-border'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
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
                    Narrative Content
                  </label>
                  <textarea
                    value={narrativeContent}
                    onChange={(e) => setNarrativeContent(e.target.value)}
                    rows={12}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none font-mono"
                  />
                  <p className="text-white/40 text-xs mt-2">
                    {narrativeContent.length} chars •{' '}
                    {narrativeContent.split(/\s+/).filter(Boolean).length} words
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Configuration</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Target Facet
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {HEARTS_FACETS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFacet(f.key as HeartsFacet)}
                        className={`aspect-square rounded-xl text-xs font-bold flex items-center justify-center ${facet === f.key ? 'ring-2 ring-white/50 scale-110' : 'opacity-60 hover:opacity-100'}`}
                        style={{ backgroundColor: f.color }}
                        title={f.name}
                      >
                        {f.key}
                      </button>
                    ))}
                  </div>
                  {selectedFacet && (
                    <div className="bg-sidebar rounded-xl p-3 border border-card-border">
                      <p className="text-white text-sm font-medium">
                        {selectedFacet.name}
                      </p>
                      <p className="text-muted text-xs mt-1">
                        {selectedFacet.description}
                      </p>
                    </div>
                  )}
                </div>
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
                    {scenes?.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {scene.scene_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Sequence Order
                  </label>
                  <input
                    type="number"
                    value={sequenceOrder}
                    onChange={(e) =>
                      setSequenceOrder(parseInt(e.target.value) || 1)
                    }
                    min={1}
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
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium capitalize ${status === s ? (s === 'published' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : s === 'archived' ? 'bg-white/[0.1] text-white/70 border border-card-border' : 'bg-accent/15 text-accent border border-amber-500/30') : 'bg-sidebar text-white/70 border border-card-border'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-6 border-red-500/20">
              <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
              {showDeleteConfirm ? (
                <div className="space-y-3">
                  <p className="text-white/70 text-sm">Delete this quest?</p>
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
                  🗑️ Delete Quest
                </button>
              )}
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
