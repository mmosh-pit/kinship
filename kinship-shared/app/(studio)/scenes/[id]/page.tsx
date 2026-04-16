'use client'

import { use, useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, StatusBadge, FacetBadge, SceneIcon } from '@/components/UI'
import {
  useScene,
  useSceneManifest,
  useNPCs,
  useChallenges,
  useQuests,
  useRoutes,
  deleteScene,
} from '@/hooks/useApi'

// ─── Constants ────────────────────────────────────────────

const FLUTTER_PREVIEW_URL =
  process.env.NEXT_PUBLIC_FLUTTER_PREVIEW_URL || '/flutter_web/index.html'

// ─── Flutter Preview iframe ───────────────────────────────
//
// Timing fix:
// - `loaded` is set ONLY when 'kinship:flutter_ready' is received from Flutter.
// - When flutter_ready fires, we immediately send the manifest (with a small
//   delay to ensure Dart's callback is registered).
// - A manifestRef keeps the latest manifest accessible to the ready handler
//   without stale closure issues.
// - The <iframe> has NO onLoad prop, to avoid the race condition where the
//   manifest postMessage is sent before Dart has registered its callback.

function FlutterPreview({
  manifest,
  className = '',
}: {
  manifest: object | null
  className?: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  // Keep a ref to the latest manifest so the flutter_ready handler can access it
  const manifestRef = useRef(manifest)
  manifestRef.current = manifest

  // Helper: send manifest to Flutter iframe
  const postManifest = useCallback((m: object | null) => {
    if (!m || !iframeRef.current?.contentWindow) return
    try {
      iframeRef.current.contentWindow.postMessage(
        { type: 'kinship:scene_update', manifest: m },
        '*'
      )
    } catch {
      // iframe not ready yet
    }
  }, [])

  // Listen for flutter_ready — this is the ONLY reliable signal that Flutter
  // is ready to receive manifests. When it fires, send immediately.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'kinship:flutter_ready') {
        setLoaded(true)
        setPreviewError(false)
        // Send the current manifest immediately with a small delay
        // to ensure Dart's _onKinshipManifestUpdate callback is registered
        setTimeout(() => postManifest(manifestRef.current), 150)
      }
      if (e.data?.type === 'kinship:flutter_error') {
        setPreviewError(true)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [postManifest])

  // Send manifest updates after Flutter is ready (for subsequent changes).
  // This handles the case where manifest changes after initial load
  // (e.g., data fetched asynchronously).
  useEffect(() => {
    if (!loaded || !manifest) return
    postManifest(manifest)
  }, [loaded, manifest, postManifest])

  const hasManifest = manifest !== null

  return (
    <div
      className={`relative bg-background rounded-xl overflow-hidden border border-card-border ${className}`}
    >
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-[#050824]/95 to-transparent">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${hasManifest ? (loaded ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400') : 'bg-input'}`}
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {hasManifest ? (loaded ? 'Live Preview' : 'Loading...') : 'Preview'}
          </span>
        </div>
        {hasManifest && loaded && (
          <button
            onClick={() => postManifest(manifest)}
            className="text-[10px] px-2 py-1 rounded bg-card text-white/70 hover:text-white transition-colors"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      {hasManifest ? (
        <>
          <iframe
            ref={iframeRef}
            src={`${FLUTTER_PREVIEW_URL}?mode=preview`}
            className="w-full h-full border-0"
            style={{ minHeight: '100%' }}
            onError={() => setPreviewError(true)}
            sandbox="allow-scripts allow-same-origin"
          />
          {previewError && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90">
              <div className="text-center px-6">
                <span className="text-3xl mb-3 block">🎮</span>
                <p className="text-white/70 text-sm mb-1">
                  Flutter preview unavailable
                </p>
                <p className="text-white/40 text-xs">
                  Make sure Flutter Web build is deployed
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-card border border-card-border flex items-center justify-center">
              <span className="text-3xl opacity-30">🎮</span>
            </div>
            <p className="text-white/40 text-sm">Isometric preview</p>
            <p className="text-white/30 text-xs mt-1">will appear here</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────

export default function SceneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: scene, loading, error } = useScene(id)
  const { data: manifestData } = useSceneManifest(id)
  const { data: allNpcsResponse } = useNPCs()
  const { data: allChallengesResponse } = useChallenges()
  const { data: allQuests } = useQuests()
  const { data: allRoutes } = useRoutes()
  const allNpcs = allNpcsResponse?.data || []
  const allChallenges = allChallengesResponse?.data || []

  // Assets from junction table (manually built scenes)
  const sceneAssets: any[] = manifestData?.assets || []

  // GCS manifest embedded in response when ?fullManifest=true (AI-generated scenes)
  const gcsManifest: any = (manifestData as any)?.gcsManifest || null
  const gcsAssets: any[] = gcsManifest?.asset_placements || []

  // Filter entities by scene_id
  const sceneNpcs = allNpcs.filter((n) => n.scene_id === id)
  const sceneChallenges = allChallenges.filter((c) => c.scene_id === id)
  const sceneQuests = allQuests?.filter((q) => q.scene_id === id) || []
  const incomingRoutes = allRoutes?.filter((r) => r.to_scene === id) || []
  const outgoingRoutes =
    allRoutes?.filter((r) => r.from_scene === id || r.from_scene === '*') || []

  const handleDelete = async () => {
    if (!confirm('Delete this scene? This cannot be undone.')) return
    try {
      await deleteScene(id)
      router.push('/scenes')
    } catch (err) {
      console.error('Failed to delete scene:', err)
    }
  }

  const getAssetImageUrl = (asset: any) =>
    asset.thumbnail_url || asset.file_url || null

  if (loading) {
    return (
      <>
        <PageHeader
          title="Loading..."
          breadcrumbs={[{ label: 'Scenes', href: '/scenes' }]}
        />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Card className="h-64 animate-pulse bg-input">
              <></>
            </Card>
          </div>
          <Card className="p-6 animate-pulse bg-input h-48">
            <></>
          </Card>
        </div>
      </>
    )
  }

  if (error || !scene) {
    return (
      <>
        <PageHeader
          title="Scene Not Found"
          breadcrumbs={[{ label: 'Scenes', href: '/scenes' }]}
        />
        <Card className="p-8 text-center">
          <p className="text-red-400 mb-4">{error || 'Scene not found'}</p>
          <Link
            href="/scenes"
            className="btn bg-accent text-white rounded-xl px-4 py-2"
          >
            Back to Scenes
          </Link>
        </Card>
      </>
    )
  }

  const sceneName = scene.scene_name || scene.name || 'Untitled'
  const lighting = scene.ambient?.lighting || 'day'
  const weather = scene.ambient?.weather || 'clear'

  // Build the manifest to send to the Flutter iframe.
  //
  // Priority order:
  //   1. GCS manifest (AI-generated scenes) — already in the exact format Flutter expects,
  //      so pass it through directly.
  //   2. Junction-table assets (manually built scenes) — map to Flutter format.
  //   3. null — show placeholder.
  const flutterManifest: object | null = (() => {
    // Case 1: GCS manifest loaded (AI-generated scene)
    if (gcsManifest && gcsAssets.length > 0) {
      return gcsManifest
    }

    // Case 2: Junction-table assets (manually associated scene)
    if (sceneAssets.length > 0) {
      return {
        scene_name: sceneName,
        scene_type: scene.scene_type || 'standard',
        description: scene.description || '',
        grid_width: (manifestData?.scene as any)?.dimensions?.width || 20,
        grid_height: (manifestData?.scene as any)?.dimensions?.height || 15,
        tile_width: 128,
        tile_height: 64,
        lighting,
        weather,
        spawn_points: scene.spawn_points || [],
        asset_placements: sceneAssets.map((a: any) => ({
          asset_name: a.name || a.display_name || '',
          asset_id: a.id || a.asset_id || '',
          display_name: a.display_name || a.name || '',
          file: a.file_url || a.file || '',
          file_url: a.file_url || '',
          x: a.position?.x ?? a.position_x ?? a.x ?? 0,
          y: a.position?.y ?? a.position_y ?? a.y ?? 0,
          z_index: a.z_index ?? 1,
          layer: a.layer || 'objects',
          scale: a.scale ?? 1.0,
          purpose: a.purpose || '',
        })),
        npcs: sceneNpcs.map((n: any) => ({
          id: n.id,
          name: n.name,
          role: n.role,
          facet: n.facet,
          position: n.position || { x: 0, y: 0 },
          personality: n.personality || '',
          dialogue_style: n.dialogue_style || '',
        })),
        challenges: sceneChallenges.map((c: any) => ({
          id: c.id,
          name: c.name,
          facets: c.facets || [],
          trigger_positions: [],
        })),
        zones: (manifestData?.scene as any)?.zone_descriptions || [],
      }
    }

    return null
  })()

  return (
    <>
      <PageHeader
        title={sceneName}
        subtitle={`${scene.scene_type || 'Unknown'} · ${lighting}`}
        breadcrumbs={[
          { label: 'Scenes', href: '/scenes' },
          { label: sceneName },
        ]}
        action={
          <div className="flex gap-2">
            <Link
              href={`/scenes/${id}/edit`}
              className="btn bg-white/[0.1] border-white/[0.15] text-white hover:bg-white/[0.1] rounded-xl"
            >
              ✏️ Edit
            </Link>
            <button
              onClick={handleDelete}
              className="btn bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl"
            >
              🗑️ Delete
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Flutter Preview */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">🎮 Live Preview</h3>
              <span className="text-white/40 text-xs">Flutter · Flame</span>
            </div>
            <FlutterPreview manifest={flutterManifest} className="h-[480px]" />
          </Card>

          {/* System Prompt */}
          {scene.system_prompt && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">💬 System Prompt</h3>
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
                {scene.system_prompt}
              </p>
            </Card>
          )}

          {/* Description */}
          {scene.description && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-3">📝 Description</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                {scene.description}
              </p>
            </Card>
          )}

          {/* NPCs */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">
                🧑 NPCs ({sceneNpcs.length})
              </h3>
              <Link
                href={`/scenes/${id}/edit`}
                className="text-accent text-sm hover:underline"
              >
                Edit
              </Link>
            </div>
            {sceneNpcs.length > 0 ? (
              <div className="space-y-2">
                {sceneNpcs.map((npc) => (
                  <Link
                    key={npc.id}
                    href={`/npcs/${npc.id}`}
                    className="flex items-center gap-4 bg-sidebar rounded-xl px-4 py-3 hover:bg-sidebar/80 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-lg">
                      🧑
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {npc.name}
                      </p>
                      <p className="text-muted text-xs truncate">
                        {npc.role}
                      </p>
                    </div>
                    {npc.facet && <FacetBadge facet={npc.facet} />}
                    <StatusBadge status={npc.status || 'draft'} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm">No NPCs assigned</p>
            )}
          </Card>

          {/* Quests */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">
                ⚔️ Quests ({sceneQuests.length})
              </h3>
              <Link
                href={`/scenes/${id}/edit`}
                className="text-accent text-sm hover:underline"
              >
                Edit
              </Link>
            </div>
            {sceneQuests.length > 0 ? (
              <div className="space-y-2">
                {sceneQuests.map((quest) => (
                  <Link
                    key={quest.id}
                    href={`/quests/${quest.id}`}
                    className="flex items-center gap-4 bg-sidebar rounded-xl px-4 py-3 hover:bg-sidebar/80 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-lg">
                      ⚔️
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {quest.name}
                      </p>
                      <p className="text-muted text-xs truncate">
                        {quest.beat_type} · {quest.facet}
                      </p>
                    </div>
                    <StatusBadge status={quest.status || 'draft'} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm">No quests assigned</p>
            )}
          </Card>

          {/* Challenges */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">
                ⚡ Challenges ({sceneChallenges.length})
              </h3>
              <Link
                href={`/scenes/${id}/edit`}
                className="text-accent text-sm hover:underline"
              >
                Edit
              </Link>
            </div>
            {sceneChallenges.length > 0 ? (
              <div className="space-y-2">
                {sceneChallenges.map((challenge) => (
                  <Link
                    key={challenge.id}
                    href={`/challenges/${challenge.id}`}
                    className="flex items-center gap-4 bg-sidebar rounded-xl px-4 py-3 hover:bg-sidebar/80 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-lg">
                      ⚡
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {challenge.name}
                      </p>
                      <p className="text-muted text-xs truncate">
                        {challenge.description}
                      </p>
                    </div>
                    <StatusBadge status={challenge.status || 'draft'} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm">No challenges assigned</p>
            )}
          </Card>

          {/* Routes */}
          {(outgoingRoutes.length > 0 || incomingRoutes.length > 0) && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4">🔀 Routes</h3>
              {outgoingRoutes.length > 0 && (
                <div className="mb-4">
                  <p className="text-muted text-xs uppercase tracking-wider mb-2">
                    Outgoing
                  </p>
                  <div className="space-y-2">
                    {outgoingRoutes.map((route) => (
                      <Link
                        key={route.id}
                        href={`/routes/${route.id}`}
                        className="flex items-center gap-3 bg-sidebar rounded-xl px-4 py-3 hover:bg-sidebar/80 transition-colors"
                      >
                        <span className="text-lg">→</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {route.name}
                          </p>
                          <p className="text-muted text-xs truncate">
                            {route.trigger_type}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {incomingRoutes.length > 0 && (
                <div>
                  <p className="text-muted text-xs uppercase tracking-wider mb-2">
                    Incoming
                  </p>
                  <div className="space-y-2">
                    {incomingRoutes.map((route) => (
                      <Link
                        key={route.id}
                        href={`/routes/${route.id}`}
                        className="flex items-center gap-3 bg-sidebar rounded-xl px-4 py-3 hover:bg-sidebar/80 transition-colors"
                      >
                        <span className="text-lg">←</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {route.name}
                          </p>
                          <p className="text-muted text-xs truncate">
                            {route.trigger_type}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ─── Sidebar ─── */}
        <div className="space-y-4">
          {/* Scene Info */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Scene Info</h3>
            <div className="space-y-3">
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Status
                </p>
                <StatusBadge status={scene.is_active ? 'active' : 'draft'} />
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Type
                </p>
                <div className="flex items-center gap-2">
                  <SceneIcon type={scene.scene_type || 'Unknown'} size="sm" />
                  <span className="text-white text-sm">{scene.scene_type}</span>
                </div>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Lighting
                </p>
                <span className="text-white text-sm capitalize">
                  {lighting}
                </span>
              </div>
              <div>
                <p className="text-muted text-xs uppercase tracking-wider mb-1">
                  Weather
                </p>
                <span className="text-white text-sm capitalize">{weather}</span>
              </div>
            </div>
          </Card>

          {/* Content Summary */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4">Content</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted text-sm">🧑 NPCs</span>
                <span
                  className={`text-sm font-medium ${sceneNpcs.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {sceneNpcs.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">⚔️ Quests</span>
                <span
                  className={`text-sm font-medium ${sceneQuests.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {sceneQuests.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">⚡ Challenges</span>
                <span
                  className={`text-sm font-medium ${sceneChallenges.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {sceneChallenges.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">📦 Assets</span>
                <span
                  className={`text-sm font-medium ${sceneAssets.length > 0 ? 'text-accent' : 'text-white/40'}`}
                >
                  {sceneAssets.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">💬 Prompt</span>
                <span
                  className={`text-sm font-medium ${scene.system_prompt ? 'text-accent' : 'text-white/40'}`}
                >
                  {scene.system_prompt ? '✓' : '—'}
                </span>
              </div>
            </div>
          </Card>

          {/* Danger Zone */}
          <Card className="p-6 border border-red-500/20">
            <h3 className="text-red-400 font-bold mb-4">Danger Zone</h3>
            <button
              onClick={handleDelete}
              className="w-full btn bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl"
            >
              🗑️ Delete Scene
            </button>
          </Card>
        </div>
      </div>
    </>
  )
}
