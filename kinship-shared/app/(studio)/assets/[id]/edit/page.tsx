'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card } from '@/components/UI'
import { ASSET_TYPES, HEARTS_FACETS } from '@/lib/data'
import { useAsset } from '@/hooks/useApi'
import {
  updateAsset,
  saveMetadata,
  deleteAsset,
  deleteAssetEmbedding,
} from '@/hooks/useApi'
import { showSection } from '@/lib/metadata-sections'
import type {
  AssetType,
  HeartsFacet,
  AOEShape,
  InteractionType,
  SpriteStateConfig,
  TileWalkability,
  AudioTrigger,
  AudioCategory,
  TilemapOrientation,
  MoveType,
  MovePersonality,
} from '@/lib/types'

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

export default function AssetEditPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { data: asset, loading, error: loadError } = useAsset(id)

  // ---- Basic Info ----
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<AssetType>('object')
  const [metaDescription, setMetaDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [isActive, setIsActive] = useState(true)

  // ---- HEARTS ----
  const [primaryFacet, setPrimaryFacet] = useState<HeartsFacet | ''>('')
  const [secondaryFacet, setSecondaryFacet] = useState<HeartsFacet | ''>('')
  const [baseDelta, setBaseDelta] = useState(0)
  const [heartsDesc, setHeartsDesc] = useState('')

  // ---- AOE ----
  const [aoeShape, setAoeShape] = useState<AOEShape>('none')
  const [aoeRadius, setAoeRadius] = useState(1)
  const [aoeWidth, setAoeWidth] = useState(1)
  const [aoeHeight, setAoeHeight] = useState(1)
  const [aoeUnit, setAoeUnit] = useState<'tiles' | 'pixels'>('tiles')

  // ---- Hitbox ----
  const [hitboxW, setHitboxW] = useState(1)
  const [hitboxH, setHitboxH] = useState(1)
  const [hitboxOffX, setHitboxOffX] = useState(0)
  const [hitboxOffY, setHitboxOffY] = useState(0)

  // ---- Interaction ----
  const [interactionType, setInteractionType] = useState<InteractionType>('tap')
  const [interactionRange, setInteractionRange] = useState(1.5)
  const [interactionCooldown, setInteractionCooldown] = useState(500)
  const [interactionFacing, setInteractionFacing] = useState(false)

  // ---- Spawn ----
  const [spawnX, setSpawnX] = useState(0)
  const [spawnY, setSpawnY] = useState(0)
  const [spawnLayer, setSpawnLayer] = useState('objects')
  const [spawnZIndex, setSpawnZIndex] = useState(1)
  const [spawnFacing, setSpawnFacing] = useState('south')

  // ---- Rules ----
  const [rulesRequiresItem, setRulesRequiresItem] = useState('')
  const [rulesMaxUsers, setRulesMaxUsers] = useState(1)
  const [rulesDescription, setRulesDescription] = useState('')
  const [rulesMovable, setRulesMovable] = useState(false)
  const [rulesDestructible, setRulesDestructible] = useState(false)
  const [rulesLevelRequired, setRulesLevelRequired] = useState(0)

  // ---- Dimensions ----
  const [dimWidth, setDimWidth] = useState(0)
  const [dimHeight, setDimHeight] = useState(0)

  // ---- Sprite Sheet ----
  const [spriteColumns, setSpriteColumns] = useState(1)
  const [spriteRows, setSpriteRows] = useState(1)
  const [spriteAnchorX, setSpriteAnchorX] = useState(0.5)
  const [spriteAnchorY, setSpriteAnchorY] = useState(1.0)
  const [spritePadding, setSpritePadding] = useState(0)
  const [useDirectionMap, setUseDirectionMap] = useState(false)
  const [directionMap, setDirectionMap] = useState<Record<string, string>>({
    '0': 'down',
    '1': 'left',
    '2': 'right',
    '3': 'up',
  })
  const [spriteStates, setSpriteStates] = useState<
    Record<string, SpriteStateConfig>
  >({
    idle: { row: 0, start_col: 0, end_col: 0, fps: 1, loop: true },
  })

  // ---- Tile Config ----
  const [tileWalkable, setTileWalkable] = useState<TileWalkability>('walkable')
  const [tileTerrainCost, setTileTerrainCost] = useState(1.0)
  const [tileTerrainType, setTileTerrainType] = useState('')
  const [tileAutoGroup, setTileAutoGroup] = useState('')
  const [tileIsEdge, setTileIsEdge] = useState(false)

  // ---- Audio Config ----
  const [audioVolume, setAudioVolume] = useState(1.0)
  const [audioLoop, setAudioLoop] = useState(true)
  const [audioFadeIn, setAudioFadeIn] = useState(0)
  const [audioFadeOut, setAudioFadeOut] = useState(0)
  const [audioSpatial, setAudioSpatial] = useState(false)
  const [audioTrigger, setAudioTrigger] = useState<AudioTrigger>('ambient')
  const [audioRadius, setAudioRadius] = useState(5.0)
  const [audioCategory, setAudioCategory] = useState<AudioCategory>('sfx')

  // ---- Tilemap Config ----
  const [tilemapGridW, setTilemapGridW] = useState(0)
  const [tilemapGridH, setTilemapGridH] = useState(0)
  const [tilemapTileSize, setTilemapTileSize] = useState(64)
  const [tilemapLayers, setTilemapLayers] = useState(1)
  const [tilemapOrientation, setTilemapOrientation] =
    useState<TilemapOrientation>('isometric')

  // ---- Movement Config ----
  const [moveSpeed, setMoveSpeed] = useState(1.0)
  const [moveType, setMoveType] = useState<MoveType>('static')
  const [moveWanderRadius, setMoveWanderRadius] = useState(3.0)
  const [moveAvoidObstacles, setMoveAvoidObstacles] = useState(true)
  const [movePersonality, setMovePersonality] = useState<MovePersonality | ''>(
    ''
  )

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Computed sprite frame dimensions
  const hasSpriteSheet = showSection(type, 'sprite_sheet')
  const spriteFrameW =
    dimWidth > 0 && spriteColumns > 0
      ? Math.floor(
          (dimWidth - spritePadding * (spriteColumns - 1)) / spriteColumns
        )
      : 0
  const spriteFrameH =
    dimHeight > 0 && spriteRows > 0
      ? Math.floor((dimHeight - spritePadding * (spriteRows - 1)) / spriteRows)
      : 0
  const spriteCleanDivision =
    dimWidth > 0 &&
    spriteColumns > 0 &&
    dimHeight > 0 &&
    spriteRows > 0 &&
    dimWidth % spriteColumns === 0 &&
    dimHeight % spriteRows === 0
  const spriteTotalFrames = spriteColumns * spriteRows

  function addSpriteState() {
    const name = `state_${Object.keys(spriteStates).length}`
    setSpriteStates((prev) => ({
      ...prev,
      [name]: { row: 0, start_col: 0, end_col: 0, fps: 6, loop: true },
    }))
  }
  function removeSpriteState(key: string) {
    setSpriteStates((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  function renameSpriteState(oldKey: string, newKey: string) {
    if (!newKey || newKey === oldKey || spriteStates[newKey]) return
    setSpriteStates((prev) => {
      const next: Record<string, SpriteStateConfig> = {}
      for (const [k, v] of Object.entries(prev)) {
        next[k === oldKey ? newKey : k] = v
      }
      return next
    })
  }
  function updateSpriteState(
    key: string,
    field: keyof SpriteStateConfig,
    value: number | boolean
  ) {
    setSpriteStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }
  function updateDirectionRow(rowIdx: string, direction: string) {
    setDirectionMap((prev) => ({ ...prev, [rowIdx]: direction }))
  }

  // Populate form when data loads
  useEffect(() => {
    if (!asset) return

    // Basic
    setDisplayName(asset.display_name)
    setName(asset.name)
    setType(asset.type)
    setMetaDescription(asset.meta_description || '')
    setTagsInput(asset.tags.join(', '))
    setIsActive(asset.is_active)

    const m = asset.metadata
    if (!m) return

    // HEARTS
    setPrimaryFacet(m.hearts_mapping?.primary_facet || '')
    setSecondaryFacet(m.hearts_mapping?.secondary_facet || '')
    setBaseDelta(m.hearts_mapping?.base_delta || 0)
    setHeartsDesc(m.hearts_mapping?.description || '')

    // AOE
    setAoeShape(m.aoe?.shape || 'none')
    setAoeRadius(m.aoe?.radius || 1)
    setAoeWidth(m.aoe?.width || 1)
    setAoeHeight(m.aoe?.height || 1)
    setAoeUnit(m.aoe?.unit || 'tiles')

    // Hitbox
    setHitboxW(m.hitbox?.width || 1)
    setHitboxH(m.hitbox?.height || 1)
    setHitboxOffX(m.hitbox?.offset_x || 0)
    setHitboxOffY(m.hitbox?.offset_y || 0)

    // Interaction
    setInteractionType(m.interaction?.type || 'tap')
    setInteractionRange(m.interaction?.range || 1.5)
    setInteractionCooldown(m.interaction?.cooldown_ms || 500)
    setInteractionFacing(m.interaction?.requires_facing || false)

    // Spawn
    setSpawnX(m.spawn?.default_position?.x || 0)
    setSpawnY(m.spawn?.default_position?.y || 0)
    setSpawnLayer(m.spawn?.layer || 'objects')
    setSpawnZIndex(m.spawn?.z_index || 1)
    setSpawnFacing(m.spawn?.facing || 'south')

    // Rules
    setRulesRequiresItem(m.rules?.requires_item || '')
    setRulesMaxUsers(m.rules?.max_users ?? 1)
    setRulesDescription(m.rules?.description || '')
    setRulesMovable(m.rules?.is_movable || false)
    setRulesDestructible(m.rules?.is_destructible || false)
    setRulesLevelRequired(m.rules?.level_required || 0)

    // Dimensions (stored in custom_properties)
    const dims = m.custom_properties?.original_dimensions as
      | { width?: number; height?: number }
      | undefined

    if (dims) {
      setDimWidth(dims.width || 0)
      setDimHeight(dims.height || 0)
    }

    // Sprite Sheet
    const ss = m.sprite_sheet
    if (ss) {
      setSpriteColumns(ss.columns || 1)
      setSpriteRows(ss.rows || 1)
      setSpriteAnchorX(ss.anchor_x ?? 0.5)
      setSpriteAnchorY(ss.anchor_y ?? 1.0)
      setSpritePadding(ss.padding || 0)
      if (ss.direction_map && Object.keys(ss.direction_map).length > 0) {
        setUseDirectionMap(true)
        setDirectionMap(ss.direction_map)
      }
      if (ss.states && Object.keys(ss.states).length > 0) {
        setSpriteStates(ss.states)
      }
    }

    // Tile Config
    const tc = m.tile_config
    if (tc) {
      setTileWalkable(tc.walkable || 'walkable')
      setTileTerrainCost(tc.terrain_cost ?? 1.0)
      setTileTerrainType(tc.terrain_type || '')
      setTileAutoGroup(tc.auto_group || '')
      setTileIsEdge(tc.is_edge ?? false)
    }

    // Audio Config
    const ac = m.audio_config
    if (ac) {
      setAudioVolume(ac.volume ?? 1.0)
      setAudioLoop(ac.loop ?? true)
      setAudioFadeIn(ac.fade_in_ms ?? 0)
      setAudioFadeOut(ac.fade_out_ms ?? 0)
      setAudioSpatial(ac.spatial ?? false)
      setAudioTrigger(ac.trigger || 'ambient')
      setAudioRadius(ac.radius ?? 5.0)
      setAudioCategory(ac.category || 'sfx')
    }

    // Tilemap Config
    const tm = m.tilemap_config
    if (tm) {
      setTilemapGridW(tm.grid_width ?? 0)
      setTilemapGridH(tm.grid_height ?? 0)
      setTilemapTileSize(tm.tile_size ?? 64)
      setTilemapLayers(tm.layer_count ?? 1)
      setTilemapOrientation(tm.orientation || 'isometric')
    }

    // Movement
    const mv = m.movement
    if (mv) {
      setMoveSpeed(mv.speed ?? 1.0)
      setMoveType(mv.type || 'static')
      setMoveWanderRadius(mv.wander_radius ?? 3.0)
      setMoveAvoidObstacles(mv.avoid_obstacles ?? true)
      setMovePersonality(mv.personality || '')
    }
  }, [asset])

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      await updateAsset(id, {
        display_name: displayName,
        name,
        type,
        meta_description: metaDescription,
        tags,
        is_active: isActive,
      })

      const hasMetadata = !!asset?.metadata
      const s = (section: string) => showSection(type, section as any)

      await saveMetadata(
        id,
        {
          ...(s('hearts')
            ? {
                hearts_mapping: {
                  primary_facet: primaryFacet || null,
                  secondary_facet: secondaryFacet || null,
                  base_delta: baseDelta,
                  description: heartsDesc,
                },
              }
            : {}),
          ...(s('aoe')
            ? {
                aoe: {
                  shape: aoeShape,
                  ...(aoeShape === 'circle' ? { radius: aoeRadius } : {}),
                  ...(aoeShape === 'rectangle'
                    ? { width: aoeWidth, height: aoeHeight }
                    : {}),
                  unit: aoeUnit,
                },
              }
            : {}),
          ...(s('hitbox')
            ? {
                hitbox: {
                  width: hitboxW,
                  height: hitboxH,
                  offset_x: hitboxOffX,
                  offset_y: hitboxOffY,
                },
              }
            : {}),
          ...(s('interaction')
            ? {
                interaction: {
                  type: interactionType,
                  range: interactionRange,
                  cooldown_ms: interactionCooldown,
                  requires_facing: interactionFacing,
                },
              }
            : {}),
          ...(s('sprite_sheet') && spriteFrameW > 0
            ? {
                sprite_sheet: {
                  frame_width: spriteFrameW,
                  frame_height: spriteFrameH,
                  columns: spriteColumns,
                  rows: spriteRows,
                  anchor_x: spriteAnchorX,
                  anchor_y: spriteAnchorY,
                  padding: spritePadding,
                  direction_map: useDirectionMap ? directionMap : null,
                  states: spriteStates,
                },
              }
            : {}),
          ...(s('spawn')
            ? {
                spawn: {
                  default_position: { x: spawnX, y: spawnY },
                  layer: spawnLayer,
                  z_index: spawnZIndex,
                  facing: spawnFacing,
                },
              }
            : {}),
          ...(s('rules')
            ? {
                rules: {
                  requires_item: rulesRequiresItem || null,
                  max_users: rulesMaxUsers,
                  description: rulesDescription,
                  is_movable: rulesMovable,
                  is_destructible: rulesDestructible,
                  level_required: rulesLevelRequired,
                },
              }
            : {}),
          ...(s('tile_config')
            ? {
                tile_config: {
                  walkable: tileWalkable,
                  terrain_cost: tileTerrainCost,
                  terrain_type: tileTerrainType,
                  auto_group: tileAutoGroup,
                  is_edge: tileIsEdge,
                },
              }
            : {}),
          ...(s('audio_config')
            ? {
                audio_config: {
                  volume: audioVolume,
                  loop: audioLoop,
                  fade_in_ms: audioFadeIn,
                  fade_out_ms: audioFadeOut,
                  spatial: audioSpatial,
                  trigger: audioTrigger,
                  radius: audioRadius,
                  category: audioCategory,
                },
              }
            : {}),
          ...(s('tilemap_config')
            ? {
                tilemap_config: {
                  grid_width: tilemapGridW,
                  grid_height: tilemapGridH,
                  tile_size: tilemapTileSize,
                  layer_count: tilemapLayers,
                  orientation: tilemapOrientation,
                },
              }
            : {}),
          ...(s('movement')
            ? {
                movement: {
                  speed: moveSpeed,
                  type: moveType,
                  wander_radius: moveWanderRadius,
                  patrol_path: null,
                  avoid_obstacles: moveAvoidObstacles,
                  personality: movePersonality,
                },
              }
            : {}),
          custom_properties: {
            original_dimensions: { width: dimWidth, height: dimHeight },
          },
        },
        !hasMetadata
      )

      router.push(`/assets/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        'Delete this asset permanently? This will remove it from GCS, DB, and Pinecone embeddings.'
      )
    )
      return
    setDeleting(true)
    try {
      // Delete embedding from Pinecone first (fallback — webhook also does this)
      try {
        await deleteAssetEmbedding(id)
      } catch {
        /* ignore if knowledge service is down */
      }
      await deleteAsset(id)
      router.push('/assets')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted text-sm">Loading...</p>
      </div>
    )
  if (loadError || !asset)
    return (
      <Card className="p-6 m-6">
        <p className="text-red-400">⚠️ {loadError || 'Not found'}</p>
      </Card>
    )

  return (
    <>
      <PageHeader
        title={`Edit: ${asset.display_name}`}
        breadcrumbs={[
          { label: 'Assets', href: '/assets' },
          { label: asset.display_name, href: `/assets/${id}` },
          { label: 'Edit' },
        ]}
        action={
          <button
            onClick={handleSave}
            disabled={submitting}
            className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold disabled:opacity-50"
          >
            {submitting ? '⏳ Saving...' : '💾 Save Changes'}
          </button>
        }
      />

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* ====== LEFT COLUMN ====== */}
        <div className="col-span-2 space-y-6">
          {/* Basic Info */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">📋 Basic Info</h3>
            <div className="space-y-4">
              <Field label="Display Name">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Slug Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${inputCls} font-mono`}
                />
              </Field>
              <Field label="Type">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AssetType)}
                  className={inputCls}
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Description" hint="for AI context">
                <textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </Field>
              <Field label="Tags" hint="comma-separated">
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="checkbox checkbox-sm checkbox-accent"
                />
                <span className="text-white/70 text-sm">Active</span>
              </label>
            </div>
          </Card>

          {/* Sprite Sheet — only for sprite/npc/animation types with known dimensions */}
          {hasSpriteSheet && dimWidth > 0 && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">🎬 Sprite Sheet</h3>

              {/* Grid Layout */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Field label="Columns" hint="frames per row">
                  <input
                    type="number"
                    min={1}
                    value={spriteColumns}
                    onChange={(e) =>
                      setSpriteColumns(Math.max(1, Number(e.target.value)))
                    }
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Rows" hint="rows in sheet">
                  <input
                    type="number"
                    min={1}
                    value={spriteRows}
                    onChange={(e) =>
                      setSpriteRows(Math.max(1, Number(e.target.value)))
                    }
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Padding" hint="px between frames">
                  <input
                    type="number"
                    min={0}
                    value={spritePadding}
                    onChange={(e) => setSpritePadding(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
              </div>

              {/* Computed Frame Size */}
              <div
                className={`rounded-lg px-3 py-2 mb-4 text-sm ${spriteCleanDivision ? 'bg-accent/20 border border-accent/30' : 'bg-amber-400/10 border border-amber-400/20'}`}
              >
                <span
                  className={
                    spriteCleanDivision ? 'text-accent' : 'text-accent'
                  }
                >
                  {spriteCleanDivision ? '✓' : '⚠'} Frame: {spriteFrameW}×
                  {spriteFrameH}px
                </span>
                <span className="text-muted ml-2">
                  · {spriteTotalFrames} frames total
                </span>
                {!spriteCleanDivision && (
                  <p className="text-accent/70 text-xs mt-1">
                    Image doesn&apos;t divide evenly — may cause edge artifacts.
                    Consider resizing.
                  </p>
                )}
              </div>

              {/* Preview with grid overlay */}
              {asset?.file_url && (
                <div className="mb-4 relative overflow-hidden rounded-lg border border-card-border bg-background">
                  <div className="relative inline-block max-w-full">
                    <img
                      src={asset.file_url}
                      alt="Sprite sheet"
                      className="max-w-full max-h-48 object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage: `
                      repeating-linear-gradient(90deg, rgba(45,212,191,0.3) 0px, rgba(45,212,191,0.3) 1px, transparent 1px, transparent ${100 / spriteColumns}%),
                      repeating-linear-gradient(0deg, rgba(45,212,191,0.3) 0px, rgba(45,212,191,0.3) 1px, transparent 1px, transparent ${100 / spriteRows}%)
                    `,
                        backgroundSize: `${100 / spriteColumns}% ${100 / spriteRows}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Anchor Point */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Field label="Anchor X" hint="0=left, 0.5=center, 1=right">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={1}
                    value={spriteAnchorX}
                    onChange={(e) => setSpriteAnchorX(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Anchor Y" hint="0=top, 1=feet">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={1}
                    value={spriteAnchorY}
                    onChange={(e) => setSpriteAnchorY(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
              </div>

              {/* Direction Map */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={useDirectionMap}
                    onChange={(e) => setUseDirectionMap(e.target.checked)}
                    className="checkbox checkbox-sm checkbox-accent"
                  />
                  <span className="text-white/70 text-sm">
                    Directional rows
                  </span>
                  <span className="text-white/40 text-xs">
                    (each row = a facing direction)
                  </span>
                </label>
                {useDirectionMap && (
                  <div className="grid grid-cols-2 gap-2 pl-6">
                    {Array.from({ length: spriteRows }, (_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-white/40 text-xs w-12">
                          Row {i}:
                        </span>
                        <select
                          value={directionMap[String(i)] || ''}
                          onChange={(e) =>
                            updateDirectionRow(String(i), e.target.value)
                          }
                          className={`${inputSmCls} text-xs py-1`}
                        >
                          <option value="">—</option>
                          <option value="down">↓ Down</option>
                          <option value="left">← Left</option>
                          <option value="right">→ Right</option>
                          <option value="up">↑ Up</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Animation States */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/70 text-xs">
                    Animation States
                  </span>
                  <button
                    onClick={addSpriteState}
                    className="text-accent text-xs hover:text-accent"
                  >
                    + Add State
                  </button>
                </div>
                <div className="space-y-3">
                  {Object.entries(spriteStates).map(([key, state]) => (
                    <div
                      key={key}
                      className="bg-input border border-card-border rounded-lg p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={key}
                          onChange={(e) =>
                            renameSpriteState(
                              key,
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9_]/g, '')
                            )
                          }
                          className="bg-transparent text-accent text-sm font-mono font-bold border-b border-card-border focus:border-accent outline-none w-28"
                        />
                        <span className="text-white/40 text-xs flex-1">
                          {state.end_col - state.start_col + 1} frame
                          {state.end_col !== state.start_col ? 's' : ''} @{' '}
                          {state.fps}fps
                        </span>
                        {key !== 'idle' && (
                          <button
                            onClick={() => removeSpriteState(key)}
                            className="text-red-400/60 hover:text-red-400 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        <Field label="Row">
                          <input
                            type="number"
                            min={0}
                            max={spriteRows - 1}
                            value={state.row}
                            onChange={(e) =>
                              updateSpriteState(
                                key,
                                'row',
                                Number(e.target.value)
                              )
                            }
                            className={`${inputSmCls} text-xs py-1`}
                          />
                        </Field>
                        <Field label="From col">
                          <input
                            type="number"
                            min={0}
                            max={spriteColumns - 1}
                            value={state.start_col}
                            onChange={(e) =>
                              updateSpriteState(
                                key,
                                'start_col',
                                Number(e.target.value)
                              )
                            }
                            className={`${inputSmCls} text-xs py-1`}
                          />
                        </Field>
                        <Field label="To col">
                          <input
                            type="number"
                            min={0}
                            max={spriteColumns - 1}
                            value={state.end_col}
                            onChange={(e) =>
                              updateSpriteState(
                                key,
                                'end_col',
                                Number(e.target.value)
                              )
                            }
                            className={`${inputSmCls} text-xs py-1`}
                          />
                        </Field>
                        <Field label="FPS">
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={state.fps}
                            onChange={(e) =>
                              updateSpriteState(
                                key,
                                'fps',
                                Number(e.target.value)
                              )
                            }
                            className={`${inputSmCls} text-xs py-1`}
                          />
                        </Field>
                        <Field label="Loop">
                          <select
                            value={state.loop ? 'true' : 'false'}
                            onChange={(e) =>
                              updateSpriteState(
                                key,
                                'loop',
                                e.target.value === 'true'
                              )
                            }
                            className={`${inputSmCls} text-xs py-1`}
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Interaction */}
          {showSection(type, 'interaction') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">👆 Interaction</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Type">
                  <select
                    value={interactionType}
                    onChange={(e) =>
                      setInteractionType(e.target.value as InteractionType)
                    }
                    className={inputSmCls}
                  >
                    <option value="none">None</option>
                    <option value="tap">Tap</option>
                    <option value="long_press">Long Press</option>
                    <option value="drag">Drag</option>
                    <option value="proximity">Proximity</option>
                  </select>
                </Field>
                <Field label="Range" hint="tiles">
                  <input
                    type="number"
                    step={0.5}
                    value={interactionRange}
                    onChange={(e) =>
                      setInteractionRange(Number(e.target.value))
                    }
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Cooldown" hint="ms">
                  <input
                    type="number"
                    step={100}
                    value={interactionCooldown}
                    onChange={(e) =>
                      setInteractionCooldown(Number(e.target.value))
                    }
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Requires Facing">
                  <select
                    value={interactionFacing ? 'true' : 'false'}
                    onChange={(e) =>
                      setInteractionFacing(e.target.value === 'true')
                    }
                    className={inputSmCls}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </Field>
              </div>
            </Card>
          )}

          {/* Movement */}
          {showSection(type, 'movement') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">🏃 Movement</h3>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Move Type">
                  <select
                    value={moveType}
                    onChange={(e) => setMoveType(e.target.value as MoveType)}
                    className={inputSmCls}
                  >
                    <option value="static">⏹️ Static</option>
                    <option value="wander">🔀 Wander</option>
                    <option value="patrol">🔄 Patrol</option>
                    <option value="follow">👣 Follow</option>
                    <option value="flee">💨 Flee</option>
                  </select>
                </Field>
                <Field label="Personality" hint="how it behaves">
                  <select
                    value={movePersonality}
                    onChange={(e) =>
                      setMovePersonality(e.target.value as MovePersonality | '')
                    }
                    className={inputSmCls}
                  >
                    <option value="">(auto from type)</option>
                    <option value="calm">
                      🌿 Calm — slow, peaceful, long rests
                    </option>
                    <option value="energetic">
                      ⚡ Energetic — fast, frequent moves
                    </option>
                    <option value="nervous">
                      👀 Nervous — alert, restless, quick turns
                    </option>
                    <option value="lazy">
                      😴 Lazy — mostly resting, rare moves
                    </option>
                    <option value="curious">
                      🔍 Curious — explores, varied paths
                    </option>
                    <option value="guard">
                      🛡️ Guard — stays at post, short patrols
                    </option>
                    <option value="ambient">
                      🔥 Ambient — stationary loop only
                    </option>
                    <option value="playful">
                      🎉 Playful — bouncy, quick, emotes
                    </option>
                    <option value="shy">
                      🫣 Shy — retreats, cautious, hides
                    </option>
                    <option value="aggressive">
                      🐺 Aggressive — active, approaches targets
                    </option>
                    <option value="graceful">
                      🦋 Graceful — floaty, ultra-smooth
                    </option>
                    <option value="erratic">
                      🦇 Erratic — chaotic, unpredictable
                    </option>
                    <option value="social">
                      🫂 Social — tends toward others
                    </option>
                    <option value="patrol">
                      🚶 Patrol — strict waypoint routes
                    </option>
                  </select>
                </Field>
                <Field label="Speed" hint="tiles/sec">
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={moveSpeed}
                    onChange={(e) => setMoveSpeed(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                {moveType === 'wander' && (
                  <Field label="Wander Radius" hint="tiles">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      value={moveWanderRadius}
                      onChange={(e) =>
                        setMoveWanderRadius(Number(e.target.value))
                      }
                      className={inputSmCls}
                    />
                  </Field>
                )}
                <Field label="Avoid Obstacles">
                  <select
                    value={moveAvoidObstacles ? 'true' : 'false'}
                    onChange={(e) =>
                      setMoveAvoidObstacles(e.target.value === 'true')
                    }
                    className={inputSmCls}
                  >
                    <option value="true">Yes (pathfinding)</option>
                    <option value="false">No (direct)</option>
                  </select>
                </Field>
              </div>
            </Card>
          )}

          {/* Spawn */}
          {showSection(type, 'spawn') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">📍 Spawn Config</h3>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Position X">
                  <input
                    type="number"
                    step={1}
                    value={spawnX}
                    onChange={(e) => setSpawnX(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Position Y">
                  <input
                    type="number"
                    step={1}
                    value={spawnY}
                    onChange={(e) => setSpawnY(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Z-Index">
                  <input
                    type="number"
                    step={1}
                    value={spawnZIndex}
                    onChange={(e) => setSpawnZIndex(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Layer">
                  <select
                    value={spawnLayer}
                    onChange={(e) => setSpawnLayer(e.target.value)}
                    className={inputSmCls}
                  >
                    <option value="ground">Ground</option>
                    <option value="ground_decor">Ground Decor</option>
                    <option value="objects">Objects</option>
                    <option value="characters">Characters</option>
                    <option value="effects">Effects</option>
                    <option value="ui">UI</option>
                  </select>
                </Field>
                <Field label="Facing">
                  <select
                    value={spawnFacing}
                    onChange={(e) => setSpawnFacing(e.target.value)}
                    className={inputSmCls}
                  >
                    <option value="south">South</option>
                    <option value="north">North</option>
                    <option value="east">East</option>
                    <option value="west">West</option>
                  </select>
                </Field>
              </div>
            </Card>
          )}

          {/* Rules */}
          {showSection(type, 'rules') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">📜 Rules</h3>
              <div className="space-y-4">
                <Field label="Description">
                  <input
                    value={rulesDescription}
                    onChange={(e) => setRulesDescription(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Max Users">
                    <input
                      type="number"
                      step={1}
                      min={0}
                      value={rulesMaxUsers}
                      onChange={(e) => setRulesMaxUsers(Number(e.target.value))}
                      className={inputSmCls}
                    />
                  </Field>
                  <Field label="Level Required">
                    <input
                      type="number"
                      step={1}
                      min={0}
                      value={rulesLevelRequired}
                      onChange={(e) =>
                        setRulesLevelRequired(Number(e.target.value))
                      }
                      className={inputSmCls}
                    />
                  </Field>
                  <Field label="Requires Item">
                    <input
                      value={rulesRequiresItem}
                      onChange={(e) => setRulesRequiresItem(e.target.value)}
                      placeholder="None"
                      className={inputSmCls}
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rulesMovable}
                      onChange={(e) => setRulesMovable(e.target.checked)}
                      className="checkbox checkbox-sm checkbox-accent"
                    />
                    <span className="text-white/70 text-sm">Movable</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rulesDestructible}
                      onChange={(e) => setRulesDestructible(e.target.checked)}
                      className="checkbox checkbox-sm checkbox-accent"
                    />
                    <span className="text-white/70 text-sm">Destructible</span>
                  </label>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ====== RIGHT COLUMN ====== */}
        <div className="space-y-6">
          {/* HEARTS */}
          {showSection(type, 'hearts') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">💚 HEARTS Mapping</h3>
              <div className="space-y-3">
                <Field label="Primary Facet">
                  <select
                    value={primaryFacet}
                    onChange={(e) =>
                      setPrimaryFacet(e.target.value as HeartsFacet | '')
                    }
                    className={inputSmCls}
                  >
                    <option value="">None</option>
                    {HEARTS_FACETS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.key} — {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Secondary Facet">
                  <select
                    value={secondaryFacet}
                    onChange={(e) =>
                      setSecondaryFacet(e.target.value as HeartsFacet | '')
                    }
                    className={inputSmCls}
                  >
                    <option value="">None</option>
                    {HEARTS_FACETS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.key} — {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Base Delta">
                  <input
                    type="number"
                    step={0.5}
                    value={baseDelta}
                    onChange={(e) => setBaseDelta(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Description">
                  <input
                    value={heartsDesc}
                    onChange={(e) => setHeartsDesc(e.target.value)}
                    className={inputSmCls}
                  />
                </Field>
              </div>
            </Card>
          )}

          {/* AOE */}
          {showSection(type, 'aoe') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">🎯 Area of Effect</h3>
              <div className="space-y-3">
                <Field label="Shape">
                  <select
                    value={aoeShape}
                    onChange={(e) => setAoeShape(e.target.value as AOEShape)}
                    className={inputSmCls}
                  >
                    <option value="none">None</option>
                    <option value="circle">Circle</option>
                    <option value="rectangle">Rectangle</option>
                    <option value="polygon">Polygon</option>
                  </select>
                </Field>
                {aoeShape === 'circle' && (
                  <Field label="Radius" hint="tiles">
                    <input
                      type="number"
                      step={0.5}
                      value={aoeRadius}
                      onChange={(e) => setAoeRadius(Number(e.target.value))}
                      className={inputSmCls}
                    />
                  </Field>
                )}
                {aoeShape === 'rectangle' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Width">
                      <input
                        type="number"
                        step={0.5}
                        value={aoeWidth}
                        onChange={(e) => setAoeWidth(Number(e.target.value))}
                        className={inputSmCls}
                      />
                    </Field>
                    <Field label="Height">
                      <input
                        type="number"
                        step={0.5}
                        value={aoeHeight}
                        onChange={(e) => setAoeHeight(Number(e.target.value))}
                        className={inputSmCls}
                      />
                    </Field>
                  </div>
                )}
                <Field label="Unit">
                  <select
                    value={aoeUnit}
                    onChange={(e) =>
                      setAoeUnit(e.target.value as 'tiles' | 'pixels')
                    }
                    className={inputSmCls}
                  >
                    <option value="tiles">Tiles</option>
                    <option value="pixels">Pixels</option>
                  </select>
                </Field>
              </div>
            </Card>
          )}

          {/* Dimensions */}
          {showSection(type, 'dimensions') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">📏 Dimensions</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Width" hint="px">
                  <input
                    type="number"
                    step={1}
                    min={0}
                    value={dimWidth}
                    onChange={(e) => setDimWidth(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Height" hint="px">
                  <input
                    type="number"
                    step={1}
                    min={0}
                    value={dimHeight}
                    onChange={(e) => setDimHeight(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
              </div>
              {dimWidth > 0 && dimHeight > 0 && (
                <p className="text-accent text-xs mt-2">
                  {dimWidth} × {dimHeight} px
                </p>
              )}
            </Card>
          )}

          {/* Hitbox */}
          {showSection(type, 'hitbox') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">📐 Hitbox</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Width">
                  <input
                    type="number"
                    step={0.5}
                    value={hitboxW}
                    onChange={(e) => setHitboxW(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Height">
                  <input
                    type="number"
                    step={0.5}
                    value={hitboxH}
                    onChange={(e) => setHitboxH(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Offset X">
                  <input
                    type="number"
                    step={0.5}
                    value={hitboxOffX}
                    onChange={(e) => setHitboxOffX(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Offset Y">
                  <input
                    type="number"
                    step={0.5}
                    value={hitboxOffY}
                    onChange={(e) => setHitboxOffY(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
              </div>
            </Card>
          )}

          {/* Tile Config */}
          {showSection(type, 'tile_config') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">🚶 Tile Config</h3>
              <div className="space-y-3">
                <Field label="Walkability">
                  <select
                    value={tileWalkable}
                    onChange={(e) =>
                      setTileWalkable(e.target.value as TileWalkability)
                    }
                    className={inputSmCls}
                  >
                    <option value="walkable">✅ Walkable</option>
                    <option value="blocked">🚫 Blocked</option>
                    <option value="slow">🐢 Slow</option>
                    <option value="hazard">⚠️ Hazard</option>
                  </select>
                </Field>
                <Field label="Terrain Cost" hint="1.0=normal, 2.0=slow">
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={tileTerrainCost}
                    onChange={(e) => setTileTerrainCost(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Terrain Type" hint="grass, stone, water...">
                  <input
                    value={tileTerrainType}
                    onChange={(e) => setTileTerrainType(e.target.value)}
                    placeholder="grass"
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Auto-Tile Group" hint="for seamless tiling">
                  <input
                    value={tileAutoGroup}
                    onChange={(e) => setTileAutoGroup(e.target.value)}
                    placeholder="grass_01"
                    className={inputSmCls}
                  />
                </Field>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tileIsEdge}
                    onChange={(e) => setTileIsEdge(e.target.checked)}
                    className="checkbox checkbox-sm checkbox-accent"
                  />
                  <span className="text-white/70 text-sm">
                    Edge / border tile
                  </span>
                </label>
              </div>
            </Card>
          )}

          {/* Audio Config */}
          {showSection(type, 'audio_config') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">🔊 Audio Config</h3>
              <div className="space-y-3">
                <Field label="Category">
                  <select
                    value={audioCategory}
                    onChange={(e) =>
                      setAudioCategory(e.target.value as AudioCategory)
                    }
                    className={inputSmCls}
                  >
                    <option value="sfx">🔊 SFX</option>
                    <option value="music">🎵 Music</option>
                    <option value="ambient">🌿 Ambient</option>
                    <option value="ui">🖥️ UI</option>
                    <option value="voice">🗣️ Voice</option>
                  </select>
                </Field>
                <Field label="Trigger">
                  <select
                    value={audioTrigger}
                    onChange={(e) =>
                      setAudioTrigger(e.target.value as AudioTrigger)
                    }
                    className={inputSmCls}
                  >
                    <option value="ambient">Ambient (always)</option>
                    <option value="proximity">Proximity</option>
                    <option value="event">Event</option>
                    <option value="interaction">Interaction</option>
                  </select>
                </Field>
                <Field label="Volume" hint="0.0–1.0">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={1}
                    value={audioVolume}
                    onChange={(e) => setAudioVolume(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fade In" hint="ms">
                    <input
                      type="number"
                      step={100}
                      min={0}
                      value={audioFadeIn}
                      onChange={(e) => setAudioFadeIn(Number(e.target.value))}
                      className={inputSmCls}
                    />
                  </Field>
                  <Field label="Fade Out" hint="ms">
                    <input
                      type="number"
                      step={100}
                      min={0}
                      value={audioFadeOut}
                      onChange={(e) => setAudioFadeOut(Number(e.target.value))}
                      className={inputSmCls}
                    />
                  </Field>
                </div>
                <Field label="Radius" hint="tiles (for spatial audio)">
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={audioRadius}
                    onChange={(e) => setAudioRadius(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audioLoop}
                      onChange={(e) => setAudioLoop(e.target.checked)}
                      className="checkbox checkbox-sm checkbox-accent"
                    />
                    <span className="text-white/70 text-sm">Loop</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audioSpatial}
                      onChange={(e) => setAudioSpatial(e.target.checked)}
                      className="checkbox checkbox-sm checkbox-accent"
                    />
                    <span className="text-white/70 text-sm">3D Spatial</span>
                  </label>
                </div>
              </div>
            </Card>
          )}

          {/* Tilemap Config */}
          {showSection(type, 'tilemap_config') && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">🗺️ Tilemap Config</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Grid Width" hint="tiles">
                    <input
                      type="number"
                      step={1}
                      min={0}
                      value={tilemapGridW}
                      onChange={(e) => setTilemapGridW(Number(e.target.value))}
                      className={inputSmCls}
                    />
                  </Field>
                  <Field label="Grid Height" hint="tiles">
                    <input
                      type="number"
                      step={1}
                      min={0}
                      value={tilemapGridH}
                      onChange={(e) => setTilemapGridH(Number(e.target.value))}
                      className={inputSmCls}
                    />
                  </Field>
                </div>
                <Field label="Tile Size" hint="px per tile">
                  <input
                    type="number"
                    step={1}
                    min={1}
                    value={tilemapTileSize}
                    onChange={(e) => setTilemapTileSize(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Layers">
                  <input
                    type="number"
                    step={1}
                    min={1}
                    value={tilemapLayers}
                    onChange={(e) => setTilemapLayers(Number(e.target.value))}
                    className={inputSmCls}
                  />
                </Field>
                <Field label="Orientation">
                  <select
                    value={tilemapOrientation}
                    onChange={(e) =>
                      setTilemapOrientation(
                        e.target.value as TilemapOrientation
                      )
                    }
                    className={inputSmCls}
                  >
                    <option value="isometric">◇ Isometric</option>
                    <option value="orthogonal">□ Orthogonal</option>
                    <option value="hexagonal">⬡ Hexagonal</option>
                  </select>
                </Field>
              </div>
            </Card>
          )}

          {/* File Info */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-3">📎 File Info</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Size</span>
                <span className="text-white">
                  {(asset.file_size / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">MIME</span>
                <span className="text-white font-mono">{asset.mime_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Version</span>
                <span className="text-white">v{asset.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Created</span>
                <span className="text-white">
                  {new Date(asset.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Card>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full btn bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl disabled:opacity-50"
          >
            {deleting ? '⏳ Deleting...' : '🗑️ Delete Asset'}
          </button>
        </div>
      </div>
    </>
  )
}
