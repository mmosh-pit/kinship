'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge } from '@/components/UI'
import { ASSET_TYPES, HEARTS_FACETS } from '@/lib/data'
import {
  useAsset,
  useAssetAuditLog,
  useAssetKnowledge,
  generateAssetKnowledge,
} from '@/hooks/useApi'

export default function AssetDetailPage() {
  const params = useParams()
  const id = params.id as string

  const { data: asset, loading, error } = useAsset(id)
  const { data: auditLog, loading: auditLoading } = useAssetAuditLog(id)
  const { data: assetKnowledge, refetch: refetchKnowledge } =
    useAssetKnowledge(id)
  const [generating, setGenerating] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center mx-auto mb-3 animate-pulse">
            <span className="text-xl">📦</span>
          </div>
          <p className="text-muted text-sm">Loading asset...</p>
        </div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <Card className="p-6 m-6 border-red-500/20">
        <p className="text-red-400">⚠️ {error || 'Asset not found'}</p>
        <Link
          href="/assets"
          className="text-accent text-sm hover:underline mt-2 block"
        >
          ← Back to assets
        </Link>
      </Card>
    )
  }

  const typeInfo = ASSET_TYPES.find((t) => t.value === asset.type)
  const meta = asset.metadata
  const originalDimensions = meta?.custom_properties?.original_dimensions as
    | { width?: number; height?: number }
    | undefined

  return (
    <>
      <PageHeader
        title={asset.display_name}
        subtitle={`${typeInfo?.label || asset.type} · ${asset.name}`}
        breadcrumbs={[
          { label: 'Assets', href: '/assets' },
          { label: asset.display_name },
        ]}
        action={
          <div className="flex gap-2">
            <Link
              href={`/assets/${id}/knowledge`}
              className="btn bg-white/[0.1] border-white/[0.15] text-white hover:bg-white/[0.1] rounded-xl"
            >
              🧠 Knowledge
            </Link>
            <Link
              href={`/assets/${id}/edit`}
              className="btn bg-white/[0.1] border-white/[0.15] text-white hover:bg-white/[0.1] rounded-xl"
            >
              ✏️ Edit
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Preview */}
          <Card className="overflow-hidden">
            <div className="h-64 bg-gradient-to-br from-[#050824] to-[#100e59] flex items-center justify-center border-b border-card-border">
              {asset.thumbnail_url || asset.file_url ? (
                <img
                  src={asset.thumbnail_url || asset.file_url}
                  alt={asset.display_name}
                  className="max-h-full max-w-full object-contain p-8"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <span className="text-6xl opacity-20">
                  {typeInfo?.icon || '📦'}
                </span>
              )}
            </div>
          </Card>

          {/* Description */}
          {asset.meta_description && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">Description</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                {asset.meta_description}
              </p>
            </Card>
          )}

          {/* Metadata */}
          {meta && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">Metadata</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Dimensions */}
                {originalDimensions && (
                  <div className="bg-sidebar rounded-xl p-4">
                    <p className="text-muted text-xs uppercase tracking-wider mb-2">
                      📏 Dimensions
                    </p>
                    <p className="text-white text-sm">
                      {originalDimensions.width} × {originalDimensions.height}{' '}
                      px
                    </p>
                  </div>
                )}

                {/* HEARTS */}
                {(meta.hearts_mapping?.primary_facet ||
                  meta.hearts_mapping?.secondary_facet) && (
                  <div className="bg-sidebar rounded-xl p-4">
                    <p className="text-muted text-xs uppercase tracking-wider mb-2">
                      💚 HEARTS Mapping
                    </p>
                    <div className="space-y-2">
                      {meta.hearts_mapping.primary_facet && (
                        <div className="flex items-center gap-2">
                          <FacetBadge
                            facet={meta.hearts_mapping.primary_facet}
                            size="md"
                          />
                          <span className="text-white text-sm">
                            Primary · Δ
                            {meta.hearts_mapping.base_delta > 0 ? '+' : ''}
                            {meta.hearts_mapping.base_delta}
                          </span>
                        </div>
                      )}
                      {meta.hearts_mapping.secondary_facet && (
                        <div className="flex items-center gap-2">
                          <FacetBadge
                            facet={meta.hearts_mapping.secondary_facet}
                          />
                          <span className="text-white/70 text-sm">
                            Secondary
                          </span>
                        </div>
                      )}
                      {meta.hearts_mapping.description && (
                        <p className="text-muted text-xs mt-1">
                          {meta.hearts_mapping.description}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* AOE */}
                <div className="bg-sidebar rounded-xl p-4">
                  <p className="text-muted text-xs uppercase tracking-wider mb-2">
                    🎯 Area of Effect
                  </p>
                  <p className="text-white text-sm capitalize">
                    {meta.aoe?.shape || 'none'}
                  </p>
                  {meta.aoe?.radius && (
                    <p className="text-white/70 text-xs">
                      Radius: {meta.aoe.radius} {meta.aoe.unit}
                    </p>
                  )}
                </div>

                {/* Hitbox */}
                <div className="bg-sidebar rounded-xl p-4">
                  <p className="text-muted text-xs uppercase tracking-wider mb-2">
                    📐 Hitbox
                  </p>
                  <p className="text-white text-sm">
                    {meta.hitbox?.width} × {meta.hitbox?.height}
                  </p>
                  <p className="text-white/70 text-xs">
                    Offset: ({meta.hitbox?.offset_x}, {meta.hitbox?.offset_y})
                  </p>
                </div>

                {/* Interaction */}
                <div className="bg-sidebar rounded-xl p-4">
                  <p className="text-muted text-xs uppercase tracking-wider mb-2">
                    👆 Interaction
                  </p>
                  <p className="text-white text-sm capitalize">
                    {meta.interaction?.type || 'tap'}
                  </p>
                  <p className="text-white/70 text-xs">
                    Range: {meta.interaction?.range} tiles · Cooldown:{' '}
                    {meta.interaction?.cooldown_ms}ms
                  </p>
                </div>

                {/* Spawn */}
                {meta.spawn && (
                  <div className="bg-sidebar rounded-xl p-4">
                    <p className="text-muted text-xs uppercase tracking-wider mb-2">
                      📍 Spawn
                    </p>
                    <p className="text-white text-sm">
                      ({meta.spawn.default_position?.x},{' '}
                      {meta.spawn.default_position?.y})
                    </p>
                    <p className="text-white/70 text-xs">
                      Layer: {meta.spawn.layer} · Z: {meta.spawn.z_index} ·
                      Facing: {meta.spawn.facing}
                    </p>
                  </div>
                )}

                {/* Rules */}
                {meta.rules && (
                  <div className="bg-sidebar rounded-xl p-4">
                    <p className="text-muted text-xs uppercase tracking-wider mb-2">
                      📋 Rules
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {meta.rules.is_movable && (
                        <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full">
                          Movable
                        </span>
                      )}
                      {meta.rules.is_destructible && (
                        <span className="text-[10px] bg-red-400/10 text-red-400 px-2 py-0.5 rounded-full">
                          Destructible
                        </span>
                      )}
                      <span className="text-[10px] bg-card text-white/70 px-2 py-0.5 rounded-full">
                        Max users: {meta.rules.max_users}
                      </span>
                      {meta.rules.level_required > 0 && (
                        <span className="text-[10px] bg-amber-400/10 text-accent px-2 py-0.5 rounded-full">
                          Level {meta.rules.level_required}+
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Sprite Sheet */}
                {meta.sprite_sheet && (
                  <div className="bg-sidebar rounded-xl p-4 col-span-2">
                    <p className="text-muted text-xs uppercase tracking-wider mb-2">
                      🎬 Sprite Sheet
                    </p>
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <div>
                        <p className="text-white/40 text-[10px]">Frame Size</p>
                        <p className="text-white text-sm">
                          {meta.sprite_sheet.frame_width}×
                          {meta.sprite_sheet.frame_height}px
                        </p>
                      </div>
                      <div>
                        <p className="text-white/40 text-[10px]">Grid</p>
                        <p className="text-white text-sm">
                          {meta.sprite_sheet.columns}×{meta.sprite_sheet.rows}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/40 text-[10px]">
                          Total Frames
                        </p>
                        <p className="text-white text-sm">
                          {meta.sprite_sheet.columns * meta.sprite_sheet.rows}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/40 text-[10px]">Anchor</p>
                        <p className="text-white text-sm">
                          ({meta.sprite_sheet.anchor_x},{' '}
                          {meta.sprite_sheet.anchor_y})
                        </p>
                      </div>
                    </div>
                    {meta.sprite_sheet.direction_map && (
                      <div className="mb-2">
                        <p className="text-white/40 text-[10px] mb-1">
                          Directions
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(meta.sprite_sheet.direction_map).map(
                            ([row, dir]) => (
                              <span
                                key={row}
                                className="text-[10px] bg-card text-white/70 px-2 py-0.5 rounded-full"
                              >
                                Row {row}: {dir}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}
                    {meta.sprite_sheet.states &&
                      Object.keys(meta.sprite_sheet.states).length > 0 && (
                        <div>
                          <p className="text-white/40 text-[10px] mb-1">
                            States
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(meta.sprite_sheet.states).map(
                              ([name, st]) => (
                                <span
                                  key={name}
                                  className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full"
                                >
                                  {name}: row{(st as { row: number }).row} cols
                                  {(st as { start_col: number }).start_col}-
                                  {(st as { end_col: number }).end_col} @
                                  {(st as { fps: number }).fps}fps{' '}
                                  {(st as { loop: boolean }).loop ? '🔁' : '▶'}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Audit Log */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Audit Log</h3>
            {auditLoading ? (
              <p className="text-white/40 text-sm">Loading...</p>
            ) : auditLog && auditLog.length > 0 ? (
              <div className="space-y-2">
                {auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 bg-sidebar rounded-xl px-4 py-3"
                  >
                    <span className="text-white/40 text-xs font-mono">
                      {new Date(entry.performed_at).toLocaleString()}
                    </span>
                    <span className="text-white text-sm capitalize">
                      {entry.action.replace('_', ' ')}
                    </span>
                    <span className="text-muted text-xs ml-auto">
                      by {entry.performed_by}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm">No audit entries</p>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Properties</h3>
            <div className="space-y-4">
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Status
                </p>
                <StatusBadge status={asset.is_active ? 'active' : 'inactive'} />
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Type
                </p>
                <span className="text-white text-sm">
                  {typeInfo?.icon} {typeInfo?.label}
                </span>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Slug
                </p>
                <span className="text-white text-sm font-mono">
                  {asset.name}
                </span>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  File Size
                </p>
                <span className="text-white text-sm">
                  {(asset.file_size / 1024).toFixed(1)} KB
                </span>
              </div>
              {originalDimensions && (
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider mb-1">
                    Dimensions
                  </p>
                  <span className="text-white text-sm">
                    {originalDimensions.width} × {originalDimensions.height} px
                  </span>
                </div>
              )}
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  MIME Type
                </p>
                <span className="text-white text-sm font-mono">
                  {asset.mime_type}
                </span>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Version
                </p>
                <span className="text-white text-sm">v{asset.version}</span>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Created
                </p>
                <span className="text-white text-sm">
                  {new Date(asset.created_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Created By
                </p>
                <span className="text-white text-sm">{asset.created_by}</span>
              </div>
            </div>
          </Card>

          {/* Knowledge Summary */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold">🧠 Knowledge</h3>
              <Link
                href={`/assets/${id}/knowledge`}
                className="text-accent text-xs hover:text-accent"
              >
                {assetKnowledge ? 'Edit →' : 'Add →'}
              </Link>
            </div>
            {assetKnowledge ? (
              <div className="space-y-3">
                {assetKnowledge.scene_role && (
                  <div>
                    <p className="text-white/40 text-[10px] uppercase">Role</p>
                    <p className="text-white text-sm capitalize">
                      {assetKnowledge.scene_role.replace('_', ' ')}
                    </p>
                  </div>
                )}
                {assetKnowledge.visual_description && (
                  <div>
                    <p className="text-white/40 text-[10px] uppercase">
                      Description
                    </p>
                    <p className="text-white/70 text-xs leading-relaxed line-clamp-3">
                      {assetKnowledge.visual_description}
                    </p>
                  </div>
                )}
                {assetKnowledge.suitable_facets &&
                  assetKnowledge.suitable_facets.length > 0 && (
                    <div>
                      <p className="text-white/40 text-[10px] uppercase mb-1">
                        Facets
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {assetKnowledge.suitable_facets.map((f) => (
                          <FacetBadge key={f} facet={f} />
                        ))}
                      </div>
                    </div>
                  )}
                {assetKnowledge.therapeutic_use && (
                  <div>
                    <p className="text-white/40 text-[10px] uppercase">
                      Therapeutic
                    </p>
                    <p className="text-white/70 text-xs leading-relaxed line-clamp-2">
                      {assetKnowledge.therapeutic_use}
                    </p>
                  </div>
                )}
                <p className="text-white/40 text-[10px]">
                  v{assetKnowledge.generation_version} ·{' '}
                  {assetKnowledge.generated_by || 'unknown'}
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-white/40 text-sm mb-3">No knowledge yet</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={async () => {
                      setGenerating(true)
                      try {
                        await generateAssetKnowledge(id)
                        refetchKnowledge()
                      } catch {
                        /* ignore */
                      }
                      setGenerating(false)
                    }}
                    disabled={generating}
                    className="text-purple-400 text-xs bg-purple-400/10 hover:bg-purple-400/20 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {generating ? '⏳ Generating...' : '🤖 Generate with AI'}
                  </button>
                  <Link
                    href={`/assets/${id}/knowledge`}
                    className="text-accent text-xs hover:underline"
                  >
                    ✏️ Add manually
                  </Link>
                </div>
              </div>
            )}
          </Card>

          {asset.tags.length > 0 && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {asset.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-sidebar text-white/70 px-3 py-1.5 rounded-lg"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
