'use client'

import { useState, useEffect } from 'react'
import { backendApi } from '@/lib/api'
import { Spinner } from '@/components/UI'

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

interface PlatformCapabilities {
  platform_id: string
  asset_types: Record<string, number>
  total_assets: number
  capabilities: {
    has_npcs: boolean
    has_sprites: boolean
    has_animated_sprites: boolean
    has_tiles: boolean
    has_audio: boolean
  }
  scene_types: string[]
  facets_supported: string[]
}

interface Props {
  platformId: string
  platformName?: string
  onCapabilitiesLoaded?: (caps: PlatformCapabilities) => void
  compact?: boolean
}

// ═══════════════════════════════════════════════
//  Asset Type Icons
// ═══════════════════════════════════════════════

const ASSET_TYPE_META: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  tile: { icon: '🟫', label: 'Tiles', color: '#f59e0b' },
  sprite: { icon: '🎭', label: 'Sprites', color: '#8b5cf6' },
  npc: { icon: '🧑', label: 'NPCs', color: '#3b82f6' },
  object: { icon: '📦', label: 'Objects', color: '#10b981' },
  prop: { icon: '🪑', label: 'Props', color: '#06b6d4' },
  effect: { icon: '✨', label: 'Effects', color: '#ec4899' },
  audio: { icon: '🔊', label: 'Audio', color: '#f97316' },
  ui: { icon: '🎨', label: 'UI', color: '#6366f1' },
}

// ═══════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════

