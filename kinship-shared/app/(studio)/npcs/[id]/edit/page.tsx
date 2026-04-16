'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge } from '@/components/UI'
import {
  useNPC,
  updateNPC,
  deleteNPC,
  useSceneOptions,
  useAssets,
} from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type { HeartsFacet, NPCStatus, NPCUpdate } from '@/lib/types'

const STATUSES: NPCStatus[] = ['draft', 'active', 'archived']

export default function NPCEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: npc, loading: npcLoading, error: npcError } = useNPC(id)
  const { data: scenes } = useSceneOptions()
  const { data: assetsData } = useAssets({ type: 'sprite' })

  // Form state
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [facet, setFacet] = useState<HeartsFacet>('H')
  const [sceneId, setSceneId] = useState<string>('')
  const [spriteAssetId, setSpriteAssetId] = useState<string>('')
  const [personality, setPersonality] = useState('')
  const [background, setBackground] = useState('')
  const [dialogueStyle, setDialogueStyle] = useState('')
  const [catchphrases, setCatchphrases] = useState<string[]>([''])
  const [status, setStatus] = useState<NPCStatus>('draft')

  const spriteAssets = assetsData?.data || []

  // UI state
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize form when NPC loads
  useEffect(() => {
    if (npc) {
      setName(npc.name)
      setRole(npc.role || '')
      setFacet(npc.facet)
      setSceneId(npc.scene_id || '')
      setSpriteAssetId(npc.sprite_asset_id || '')
      setPersonality(npc.personality || '')
      setBackground(npc.background || '')
      setDialogueStyle(npc.dialogue_style || '')
      setCatchphrases(npc.catchphrases?.length ? npc.catchphrases : [''])
      setStatus(npc.status)
    }
  }, [npc])

  // Track changes
  useEffect(() => {
    if (npc) {
      const currentCatchphrases = catchphrases.filter((c) => c.trim())
      const originalCatchphrases = npc.catchphrases || []

      const changed =
        name !== npc.name ||
        role !== (npc.role || '') ||
        facet !== npc.facet ||
        sceneId !== (npc.scene_id || '') ||
        spriteAssetId !== (npc.sprite_asset_id || '') ||
        personality !== (npc.personality || '') ||
        background !== (npc.background || '') ||
        dialogueStyle !== (npc.dialogue_style || '') ||
        JSON.stringify(currentCatchphrases) !==
          JSON.stringify(originalCatchphrases) ||
        status !== npc.status
      setHasChanges(changed)
    }
  }, [
    npc,
    name,
    role,
    facet,
    sceneId,
    spriteAssetId,
    personality,
    background,
    dialogueStyle,
    catchphrases,
    status,
  ])

  const addCatchphrase = () => {
    setCatchphrases([...catchphrases, ''])
  }

  const updateCatchphrase = (index: number, value: string) => {
    const updated = [...catchphrases]
    updated[index] = value
    setCatchphrases(updated)
  }

  const removeCatchphrase = (index: number) => {
    setCatchphrases(catchphrases.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!name.trim()) {
      setError('NPC name is required')
      return
    }

    setSaving(true)
    try {
      const payload: NPCUpdate = {
        name: name.trim(),
        role: role.trim(),
        facet,
        scene_id: sceneId || null,
        sprite_asset_id: spriteAssetId || null,
        personality: personality.trim(),
        background: background.trim(),
        dialogue_style: dialogueStyle.trim(),
        catchphrases: catchphrases.filter((c) => c.trim()),
        status,
      }

      await updateNPC(id, payload)
      setSuccess(true)
      setHasChanges(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to update NPC:', err)
      setError(err instanceof Error ? err.message : 'Failed to update NPC')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteNPC(id)
      router.push('/npcs')
    } catch (err) {
      console.error('Failed to delete NPC:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete NPC')
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const selectedFacet = HEARTS_FACETS.find((f) => f.key === facet)

  // Loading state
  if (npcLoading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'NPCs', href: '/npcs' }, { label: '...' }]}
        />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Card className="p-6 animate-pulse">
              <div className="h-6 bg-input rounded w-1/4 mb-4" />
              <div className="space-y-4">
                <div className="h-10 bg-white/[0.1]/30 rounded" />
                <div className="h-24 bg-white/[0.1]/30 rounded" />
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
  if (npcError || !npc) {
    return (
      <>
        <PageHeader
          title="NPC Not Found"
          breadcrumbs={[{ label: 'NPCs', href: '/npcs' }, { label: 'Error' }]}
        />
        <Card className="p-8 text-center">
          <div className="text-red-400 mb-4">
            <p className="font-medium">NPC not found</p>
            <p className="text-sm text-muted mt-1">
              {npcError || 'The NPC does not exist.'}
            </p>
          </div>
          <Link
            href="/npcs"
            className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white rounded-xl px-5 py-2"
          >
            Back to NPCs
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={`Edit: ${npc.name}`}
        subtitle={npc.role || 'Character'}
        breadcrumbs={[
          { label: 'NPCs', href: '/npcs' },
          { label: npc.name, href: `/npcs/${id}` },
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
              href={`/npcs/${id}`}
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !hasChanges}
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
          <p className="text-emerald-400 text-sm">NPC updated successfully!</p>
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
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">🧑</span> Character Details
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                      Role
                    </label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Personality
                  </label>
                  <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    rows={3}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Background
                  </label>
                  <textarea
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    rows={4}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-white/70 text-sm block mb-2">
                    Dialogue Style
                  </label>
                  <textarea
                    value={dialogueStyle}
                    onChange={(e) => setDialogueStyle(e.target.value)}
                    rows={2}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 resize-none"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">💬</span> Catchphrases
              </h3>
              <div className="space-y-3">
                {catchphrases.map((phrase, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={phrase}
                      onChange={(e) => updateCatchphrase(index, e.target.value)}
                      placeholder={`Catchphrase ${index + 1}...`}
                      className="flex-1 bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                    />
                    {catchphrases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCatchphrase(index)}
                        className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addCatchphrase}
                  className="w-full py-2 border border-dashed border-card-border rounded-xl text-muted hover:text-accent hover:border-accent/40 transition-colors text-sm"
                >
                  + Add Catchphrase
                </button>
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
                    HEARTS Facet
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {HEARTS_FACETS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFacet(f.key as HeartsFacet)}
                        className={`aspect-square rounded-xl text-xs font-bold flex items-center justify-center transition-all ${
                          facet === f.key
                            ? 'ring-2 ring-white/50 scale-110'
                            : 'opacity-60 hover:opacity-100'
                        }`}
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
                    Sprite Asset
                  </label>
                  <select
                    value={spriteAssetId}
                    onChange={(e) => setSpriteAssetId(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50"
                  >
                    <option value="">No sprite assigned</option>
                    {spriteAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.display_name}
                      </option>
                    ))}
                  </select>
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
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all capitalize ${
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
                  <p className="text-white/70 text-sm">Delete this NPC?</p>
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
                  🗑️ Delete NPC
                </button>
              )}
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
