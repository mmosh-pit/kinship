'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge } from '@/components/UI'
import { HEARTS_FACETS } from '@/lib/data'
import {
  useAsset,
  useAssetKnowledge,
  saveAssetKnowledge,
  deleteAssetKnowledge,
  generateAssetKnowledge,
} from '@/hooks/useApi'
import type { SceneRole, PlacementHint, HeartsFacet } from '@/lib/types'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-white/70 text-xs block mb-1.5">
        {label}
        {hint && <span className="text-white/40 ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-input border border-card-border rounded-xl px-3 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50'
const inputSmCls =
  'w-full bg-input border border-card-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-accent/50'

const SCENE_ROLES: { value: SceneRole; label: string; icon: string }[] = [
  { value: 'ground_fill', label: 'Ground Fill', icon: '🟫' },
  { value: 'path', label: 'Path', icon: '🛤️' },
  { value: 'boundary', label: 'Boundary', icon: '🧱' },
  { value: 'focal_point', label: 'Focal Point', icon: '⭐' },
  { value: 'furniture', label: 'Furniture', icon: '🪑' },
  { value: 'shelter', label: 'Shelter', icon: '🏠' },
  { value: 'accent', label: 'Accent', icon: '✨' },
  { value: 'scatter', label: 'Scatter', icon: '🌿' },
  { value: 'utility', label: 'Utility', icon: '⚙️' },
  { value: 'lighting', label: 'Lighting', icon: '💡' },
  { value: 'signage', label: 'Signage', icon: '🪧' },
  { value: 'vegetation', label: 'Vegetation', icon: '🌳' },
  { value: 'prop', label: 'Prop', icon: '📦' },
]

const PLACEMENT_HINTS: { value: PlacementHint; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'pair', label: 'Pair' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'line', label: 'Line' },
  { value: 'ring', label: 'Ring' },
  { value: 'border', label: 'Border' },
  { value: 'grid', label: 'Grid' },
]