export default function PlatformCapabilities({
  platformId,
  platformName,
  onCapabilitiesLoaded,
  compact = false,
}: Props) {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(!compact)

  useEffect(() => {
    const fetchCapabilities = async () => {
      if (!platformId) return
      setLoading(true)
      setError(null)
      try {
        // Call backend endpoint for platform capabilities
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/scenes/platform-capabilities/${platformId}`
        )
        if (!response.ok) throw new Error('Failed to fetch capabilities')
        const data = await response.json()
        setCapabilities(data)
        onCapabilitiesLoaded?.(data)
      } catch (err) {
        setError('Could not load platform capabilities')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchCapabilities()
  }, [platformId, onCapabilitiesLoaded])

  if (loading) {
    return (
      <div className="px-4 py-3 bg-card/40 rounded-xl border border-card-border flex items-center gap-2">
        <Spinner size="sm" />
        <span className="text-xs text-muted">
          Loading platform capabilities...
        </span>
      </div>
    )
  }

  if (error || !capabilities) {
    return (
      <div className="px-4 py-3 bg-accent/15 rounded-xl border border-accent/20 flex items-center gap-2">
        <span className="text-sm">⚠️</span>
        <span className="text-xs text-accent">
          {error || 'Platform capabilities unavailable'}
        </span>
      </div>
    )
  }

  const {
    asset_types,
    total_assets,
    capabilities: caps,
    scene_types,
    facets_supported,
  } = capabilities

  // Compact view
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full px-4 py-3 bg-card/40 rounded-xl border border-card-border hover:border-accent/40 transition-colors text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm">📦</span>
            <span className="text-xs text-white/70">
              <span className="text-white font-semibold">{total_assets}</span>{' '}
              assets from{' '}
              <span className="text-accent">
                {platformName || 'platform'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {Object.entries(asset_types)
              .slice(0, 4)
              .map(([type, count]) => {
                const meta = ASSET_TYPE_META[type] || {
                  icon: '📋',
                  label: type,
                  color: '#6b7280',
                }
                return (
                  <div
                    key={type}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]"
                    style={{
                      backgroundColor: `${meta.color}15`,
                      color: meta.color,
                    }}
                  >
                    <span>{meta.icon}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                )
              })}
            <span className="text-white/40 text-xs">▾</span>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="bg-card/40 rounded-xl border border-card-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📦</span>
          <span className="text-xs text-white font-semibold">
            Platform Assets
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent font-semibold">
            {total_assets} total
          </span>
        </div>
        {compact && (
          <button
            onClick={() => setExpanded(false)}
            className="text-muted hover:text-white text-xs"
          >
            ▴ Collapse
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Asset Types Grid */}
        <div>
          <div className="text-[10px] text-muted font-semibold mb-2">
            AVAILABLE ASSETS
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(asset_types).map(([type, count]) => {
              const meta = ASSET_TYPE_META[type] || {
                icon: '📋',
                label: type,
                color: '#6b7280',
              }
              return (
                <div
                  key={type}
                  className="px-3 py-2 rounded-lg border text-center"
                  style={{
                    backgroundColor: `${meta.color}08`,
                    borderColor: `${meta.color}20`,
                  }}
                >
                  <div className="text-lg mb-0.5">{meta.icon}</div>
                  <div
                    className="text-sm font-bold"
                    style={{ color: meta.color }}
                  >
                    {count}
                  </div>
                  <div className="text-[9px] text-muted">{meta.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Capabilities Indicators */}
        <div>
          <div className="text-[10px] text-muted font-semibold mb-2">
            CAPABILITIES
          </div>
          <div className="flex flex-wrap gap-2">
            <CapabilityBadge
              enabled={caps.has_npcs}
              label="NPCs"
              icon="🧑"
              description="Characters for dialogue"
            />
            <CapabilityBadge
              enabled={caps.has_sprites}
              label="Sprites"
              icon="🎭"
              description="Animated characters"
            />
            <CapabilityBadge
              enabled={caps.has_tiles}
              label="Ground Tiles"
              icon="🟫"
              description="Floor/terrain tiles"
            />
            <CapabilityBadge
              enabled={caps.has_animated_sprites}
              label="Animations"
              icon="🎬"
              description="Animated sprites"
            />
            <CapabilityBadge
              enabled={caps.has_audio}
              label="Audio"
              icon="🔊"
              description="Sound effects"
            />
          </div>
        </div>

        {/* Scene Types */}
        {scene_types.length > 0 && (
          <div>
            <div className="text-[10px] text-muted font-semibold mb-2">
              SCENE TYPES ({scene_types.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {scene_types.slice(0, 8).map((type) => (
                <span
                  key={type}
                  className="px-2 py-0.5 rounded text-[10px] bg-input text-white/70 border border-card-border"
                >
                  {type}
                </span>
              ))}
              {scene_types.length > 8 && (
                <span className="px-2 py-0.5 rounded text-[10px] text-muted">
                  +{scene_types.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Warnings */}
        {!caps.has_npcs && (
          <div className="px-3 py-2 bg-accent/15 border border-accent/20 rounded-lg flex items-start gap-2">
            <span className="text-sm">⚠️</span>
            <div>
              <div className="text-xs text-accent font-semibold">
                No NPC Sprites
              </div>
              <div className="text-[10px] text-accent/70">
                Characters will need sprite assignment after creation
              </div>
            </div>
          </div>
        )}
        {!caps.has_tiles && (
          <div className="px-3 py-2 bg-accent/15 border border-accent/20 rounded-lg flex items-start gap-2">
            <span className="text-sm">⚠️</span>
            <div>
              <div className="text-xs text-accent font-semibold">
                No Ground Tiles
              </div>
              <div className="text-[10px] text-accent/70">
                Scenes may appear without terrain. Consider adding tile assets.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Capability Badge Sub-component
// ═══════════════════════════════════════════════

function CapabilityBadge({
  enabled,
  label,
  icon,
  description,
}: {
  enabled: boolean
  label: string
  icon: string
  description: string
}) {
  return (
    <div
      className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
        enabled
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : 'bg-card border-card-border opacity-50'
      }`}
      title={description}
    >
      <span className="text-xs">{icon}</span>
      <span
        className={`text-[10px] font-semibold ${
          enabled ? 'text-emerald-400' : 'text-muted'
        }`}
      >
        {label}
      </span>
      <span className="text-xs">{enabled ? '✓' : '✗'}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Inline Capability Warnings (for AI chat)
// ═══════════════════════════════════════════════

export function CapabilityWarnings({
  capabilities,
  plan,
}: {
  capabilities: PlatformCapabilities | null
  plan: any
}) {
  if (!capabilities || !plan) return null

  const warnings: string[] = []
  const caps = capabilities.capabilities

  // Check if plan has characters but platform has no NPCs
  const planActors = plan.scenes?.flatMap((s: any) => s.actors || []) || []
  const characterCount = planActors.filter(
    (a: any) => a.actor_type === 'character'
  ).length

  if (characterCount > 0 && !caps.has_npcs) {
    warnings.push(
      `Plan includes ${characterCount} characters but platform has no NPC sprites`
    )
  }

  // Check scene types
  const planSceneTypes = new Set(
    plan.scenes?.map((s: any) => s.scene_type) || []
  )
  const availableTypes = new Set(capabilities.scene_types)
  const missingTypes = [...planSceneTypes].filter(
    (t: any) => !availableTypes.has(t)
  )

  if (missingTypes.length > 0) {
    warnings.push(`Scene types not in platform: ${missingTypes.join(', ')}`)
  }

  if (warnings.length === 0) return null

  return (
    <div className="mt-2 space-y-1">
      {warnings.map((w, i) => (
        <div
          key={i}
          className="px-2 py-1.5 bg-accent/15 border border-accent/20 rounded-lg text-[10px] text-accent flex items-center gap-1.5"
        >
          <span>⚠️</span>
          {w}
        </div>
      ))}
    </div>
  )
}
