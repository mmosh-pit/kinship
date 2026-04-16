'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge } from '@/components/UI'
import { createNPC, useSceneOptions, useAssets } from '@/hooks/useApi'
import { HEARTS_FACETS } from '@/lib/data'
import type { HeartsFacet, NPCStatus, NPCCreate } from '@/lib/types'

const STATUSES: NPCStatus[] = ['draft', 'active']

export default function NPCCreatePage() {
  const router = useRouter()
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
  const [error, setError] = useState<string | null>(null)

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

    if (!name.trim()) {
      setError('NPC name is required')
      return
    }

    setSaving(true)
    try {
      const payload: NPCCreate = {
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

      const npc = await createNPC(payload)
      router.push(`/npcs/${npc.id}`)
    } catch (err) {
      console.error('Failed to create NPC:', err)
      setError(err instanceof Error ? err.message : 'Failed to create NPC')
      setSaving(false)
    }
  }

  const selectedFacet = HEARTS_FACETS.find((f) => f.key === facet)

  return (
    <>
      <PageHeader
        title="New NPC"
        subtitle="Create a new character"
        breadcrumbs={[{ label: 'NPCs', href: '/npcs' }, { label: 'Create' }]}
        action={
          <div className="flex gap-3">
            <Link
              href="/npcs"
              className="btn bg-white/[0.1] hover:bg-white/[0.1] text-white border-0 rounded-xl px-5 py-2.5"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim()}
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
                '💾 Save NPC'
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
                      placeholder="Maya Chen"
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                      autoFocus
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
                      placeholder="Wellness Coordinator"
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
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
                    placeholder="Warm, encouraging, patient. Always sees the best in people and celebrates small victories..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none transition-colors"
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
                    placeholder="Maya grew up in a family of traditional healers. After studying sports medicine, she found her calling in holistic wellness..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none transition-colors"
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
                    placeholder="Uses gentle questions to guide reflection. Speaks in present tense. Avoids medical jargon..."
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none transition-colors"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span className="text-xl">💬</span> Catchphrases
              </h3>
              <p className="text-muted text-sm mb-4">
                Signature phrases this NPC uses frequently
              </p>
              <div className="space-y-3">
                {catchphrases.map((phrase, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={phrase}
                      onChange={(e) => updateCatchphrase(index, e.target.value)}
                      placeholder={`Catchphrase ${index + 1}...`}
                      className="flex-1 bg-input border border-card-border rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                    />
                    {catchphrases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCatchphrase(index)}
                        className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
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
                  <p className="text-white/40 text-xs mb-3">
                    Primary wellness domain this NPC represents
                  </p>
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
                    Sprite Asset
                  </label>
                  <select
                    value={spriteAssetId}
                    onChange={(e) => setSpriteAssetId(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors"
                  >
                    <option value="">No sprite assigned</option>
                    {spriteAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.display_name}
                      </option>
                    ))}
                  </select>
                  <p className="text-white/40 text-xs mt-1">
                    Select a sprite from the asset library
                  </p>
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

            {/* Tips */}
            <Card className="p-6 bg-sidebar/40">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <span>💡</span> Tips
              </h3>
              <ul className="space-y-2 text-muted text-sm">
                <li>
                  • Give NPCs distinct personalities that align with their
                  HEARTS facet
                </li>
                <li>• Include 2-3 catchphrases for memorable dialogue</li>
                <li>• Background helps the AI generate consistent responses</li>
                <li>• Dialogue style guides conversation tone</li>
              </ul>
            </Card>
          </div>
        </div>
      </form>
    </>
  )
}