export default function AssetKnowledgePage() {
  const params = useParams()
  const id = params.id as string
  const { data: asset, loading: assetLoading } = useAsset(id)
  const {
    data: knowledge,
    loading: knowledgeLoading,
    refetch,
  } = useAssetKnowledge(id)

  const isNew = !knowledgeLoading && !knowledge

  // ---- Visual ----
  const [visualDescription, setVisualDescription] = useState('')
  const [colorPalette, setColorPalette] = useState('')
  const [visualMood, setVisualMood] = useState('')
  const [artStyle, setArtStyle] = useState('')

  // ---- Scene Placement ----
  const [sceneRole, setSceneRole] = useState<SceneRole>('prop')
  const [placementHint, setPlacementHint] = useState<PlacementHint>('single')
  const [pairWith, setPairWith] = useState('')
  const [avoidNear, setAvoidNear] = useState('')
  const [compositionNotes, setCompositionNotes] = useState('')

  // ---- Therapeutic / Narrative ----
  const [suitableScenes, setSuitableScenes] = useState('')
  const [suitableFacets, setSuitableFacets] = useState<HeartsFacet[]>([])
  const [therapeuticUse, setTherapeuticUse] = useState('')
  const [narrativeHook, setNarrativeHook] = useState('')

  // ---- Affordances & Placement (AI-generated, hidden from form) ----
  const [affordances, setAffordances] = useState<string[]>([])
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [placementType, setPlacementType] = useState('standalone')
  const [requiresNearby, setRequiresNearby] = useState<string[]>([])
  const [providesAttachment, setProvidesAttachment] = useState<string[]>([])
  const [contextFunctions, setContextFunctions] = useState<
    Record<string, string>
  >({})

  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Populate from existing knowledge
  useEffect(() => {
    if (!knowledge) return

    setVisualDescription(knowledge.visual_description || '')
    setColorPalette((knowledge.color_palette || []).join(', '))
    setVisualMood((knowledge.visual_mood || []).join(', '))
    setArtStyle(knowledge.art_style || '')
    setSceneRole(knowledge.scene_role || 'prop')
    setPlacementHint(knowledge.placement_hint || 'single')
    setPairWith((knowledge.pair_with || []).join(', '))
    setAvoidNear((knowledge.avoid_near || []).join(', '))
    setCompositionNotes(knowledge.composition_notes || '')
    setSuitableScenes((knowledge.suitable_scenes || []).join(', '))
    setSuitableFacets((knowledge.suitable_facets || []) as HeartsFacet[])
    setTherapeuticUse(knowledge.therapeutic_use || '')
    setNarrativeHook(knowledge.narrative_hook || '')
    // AI-generated placement fields
    setAffordances(knowledge.affordances || [])
    setCapabilities(knowledge.capabilities || [])
    setPlacementType(knowledge.placement_type || 'standalone')
    setRequiresNearby(knowledge.requires_nearby || [])
    setProvidesAttachment(knowledge.provides_attachment || [])
    setContextFunctions(knowledge.context_functions || {})
  }, [knowledge])

  function csvToArray(s: string): string[] {
    return s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }

  function toggleFacet(f: HeartsFacet) {
    setSuitableFacets((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    )
  }

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      await saveAssetKnowledge(id, {
        visual_description: visualDescription,
        color_palette: csvToArray(colorPalette),
        visual_mood: csvToArray(visualMood),
        art_style: artStyle,
        scene_role: sceneRole,
        placement_hint: placementHint,
        pair_with: csvToArray(pairWith),
        avoid_near: csvToArray(avoidNear),
        composition_notes: compositionNotes,
        suitable_scenes: csvToArray(suitableScenes),
        suitable_facets: suitableFacets,
        therapeutic_use: therapeuticUse,
        narrative_hook: narrativeHook,
        generated_by: 'studio_manual',
        // AI-generated placement fields
        affordances,
        capabilities,
        placement_type: placementType,
        requires_nearby: requiresNearby,
        provides_attachment: providesAttachment,
        context_functions: contextFunctions,
      })
      setSuccess(true)
      refetch()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (
      !confirm('Delete all AI knowledge for this asset? This cannot be undone.')
    )
      return
    setDeleting(true)
    setError(null)
    try {
      await deleteAssetKnowledge(id)
      // Reset form
      setVisualDescription('')
      setColorPalette('')
      setVisualMood('')
      setArtStyle('')
      setSceneRole('prop')
      setPlacementHint('single')
      setPairWith('')
      setAvoidNear('')
      setCompositionNotes('')
      setSuitableScenes('')
      setSuitableFacets([])
      setTherapeuticUse('')
      setNarrativeHook('')
      // Reset AI-generated placement fields
      setAffordances([])
      setCapabilities([])
      setPlacementType('standalone')
      setRequiresNearby([])
      setProvidesAttachment([])
      setContextFunctions({})
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await generateAssetKnowledge(id)
      if (result.status === 'error') {
        setError(
          result.asset_name
            ? `Generation failed for ${result.asset_name}`
            : 'Generation failed'
        )
      } else {
        // Populate form with generated knowledge (don't save to DB yet)
        const k = result.knowledge as Record<string, unknown> | undefined
        if (k) {
          setVisualDescription((k.visual_description as string) || '')
          setColorPalette(((k.color_palette as string[]) || []).join(', '))
          setVisualMood(((k.visual_mood as string[]) || []).join(', '))
          setArtStyle((k.art_style as string) || '')
          setSceneRole((k.scene_role as SceneRole) || 'prop')
          setPlacementHint((k.placement_hint as PlacementHint) || 'single')
          setPairWith(((k.pair_with as string[]) || []).join(', '))
          setAvoidNear(((k.avoid_near as string[]) || []).join(', '))
          setCompositionNotes((k.composition_notes as string) || '')
          setSuitableScenes(((k.suitable_scenes as string[]) || []).join(', '))
          setSuitableFacets((k.suitable_facets as HeartsFacet[]) || [])
          setTherapeuticUse((k.therapeutic_use as string) || '')
          setNarrativeHook((k.narrative_hook as string) || '')
          // AI-generated placement fields
          setAffordances((k.affordances as string[]) || [])
          setCapabilities((k.capabilities as string[]) || [])
          setPlacementType((k.placement_type as string) || 'standalone')
          setRequiresNearby((k.requires_nearby as string[]) || [])
          setProvidesAttachment((k.provides_attachment as string[]) || [])
          setContextFunctions(
            (k.context_functions as Record<string, string>) || {}
          )
        }
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'AI generation failed. Is kinship-knowledge running?'
      )
    } finally {
      setGenerating(false)
    }
  }

  if (assetLoading || knowledgeLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    )
  }

  if (!asset) {
    return (
      <Card className="p-6 m-6 border-red-500/20">
        <p className="text-red-400">Asset not found</p>
        <Link
          href="/assets"
          className="text-accent text-sm hover:underline mt-2 block"
        >
          ← Back to assets
        </Link>
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        title={`Knowledge: ${asset.display_name}`}
        subtitle="AI-generated semantic data for scene generation"
        breadcrumbs={[
          { label: 'Assets', href: '/assets' },
          { label: asset.display_name, href: `/assets/${id}` },
          { label: 'Knowledge' },
        ]}
        action={
          <div className="flex gap-2">
            <Link
              href={`/assets/${id}`}
              className="btn bg-white/[0.1] border-white/[0.15] text-white hover:bg-white/[0.1] rounded-xl"
            >
              ← Back
            </Link>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn bg-purple-500 hover:bg-purple-400 text-white border-0 rounded-xl font-bold disabled:opacity-50"
            >
              {generating ? '⏳ Generating...' : '🤖 Generate with AI'}
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50"
            >
              {submitting ? '⏳ Saving...' : '💾 Save Knowledge'}
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-accent text-sm">
          ✓ Knowledge saved successfully
        </div>
      )}

      {/* Status Banner */}
      <div
        className={`mb-6 rounded-xl px-4 py-3 text-sm flex items-center justify-between ${
          isNew
            ? 'bg-amber-400/10 border border-amber-400/20 text-accent'
            : 'bg-accent/20 border border-accent/30 text-accent'
        }`}
      >
        <div>
          {isNew ? (
            <>
              🆕 No knowledge yet — click{' '}
              <span className="font-bold">🤖 Generate with AI</span> to
              auto-analyze, or fill manually below
            </>
          ) : (
            <>
              ✓ Knowledge exists · Generated by{' '}
              <span className="font-mono">
                {knowledge?.generated_by || 'unknown'}
              </span>
              {knowledge?.generated_at && (
                <> · {new Date(knowledge.generated_at).toLocaleDateString()}</>
              )}{' '}
              · v{knowledge?.generation_version || 1}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!isNew && (
            <>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-purple-400/70 hover:text-purple-400 text-xs disabled:opacity-50"
              >
                {generating ? '⏳' : '🔄 Regenerate'}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-400/70 hover:text-red-400 text-xs disabled:opacity-50"
              >
                {deleting ? '⏳' : '🗑️ Delete'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Generating overlay */}
      {generating && (
        <div className="mb-6 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-4 text-purple-400 text-sm">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full" />
            <div>
              <p className="font-bold">
                Claude Vision is analyzing this asset...
              </p>
              <p className="text-purple-400/60 text-xs mt-1">
                Generating visual description, scene role, placement hints,
                therapeutic use, and narrative hooks. This may take 10-30
                seconds.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* ====== LEFT COLUMN ====== */}
        <div className="col-span-2 space-y-6">
          {/* Visual Description */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">🎨 Visual Identity</h3>
            <div className="space-y-4">
              <Field
                label="Visual Description"
                hint="rich description for AI context"
              >
                <textarea
                  value={visualDescription}
                  onChange={(e) => setVisualDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe what this asset looks like, its style, details, and visual characteristics..."
                  className={`${inputCls} resize-none`}
                />
              </Field>
              <Field
                label="Art Style"
                hint="e.g. pixel art, hand-drawn, isometric, flat"
              >
                <input
                  value={artStyle}
                  onChange={(e) => setArtStyle(e.target.value)}
                  placeholder="isometric pixel art"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Color Palette" hint="comma-separated">
                  <input
                    value={colorPalette}
                    onChange={(e) => setColorPalette(e.target.value)}
                    placeholder="#8B4513, #228B22, #87CEEB"
                    className={inputCls}
                  />
                  {colorPalette && (
                    <div className="flex gap-1 mt-2">
                      {csvToArray(colorPalette).map((c, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-md border border-card-border"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  )}
                </Field>
                <Field label="Visual Mood" hint="comma-separated">
                  <input
                    value={visualMood}
                    onChange={(e) => setVisualMood(e.target.value)}
                    placeholder="calm, natural, warm, cozy"
                    className={inputCls}
                  />
                  {visualMood && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {csvToArray(visualMood).map((m, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-purple-400/10 text-purple-400 px-2 py-0.5 rounded-full"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
            </div>
          </Card>

          {/* Scene Placement */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">🗺️ Scene Placement</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Scene Role" hint="how AI uses this in layouts">
                  <select
                    value={sceneRole}
                    onChange={(e) => setSceneRole(e.target.value as SceneRole)}
                    className={inputSmCls}
                  >
                    {SCENE_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.icon} {r.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Placement Hint" hint="arrangement pattern">
                  <select
                    value={placementHint}
                    onChange={(e) =>
                      setPlacementHint(e.target.value as PlacementHint)
                    }
                    className={inputSmCls}
                  >
                    {PLACEMENT_HINTS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Pair With" hint="asset names, comma-separated">
                  <input
                    value={pairWith}
                    onChange={(e) => setPairWith(e.target.value)}
                    placeholder="bench_01, flower_pot_02"
                    className={inputCls}
                  />
                </Field>
                <Field label="Avoid Near" hint="asset names, comma-separated">
                  <input
                    value={avoidNear}
                    onChange={(e) => setAvoidNear(e.target.value)}
                    placeholder="fire_pit_01, water_source_01"
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field
                label="Composition Notes"
                hint="how this asset fits into scene layouts"
              >
                <textarea
                  value={compositionNotes}
                  onChange={(e) => setCompositionNotes(e.target.value)}
                  rows={3}
                  placeholder="Works well as a centerpiece. Place on grass tiles. Pair with flowers for a garden vibe..."
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </div>
          </Card>

          {/* Therapeutic / Narrative */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">
              💚 Therapeutic & Narrative
            </h3>
            <div className="space-y-4">
              <Field
                label="Therapeutic Use"
                hint="how this asset supports emotional wellbeing"
              >
                <textarea
                  value={therapeuticUse}
                  onChange={(e) => setTherapeuticUse(e.target.value)}
                  rows={3}
                  placeholder="Campfire creates a safe gathering space. Flickering animation provides calming visual focus. Promotes social connection and reflection..."
                  className={`${inputCls} resize-none`}
                />
              </Field>
              <Field
                label="Narrative Hook"
                hint="story potential for quests and NPC dialogue"
              >
                <textarea
                  value={narrativeHook}
                  onChange={(e) => setNarrativeHook(e.target.value)}
                  rows={3}
                  placeholder="The old campfire has been here since the first settlers. NPCs gather here to share stories at dusk..."
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* ====== RIGHT COLUMN ====== */}
        <div className="space-y-6">
          {/* Preview */}
          <Card className="overflow-hidden">
            <div className="h-40 bg-gradient-to-br from-[#050824] to-[#100e59] flex items-center justify-center">
              {asset.file_url ? (
                <img
                  src={asset.thumbnail_url || asset.file_url}
                  alt={asset.display_name}
                  className="max-h-full max-w-full object-contain p-4"
                />
              ) : (
                <span className="text-4xl opacity-20">📦</span>
              )}
            </div>
            <div className="px-4 py-3 border-t border-card-border">
              <p className="text-white text-sm font-bold">
                {asset.display_name}
              </p>
              <p className="text-muted text-xs font-mono">{asset.name}</p>
            </div>
          </Card>

          {/* Suitable Scenes */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">🏞️ Suitable Scenes</h3>
            <Field label="Scene Types" hint="comma-separated">
              <input
                value={suitableScenes}
                onChange={(e) => setSuitableScenes(e.target.value)}
                placeholder="garden, forest, farm, campsite"
                className={inputCls}
              />
            </Field>
            {suitableScenes && (
              <div className="flex flex-wrap gap-1 mt-2">
                {csvToArray(suitableScenes).map((s, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* HEARTS Facets */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">💚 Suitable Facets</h3>
            <p className="text-muted text-xs mb-3">
              Which HEARTS facets does this asset support?
            </p>
            <div className="space-y-2">
              {HEARTS_FACETS.map((f) => (
                <label
                  key={f.key}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={suitableFacets.includes(f.key as HeartsFacet)}
                    onChange={() => toggleFacet(f.key as HeartsFacet)}
                    className="checkbox checkbox-sm checkbox-accent"
                  />
                  <FacetBadge facet={f.key} size="md" />
                  <span className="text-white/70 text-sm group-hover:text-white transition-colors">
                    {f.name}
                  </span>
                </label>
              ))}
            </div>
          </Card>

          {/* Quick Nav */}
          <Card className="p-4">
            <div className="space-y-2">
              <Link
                href={`/assets/${id}`}
                className="block text-white/70 text-sm hover:text-accent transition-colors"
              >
                📋 Asset Details
              </Link>
              <Link
                href={`/assets/${id}/edit`}
                className="block text-white/70 text-sm hover:text-accent transition-colors"
              >
                ✏️ Edit Metadata
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
