'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useStudio } from '@/lib/studio-context'
import {
  useScenes,
  useNPCs,
  useChallenges,
  useQuests,
  useRoutes,
  updateGame,
} from '@/hooks/useApi'
import PageHeader from '@/components/PageHeader'

// ─── Config ──────────────────────────────────────────────

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const ASSETS_API =
  process.env.NEXT_PUBLIC_ASSETS_API_URL || 'http://localhost:4000/api/v1'
const FLUTTER_PREVIEW_URL =
  process.env.NEXT_PUBLIC_FLUTTER_PREVIEW_URL || '/flutter_web/index.html'

const GRID_W = 16
const GRID_H = 16
const TILE_W = 64 // canvas pixels per tile (half of game's 128 for fitting)
const TILE_H = 32 // canvas pixels per tile (half of game's 64)
const CANVAS_SCALE = 0.5 // sprites render at half game-size

// ─── Types ───────────────────────────────────────────────

interface Asset {
  id: string
  name: string
  display_name: string
  type: string
  file_url: string
  thumbnail_url: string | null
  tags: string[]
  meta_description: string
  metadata?: {
    pixel_width?: number
    pixel_height?: number
    hitbox?: { width: number; height: number }
    interaction?: { type: string }
    hearts_mapping?: { primary_facet: string; secondary_facet: string }
    spawn?: { layer?: string }
    sprite_sheet?: {
      frame_width: number
      frame_height: number
      columns: number
      rows: number
      anchor_x?: number
      anchor_y?: number
    }
    fps?: number
    [k: string]: unknown
  }
}

interface Placement {
  uid: string
  asset_name: string
  asset_id: string
  display_name: string
  file_url: string
  x: number
  y: number
  z_index: number
  layer: string
  scale: number
  offset_x: number
  offset_y: number
  rotation: number
  flip_h: boolean
  flip_v: boolean
  stack_order: number
  walkable: boolean
  is_ground_fill: boolean
  _meta?: {
    pixel_width?: number
    pixel_height?: number
    hitbox_w?: number
    hitbox_h?: number
    sprite_sheet?: {
      frame_width: number
      frame_height: number
      columns: number
      rows: number
      total_frames: number
      fps: number
      anchor_x?: number
      anchor_y?: number
    }
  }
  _raw_metadata?: Record<string, unknown> // Full Flutter metadata (states, direction_map, movement, etc.)
  _needs_url_resolve?: boolean // Flag for placements that need file_url resolved from asset catalog
}

// Rendered bounding box for pixel-accurate hit testing
interface SpriteBounds {
  uid: string
  left: number
  top: number
  right: number
  bottom: number
  centerX: number
  centerY: number
  drawW: number
  drawH: number
  rotation: number
}

type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'rotate' | null

interface SceneConfig {
  scene_name: string
  scene_type: string
  description: string
  dimensions: { width: number; height: number }
  tile_size: { width: number; height: number }
  spawn_x: number
  spawn_y: number
  lighting: string
  background_color: string | null
}

interface HistoryEntry {
  placements: Placement[]
  label: string
}

// ─── Chat Types ──────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  thinking?: boolean
}

// ─── API ─────────────────────────────────────────────────

function genMsgId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

async function converseScene(
  messages: { role: string; content: string }[],
  currentScene: Record<string, unknown>,
  gameContext?: Record<string, unknown> | null
): Promise<{
  message: string
  scene?: Record<string, unknown>
  phase?: string
  suggestions?: string[]
}> {
  const res = await fetch(`${BACKEND_URL}/api/scenes/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      current_scene: currentScene,
      game_context: gameContext || null,
    }),
  })
  if (!res.ok) throw new Error('Conversation failed')
  return res.json()
}

// ─── Isometric Math ──────────────────────────────────────

function gridToScreen(gx: number, gy: number): { sx: number; sy: number } {
  const originX = GRID_W * (TILE_W / 2)
  const sx = (gx - gy) * (TILE_W / 2) + originX
  const sy = (gx + gy) * (TILE_H / 2) + TILE_H * 2 // top padding
  return { sx, sy }
}

function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  const originX = GRID_W * (TILE_W / 2)
  const adjX = sx - originX
  const adjY = sy - TILE_H * 2
  const gx = Math.floor((adjX / (TILE_W / 2) + adjY / (TILE_H / 2)) / 2)
  const gy = Math.floor((adjY / (TILE_H / 2) - adjX / (TILE_W / 2)) / 2)
  return { gx, gy }
}

function calcZIndex(x: number, y: number, gridCols: number = GRID_W): number {
  return (y * gridCols + x) * 10
}

// Compute the z_index for a newly placed asset so it appears IN FRONT of
// all existing non-ground placements.  Falls back to grid-based z_index
// when the scene is empty.
function frontZIndex(
  placements: Placement[],
  gridX: number,
  gridY: number
): number {
  const gridZ = calcZIndex(gridX, gridY)
  const maxExisting = placements.reduce((max, p) => {
    if (p.is_ground_fill || p.layer === 'ground') return max
    return Math.max(max, p.z_index + p.stack_order)
  }, 0)
  return Math.max(gridZ, maxExisting + 10)
}

function uid(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ─── Image Cache ─────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>()

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url)
  if (cached?.complete) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageCache.set(url, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = url
  })
}

// ─── Main Page ───────────────────────────────────────────

export default function SceneBuilderPage() {
  const router = useRouter()
  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null
  const sceneIdParam = searchParams?.get('scene')
  const previewParam = searchParams?.get('preview')

  const { currentGame } = useStudio()
  const gameId = currentGame?.id

  // Fetch existing game content for AI context
  const { data: gameScenes } = useScenes(undefined, gameId)
  const { data: gameNpcsResponse } = useNPCs(gameId ? { game_id: gameId } : undefined)
  const { data: gameChallengesResponse } = useChallenges(
    gameId ? { game_id: gameId } : undefined
  )
  const { data: gameQuests } = useQuests(
    gameId ? { game_id: gameId } : undefined
  )
  const { data: gameRoutes } = useRoutes(
    gameId ? { game_id: gameId } : undefined
  )
  const gameNpcs = gameNpcsResponse?.data || []
  const gameChallenges = gameChallengesResponse?.data || []

  // Build game context for the AI — memoized to avoid re-renders
  const gameContext = useMemo(() => {
    if (!currentGame) return null
    return {
      game_name: currentGame.name,
      game_description: currentGame.description || '',
      scenes: (gameScenes || []).map((s: any) => ({
        id: s.id,
        scene_name: s.scene_name || s.name,
        scene_type: s.scene_type,
      })),
      npcs: (gameNpcs || []).map((n: any) => ({
        name: n.name,
        role: n.role,
        facet: n.facet,
        scene_id: n.scene_id,
        scene_name:
          (gameScenes || []).find((s: any) => s.id === n.scene_id)
            ?.scene_name || n.scene_id,
      })),
      challenges: (gameChallenges || []).map((c: any) => ({
        name: c.name,
        difficulty: c.difficulty,
        facets: c.facets,
      })),
      quests: (gameQuests || []).map((q: any) => ({
        name: q.name,
        sequence_order: q.sequence_order,
        beat_type: q.beat_type,
        facet: q.facet,
      })),
      routes: (gameRoutes || []).map((r: any) => ({
        name: r.name,
        from_scene: r.from_scene,
        to_scene: r.to_scene,
        trigger_type: r.trigger_type,
      })),
    }
  }, [
    currentGame,
    gameScenes,
    gameNpcs,
    gameChallenges,
    gameQuests,
    gameRoutes,
  ])

  // Scene config
  const [config, setConfig] = useState<SceneConfig>({
    scene_name: 'New Scene',
    scene_type: 'adventure',
    description: '',
    dimensions: { width: GRID_W, height: GRID_H },
    tile_size: { width: 128, height: 64 },
    spawn_x: 8,
    spawn_y: 14,
    lighting: 'day',
    background_color: '#1a1a2e',
  })

  // Placements
  const [placements, setPlacements] = useState<Placement[]>([])
  const [selected, setSelected] = useState<string | null>(null) // uid

  // NPCs / challenges loaded from the ?preview= param (Game Planner → Builder)
  // These are kept separately so they survive canvas edits without being wiped.
  const [previewNpcs, setPreviewNpcs] = useState<any[]>([])
  const [previewChallenges, setPreviewChallenges] = useState<any[]>([])

  // History (undo/redo)
  const [history, setHistory] = useState<HistoryEntry[]>([
    { placements: [], label: 'Initial' },
  ])
  const [historyIdx, setHistoryIdx] = useState(0)

  // Asset catalog
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetSearch, setAssetSearch] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>('all')
  const [loadingAssets, setLoadingAssets] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<'chat' | 'assets' | 'properties'>(
    'chat'
  )
  const [showGrid, setShowGrid] = useState(true)
  const [saving, setSaving] = useState(false)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: genMsgId(),
      role: 'assistant',
      content:
        'Hey! I\'m your scene builder assistant. Describe what you want to build, or switch to the Assets tab to place objects manually.\n\nTry: "Build a forest camp with trees and a campfire"',
      timestamp: new Date(),
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([
    'A mystical forest clearing',
    'Underwater cave for meditation',
    'Mountain temple with gardens',
  ])

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Hit bounds for pixel-accurate selection (rebuilt each render)
  const hitBoundsRef = useRef<SpriteBounds[]>([])

  // Animation state
  const animFrameRef = useRef<number>(0) // requestAnimationFrame id
  const spriteFramesRef = useRef<Map<string, number>>(new Map()) // uid → current frame
  const lastFrameTimeRef = useRef<Map<string, number>>(new Map())

  // Drag state
  const dragRef = useRef<{
    mode: 'move' | 'place' | 'scale' | 'rotate' | null
    uid: string | null
    asset: Asset | null
    startSx: number // pixel start position
    startSy: number
    startGx: number
    startGy: number
    offsetGx: number
    offsetGy: number
    handle: HandleType
    startScale: number
    startRotation: number
    startOffsetX: number
    startOffsetY: number
  }>({
    mode: null,
    uid: null,
    asset: null,
    startSx: 0,
    startSy: 0,
    startGx: 0,
    startGy: 0,
    offsetGx: 0,
    offsetGy: 0,
    handle: null,
    startScale: 1,
    startRotation: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  })

  const [dragGhost, setDragGhost] = useState<{ gx: number; gy: number } | null>(
    null
  )
  const [cursorStyle, setCursorStyle] = useState('crosshair')

  // Viewport zoom/pan
  const [viewport, setViewport] = useState({ zoom: 1, panX: 0, panY: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Live drag offset — used during drag to avoid setPlacements on every pixel
  const liveDragRef = useRef<{
    uid: string
    dx: number
    dy: number
    scale: number
    rotation: number
  } | null>(null)

  // ─── History Management ──────────────────────────────────

  const pushHistory = useCallback(
    (newPlacements: Placement[], label: string) => {
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIdx + 1)
        return [
          ...trimmed,
          { placements: JSON.parse(JSON.stringify(newPlacements)), label },
        ]
      })
      setHistoryIdx((prev) => prev + 1)
    },
    [historyIdx]
  )

  const undo = useCallback(() => {
    if (historyIdx <= 0) return
    const newIdx = historyIdx - 1
    setHistoryIdx(newIdx)
    setPlacements(JSON.parse(JSON.stringify(history[newIdx].placements)))
    setSelected(null)
  }, [historyIdx, history])

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return
    const newIdx = historyIdx + 1
    setHistoryIdx(newIdx)
    setPlacements(JSON.parse(JSON.stringify(history[newIdx].placements)))
    setSelected(null)
  }, [historyIdx, history])

  // ─── Load Assets ─────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingAssets(true)
      try {
        const res = await fetch(`${ASSETS_API}/assets?limit=100&is_active=true`)
        if (!res.ok) throw new Error('Failed to load assets')
        const data = await res.json()
        if (!cancelled) setAssets(data.items || data.data || data || [])
      } catch (e) {
        console.error('Asset load error:', e)
      } finally {
        if (!cancelled) setLoadingAssets(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Load Existing Scene (when scene param provided) ─────
  //
  // Fetch from the ASSETS service (kinship-assets, port 4000) — NOT the
  // knowledge backend.  The assets service is the canonical store for scene
  // records and is the only service that can resolve the GCS tile manifest
  // (tile_map_url) server-side via ?fullManifest=true.
  //
  // Response shape from GET /api/v1/scenes/{id}/manifest?fullManifest=true:
  //   { scene: SceneManifest, assets: AssetWithMetadata[], gcsManifest?: any }
  //
  // Priority for canvas placements:
  //   1. gcsManifest.asset_placements  (AI-generated scene with GCS tile map)
  //   2. assets[]                       (manually associated junction-table assets)

  useEffect(() => {
    if (!sceneIdParam) return
    let cancelled = false
    async function loadScene() {
      try {
        // Fetch manifest (includes scene record + junction assets + optional GCS manifest)
        const manifestRes = await fetch(
          `${ASSETS_API}/scenes/${sceneIdParam}/manifest?fullManifest=true`
        )
        if (!manifestRes.ok) {
          console.warn(
            `Scene manifest fetch returned ${manifestRes.status} for ${sceneIdParam}`
          )
          return
        }
        if (cancelled) return
        const manifestData = await manifestRes.json()

        // ── Apply scene config ──────────────────────────────────────────────
        const sceneRec = manifestData.scene
        if (sceneRec && !cancelled) {
          setConfig({
            scene_name: sceneRec.scene_name || sceneRec.name || 'Scene',
            scene_type: sceneRec.scene_type || 'adventure',
            description: sceneRec.description || '',
            dimensions: { width: GRID_W, height: GRID_H },
            tile_size: { width: 128, height: 64 },
            spawn_x:
              sceneRec.spawn_points?.[0]?.position?.x ??
              sceneRec.spawn_points?.[0]?.x ??
              8,
            spawn_y:
              sceneRec.spawn_points?.[0]?.position?.y ??
              sceneRec.spawn_points?.[0]?.y ??
              14,
            lighting: sceneRec.ambient?.lighting || 'day',
            background_color:
              sceneRec.ambient?.background_color ||
              sceneRec.background_color ||
              '#1a1a2e',
          })

          setChatMessages((prev) => [
            ...prev,
            {
              id: genMsgId(),
              role: 'system',
              content: `📂 Loaded scene: ${sceneRec.scene_name || sceneRec.name}`,
              timestamp: new Date(),
            },
          ])
        }

        if (cancelled) return

        // ── Priority 1: GCS manifest (AI-generated scenes with tile map) ───
        const gcs = manifestData.gcsManifest
        if (gcs?.asset_placements?.length) {
          const loaded: Placement[] = gcs.asset_placements.map((p: any) => ({
            uid: p.uid || uid(),
            asset_name: p.asset_name || p.name || p.display_name || '',
            asset_id: p.asset_id || p.id || '',
            display_name: p.display_name || p.asset_name || p.name || '',
            file_url: p.file_url || '',
            // Handle both flat (x, y) and nested (position.x, position.y) formats
            x: p.x ?? p.position?.x ?? p.position_x ?? 0,
            y: p.y ?? p.position?.y ?? p.position_y ?? 0,
            z_index: p.z_index ?? p.zIndex ?? p.z ?? 1,
            layer: p.layer || 'objects',
            scale: p.scale ?? 1.0,
            offset_x: p.offset_x ?? p.offsetX ?? 0,
            offset_y: p.offset_y ?? p.offsetY ?? 0,
            rotation: p.rotation ?? 0,
            flip_h: p.flip_h ?? p.flipH ?? false,
            flip_v: p.flip_v ?? p.flipV ?? false,
            stack_order: p.stack_order ?? p.stackOrder ?? 0,
            walkable: p.walkable ?? true,
            is_ground_fill: p.is_ground_fill ?? p.isGroundFill ?? false,
            _meta: p._meta || p.meta || undefined,
            _raw_metadata: p._raw_metadata || p.metadata || undefined,
            // Always try to resolve from asset catalog (GCS URLs may be stale)
            _needs_url_resolve: true,
          }))
          setPlacements(loaded)
          setHistory([{ placements: loaded, label: 'Loaded' }])
          setHistoryIdx(0)

          // Override config with values from GCS manifest if available
          const gcsScene = gcs.scene ?? gcs
          if (gcsScene?.scene_name) {
            setConfig((prev) => ({
              ...prev,
              scene_name: gcsScene.scene_name || prev.scene_name,
              spawn_x:
                gcsScene.spawn_points?.[0]?.x ??
                gcsScene.spawn_points?.[0]?.position?.x ??
                prev.spawn_x,
              spawn_y:
                gcsScene.spawn_points?.[0]?.y ??
                gcsScene.spawn_points?.[0]?.position?.y ??
                prev.spawn_y,
              lighting:
                gcsScene.ambient?.lighting ||
                gcsScene.lighting ||
                prev.lighting,
              background_color:
                gcsScene.background_color ||
                gcsScene.ambient?.background_color ||
                prev.background_color,
            }))
          }

          // Also forward GCS npcs/challenges to Flutter preview
          if (Array.isArray(gcs.npcs) && gcs.npcs.length > 0) {
            setPreviewNpcs(gcs.npcs)
          }
          if (Array.isArray(gcs.challenges) && gcs.challenges.length > 0) {
            setPreviewChallenges(gcs.challenges)
          }
          return
        }

        // ── Priority 2: Junction-table assets (manually built scenes) ──────
        const junctionAssets: any[] = manifestData.assets || []
        if (junctionAssets.length > 0) {
          const loaded: Placement[] = junctionAssets.map((a: any) => ({
            uid: uid(),
            asset_name: a.name || a.display_name || '',
            asset_id: a.id || a.asset_id || '',
            display_name: a.display_name || a.name || '',
            file_url: a.file_url || '',
            x: a.position?.x ?? a.position_x ?? 0,
            y: a.position?.y ?? a.position_y ?? 0,
            z_index: a.z_index ?? 1,
            layer: a.layer || 'objects',
            scale: a.scale ?? 1.0,
            offset_x: a.offset_x ?? 0,
            offset_y: a.offset_y ?? 0,
            rotation: a.rotation ?? 0,
            flip_h: a.flip_h ?? false,
            flip_v: a.flip_v ?? false,
            stack_order: a.stack_order ?? 0,
            walkable: a.walkable ?? true,
            is_ground_fill: a.is_ground_fill ?? false,
            // Always try to resolve from asset catalog (URLs may be stale)
            _needs_url_resolve: true,
          }))
          setPlacements(loaded)
          setHistory([{ placements: loaded, label: 'Loaded' }])
          setHistoryIdx(0)
        }
      } catch (e) {
        console.error('Failed to load scene:', e)
      }
    }
    loadScene()
    return () => {
      cancelled = true
    }
  }, [sceneIdParam])

  // ─── Load Preview Manifest (when preview param provided) ─
  //
  // buildSceneManifest (game-editor/page.tsx) produces a FLAT object:
  //   { id, scene_name, scene_type, spawn_points, ambient, actors, challenges, … }
  // There is NO nested .scene key in that format.
  //
  // We also support the legacy nested format { scene: { scene_name, … }, … }
  // so any existing bookmarks / direct links continue to work.

  useEffect(() => {
    if (!previewParam) return
    try {
      const manifest = JSON.parse(decodeURIComponent(previewParam))

      // Resolve scene data from flat OR nested format
      const sceneData: any = manifest.scene ?? manifest

      setConfig({
        scene_name: sceneData.scene_name || 'Preview',
        scene_type: sceneData.scene_type || 'adventure',
        description: sceneData.description || '',
        dimensions: { width: GRID_W, height: GRID_H },
        tile_size: { width: 128, height: 64 },
        // spawn_points may use { position: {x,y} } (legacy) or flat {x,y}
        spawn_x:
          sceneData.spawn_points?.[0]?.position?.x ??
          sceneData.spawn_points?.[0]?.x ??
          8,
        spawn_y:
          sceneData.spawn_points?.[0]?.position?.y ??
          sceneData.spawn_points?.[0]?.y ??
          14,
        // lighting lives inside ambient in the flat format
        lighting: sceneData.ambient?.lighting || sceneData.lighting || 'day',
        background_color: sceneData.background_color || '#1a1a2e',
      })

      if (manifest.asset_placements?.length) {
        const loaded: Placement[] = manifest.asset_placements.map((p: any) => ({
          uid: p.uid || uid(),
          asset_name: p.asset_name || p.name || p.display_name || '',
          asset_id: p.asset_id || p.id || '',
          display_name: p.display_name || p.asset_name || p.name || '',
          file_url: p.file_url || '',
          x: p.x ?? p.position?.x ?? p.position_x ?? 0,
          y: p.y ?? p.position?.y ?? p.position_y ?? 0,
          z_index: p.z_index ?? p.zIndex ?? p.z ?? 1,
          layer: p.layer || 'objects',
          scale: p.scale ?? 1.0,
          offset_x: p.offset_x ?? p.offsetX ?? 0,
          offset_y: p.offset_y ?? p.offsetY ?? 0,
          rotation: p.rotation ?? 0,
          flip_h: p.flip_h ?? p.flipH ?? false,
          flip_v: p.flip_v ?? p.flipV ?? false,
          stack_order: p.stack_order ?? p.stackOrder ?? 0,
          walkable: p.walkable ?? true,
          is_ground_fill: p.is_ground_fill ?? p.isGroundFill ?? false,
          _meta: p._meta || p.meta || undefined,
          _raw_metadata: p._raw_metadata || p.metadata || undefined,
          // Always try to resolve from asset catalog (URLs may be stale)
          _needs_url_resolve: true,
        }))
        setPlacements(loaded)
        setHistory([{ placements: loaded, label: 'Preview' }])
        setHistoryIdx(0)
      }

      // Capture actors → sent to Flutter as npcs
      const actors = manifest.actors ?? sceneData.actors
      if (Array.isArray(actors) && actors.length > 0) {
        setPreviewNpcs(actors)
      }

      // Capture challenges
      const challenges = manifest.challenges ?? sceneData.challenges
      if (Array.isArray(challenges) && challenges.length > 0) {
        setPreviewChallenges(challenges)
      }
    } catch (e) {
      console.error('Failed to parse preview:', e)
    }
  }, [previewParam])

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const matchSearch =
        !assetSearch ||
        a.display_name?.toLowerCase().includes(assetSearch.toLowerCase()) ||
        a.name?.toLowerCase().includes(assetSearch.toLowerCase()) ||
        a.tags?.some((t) => t.toLowerCase().includes(assetSearch.toLowerCase()))
      const matchType = assetTypeFilter === 'all' || a.type === assetTypeFilter
      return matchSearch && matchType
    })
  }, [assets, assetSearch, assetTypeFilter])

  const assetTypes = useMemo(() => {
    const types = new Set(assets.map((a) => a.type))
    return ['all', ...Array.from(types).sort()]
  }, [assets])

  useEffect(() => {
    if (assets.length === 0 || placements.length === 0) return

    // Check if any placements need URL resolution (have the flag set)
    const needsResolution = placements.some((p) => p._needs_url_resolve)
    if (!needsResolution) return

    // Build lookup map: asset_name and asset_id → file_url
    const urlByName = new Map<string, string>()
    const urlById = new Map<string, string>()
    const metaByName = new Map<string, Asset['metadata']>()
    
    for (const a of assets) {
      if (a.file_url) {
        if (a.name) urlByName.set(a.name.toLowerCase(), a.file_url)
        if (a.display_name) urlByName.set(a.display_name.toLowerCase(), a.file_url)
        if (a.id) urlById.set(a.id, a.file_url)
        if (a.name) metaByName.set(a.name.toLowerCase(), a.metadata)
        if (a.display_name) metaByName.set(a.display_name.toLowerCase(), a.metadata)
      }
    }

    // Resolve URLs for placements
    const resolved = placements.map((p) => {
      // Skip if doesn't need resolution
      if (!p._needs_url_resolve) return p

      // Try to find URL by asset_name or asset_id
      const nameKey = (p.asset_name || p.display_name || '').toLowerCase()
      const resolvedUrl =
        urlById.get(p.asset_id) ||
        urlByName.get(nameKey) ||
        p.file_url ||
        ''

      // Also resolve metadata for sprite sheet info
      const resolvedMeta = metaByName.get(nameKey)
      const spriteSheet = resolvedMeta?.sprite_sheet

      // Create updated placement without _needs_url_resolve flag
      const updated: Placement = { 
        ...p, 
        file_url: resolvedUrl,
        _needs_url_resolve: false, // Clear the flag
      }

      // Add sprite sheet metadata if available
      if (spriteSheet && !p._meta?.sprite_sheet) {
        updated._meta = {
          ...p._meta,
          pixel_width: resolvedMeta?.pixel_width,
          pixel_height: resolvedMeta?.pixel_height,
          sprite_sheet: {
            frame_width: spriteSheet.frame_width,
            frame_height: spriteSheet.frame_height,
            columns: spriteSheet.columns,
            rows: spriteSheet.rows,
            total_frames: spriteSheet.columns * spriteSheet.rows,
            fps: resolvedMeta?.fps || 8,
            anchor_x: spriteSheet.anchor_x,
            anchor_y: spriteSheet.anchor_y,
          },
        }
      }

      return updated
    })

    setPlacements(resolved)
  }, [assets, placements])

  // ─── Canvas Rendering ────────────────────────────────────

  const canvasWidth = GRID_W * TILE_W + TILE_W
  const canvasHeight = GRID_H * TILE_H + TILE_H * 4
  const HANDLE_SIZE = 7
  const ROTATE_HANDLE_DIST = 20

  // ─── Sprite Sheet: get source rect for current frame ─────

  const getSpriteSourceRect = useCallback(
    (p: Placement, img: HTMLImageElement) => {
      const ss = p._meta?.sprite_sheet
      if (!ss || !ss.frame_width || !ss.columns) {
        return { srcX: 0, srcY: 0, srcW: img.width, srcH: img.height }
      }
      const frame = spriteFramesRef.current.get(p.uid) || 0
      const col = frame % ss.columns
      const row = Math.floor(frame / ss.columns)
      return {
        srcX: col * ss.frame_width,
        srcY: row * ss.frame_height,
        srcW: ss.frame_width,
        srcH: ss.frame_height,
      }
    },
    []
  )

  // ─── Canvas Rendering ────────────────────────────────────

  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Background (full canvas, no transform)
    ctx.fillStyle = config.background_color || '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply viewport zoom/pan
    ctx.save()
    ctx.translate(viewport.panX, viewport.panY)
    ctx.scale(viewport.zoom, viewport.zoom)

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      for (let gx = 0; gx < GRID_W; gx++) {
        for (let gy = 0; gy < GRID_H; gy++) {
          const { sx, sy } = gridToScreen(gx, gy)
          ctx.beginPath()
          ctx.moveTo(sx, sy - TILE_H / 2)
          ctx.lineTo(sx + TILE_W / 2, sy)
          ctx.lineTo(sx, sy + TILE_H / 2)
          ctx.lineTo(sx - TILE_W / 2, sy)
          ctx.closePath()
          ctx.stroke()
        }
      }
    }

    // Sort placements for rendering
    // Layer priority boosts — must match Flutter IsoObject priority logic.
    // ground_fill is always drawn first (handled separately).
    // 'overhead' gets a large boost so it always renders above everything.
    const LAYER_BOOST: Record<string, number> = {
      ground: 0,
      ground_decor: 0,
      objects: 0,
      overhead: 100000,
    }
    const sorted = [...placements].sort((a, b) => {
      if (a.is_ground_fill && !b.is_ground_fill) return -1
      if (!a.is_ground_fill && b.is_ground_fill) return 1
      const aPri = a.z_index + a.stack_order + (LAYER_BOOST[a.layer] ?? 0)
      const bPri = b.z_index + b.stack_order + (LAYER_BOOST[b.layer] ?? 0)
      return aPri - bPri
    })

    const newBounds: SpriteBounds[] = []

    // Draw ground fill
    for (const p of sorted) {
      if (!p.is_ground_fill) continue
      try {
        const img = await loadImage(p.file_url)
        const src = getSpriteSourceRect(p, img)
        for (let gx = 0; gx < GRID_W; gx++) {
          for (let gy = 0; gy < GRID_H; gy++) {
            const { sx, sy } = gridToScreen(gx, gy)
            const drawW = TILE_W
            const drawH = TILE_W * (src.srcH / src.srcW)
            ctx.drawImage(
              img,
              src.srcX,
              src.srcY,
              src.srcW,
              src.srcH,
              sx - drawW / 2,
              sy - drawH + TILE_H / 2,
              drawW,
              drawH
            )
          }
        }
      } catch {}
    }

    // Draw objects
    for (const p of sorted) {
      if (p.is_ground_fill) continue
      try {
        const img = await loadImage(p.file_url)
        const src = getSpriteSourceRect(p, img)
        const { sx, sy } = gridToScreen(p.x, p.y)

        // Apply live drag offset if this is the dragged sprite
        const live = liveDragRef.current
        const isLiveDrag = live && live.uid === p.uid
        const liveScale = isLiveDrag ? live.scale : p.scale || 1
        const liveRotation = isLiveDrag ? live.rotation : p.rotation || 0
        const liveOffX = isLiveDrag ? live.dx : p.offset_x || 0
        const liveOffY = isLiveDrag ? live.dy : p.offset_y || 0

        // Match Flutter IsoObject scale formula:
        //   _scaleX = min(tileWidth / imgWidth, 1.5) * placement.scale
        // Flutter tileWidth=128, canvas TILE_W=64 (half), so we divide by 2.
        const flutterScaleX = Math.min(128 / src.srcW, 1.5) * liveScale
        const canvasScale = flutterScaleX * CANVAS_SCALE
        const drawW = src.srcW * canvasScale
        const drawH = src.srcH * canvasScale
        const ox = liveOffX * CANVAS_SCALE
        const oy = liveOffY * CANVAS_SCALE

        // Match Flutter IsoObject Y anchor:
        //   position.y = screenCenter.y - scaledH + tileHeight/4 + offsetY
        // So sprite bottom lands at screenCenter.y + tileHeight/4
        // In canvas coords: sy + TILE_H/4
        // We translate to (cx, cy) then draw image at (-drawW/2, -drawH),
        // so cy must equal sy + TILE_H/4 for the bottom to land correctly.
        const cx = sx + ox
        const cy = sy + TILE_H / 4 + oy

        ctx.save()
        // Translate to the sprite's bottom-center anchor point
        ctx.translate(cx, cy)
        // Flutter IsoObject rotates/flips around the sprite's CENTER (size.x/2, size.y/2).
        // The sprite is drawn at (-drawW/2, -drawH) relative to (cx,cy), so
        // the center of the sprite in our local coords is (0, -drawH/2).
        // We shift to sprite center, apply transforms, then shift back.
        if (liveRotation || p.flip_h || p.flip_v) {
          ctx.translate(0, -drawH / 2)
          if (liveRotation) ctx.rotate((liveRotation * Math.PI) / 180)
          if (p.flip_h) ctx.scale(-1, 1)
          if (p.flip_v) ctx.scale(1, -1)
          ctx.translate(0, drawH / 2)
        }
        ctx.drawImage(
          img,
          src.srcX,
          src.srcY,
          src.srcW,
          src.srcH,
          -drawW / 2,
          -drawH,
          drawW,
          drawH
        )

        // ── Selection box + handles (inside rotation transform) ──
        if (p.uid === selected) {
          // Undo flips so selection handles render unmirrored
          if (p.flip_h) ctx.scale(-1, 1)
          if (p.flip_v) ctx.scale(1, -1)

          const selLeft = -drawW / 2 - 1
          const selTop = -drawH - 1
          const selW = drawW + 2
          const selH = drawH + 2

          ctx.strokeStyle = '#4ade80'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.strokeRect(selLeft, selTop, selW, selH)
          ctx.setLineDash([])

          // Corner handles (scale)
          const corners: { hx: number; hy: number; type: HandleType }[] = [
            { hx: selLeft, hy: selTop, type: 'tl' },
            { hx: selLeft + selW, hy: selTop, type: 'tr' },
            { hx: selLeft, hy: selTop + selH, type: 'bl' },
            { hx: selLeft + selW, hy: selTop + selH, type: 'br' },
          ]
          for (const h of corners) {
            ctx.fillStyle = '#4ade80'
            ctx.fillRect(
              h.hx - HANDLE_SIZE / 2,
              h.hy - HANDLE_SIZE / 2,
              HANDLE_SIZE,
              HANDLE_SIZE
            )
            ctx.strokeStyle = '#166534'
            ctx.lineWidth = 1
            ctx.strokeRect(
              h.hx - HANDLE_SIZE / 2,
              h.hy - HANDLE_SIZE / 2,
              HANDLE_SIZE,
              HANDLE_SIZE
            )
          }

          // Rotation handle (circle above top-center)
          const rotHandleX = 0
          const rotHandleY = selTop - ROTATE_HANDLE_DIST
          ctx.beginPath()
          ctx.arc(rotHandleX, rotHandleY, 5, 0, Math.PI * 2)
          ctx.fillStyle = '#60a5fa'
          ctx.fill()
          ctx.strokeStyle = '#1e40af'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(rotHandleX, selTop)
          ctx.lineTo(rotHandleX, rotHandleY + 5)
          ctx.strokeStyle = 'rgba(96,165,250,0.5)'
          ctx.lineWidth = 1
          ctx.stroke()
        }

        ctx.restore()

        // Store bounds for hit testing (with rotation for inverse transform)
        const left = cx - drawW / 2
        const top = cy - drawH
        newBounds.push({
          uid: p.uid,
          left,
          top,
          right: left + drawW,
          bottom: top + drawH,
          centerX: cx,
          centerY: cy - drawH / 2,
          drawW,
          drawH,
          rotation: liveRotation,
        })
      } catch (err) {
        console.warn(`[Builder] Failed to render placement ${p.uid} (${p.asset_name}):`, err)
      }
    }

    // Update hit bounds ref (reversed for top-first hit testing)
    hitBoundsRef.current = newBounds.reverse()
    
    // Debug: log hit bounds count
    if (newBounds.length > 0) {
      console.log(`[Builder] Updated hitBounds: ${newBounds.length} objects`)
    }

    // Drag ghost
    if (dragGhost) {
      const { sx, sy } = gridToScreen(dragGhost.gx, dragGhost.gy)
      ctx.fillStyle = 'rgba(74, 222, 128, 0.2)'
      ctx.beginPath()
      ctx.moveTo(sx, sy - TILE_H / 2)
      ctx.lineTo(sx + TILE_W / 2, sy)
      ctx.lineTo(sx, sy + TILE_H / 2)
      ctx.lineTo(sx - TILE_W / 2, sy)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Spawn point marker
    const spawn = gridToScreen(config.spawn_x, config.spawn_y)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.5)'
    ctx.beginPath()
    ctx.arc(spawn.sx, spawn.sy, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.stroke()

    // End viewport transform
    ctx.restore()
  }, [
    placements,
    selected,
    showGrid,
    config,
    dragGhost,
    getSpriteSourceRect,
    viewport,
  ])

  // ─── Sprite Sheet Animation ─────────────────────────────

  useEffect(() => {
    let running = true
    const tick = () => {
      if (!running) return
      const now = performance.now()
      let needsRedraw = false

      for (const p of placements) {
        const ss = p._meta?.sprite_sheet
        if (ss && ss.total_frames > 1) {
          const fps = ss.fps || 8
          const interval = 1000 / fps
          const lastTime = lastFrameTimeRef.current.get(p.uid) || 0
          if (now - lastTime >= interval) {
            const currentFrame = spriteFramesRef.current.get(p.uid) || 0
            spriteFramesRef.current.set(
              p.uid,
              (currentFrame + 1) % ss.total_frames
            )
            lastFrameTimeRef.current.set(p.uid, now)
            needsRedraw = true
          }
        }
      }

      if (needsRedraw) renderCanvas()
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [placements, renderCanvas])

  useEffect(() => {
    renderCanvas()
  }, [renderCanvas])

  // ─── Pixel-Accurate Hit Testing ──────────────────────────

  const getCanvasPixel = useCallback(
    (e: React.MouseEvent): { sx: number; sy: number } => {
      const canvas = canvasRef.current
      if (!canvas) return { sx: 0, sy: 0 }
      const rect = canvas.getBoundingClientRect()
      // Convert screen → canvas pixel, accounting for zoom/pan
      const rawX = (e.clientX - rect.left) * (canvas.width / rect.width)
      const rawY = (e.clientY - rect.top) * (canvas.height / rect.height)
      return {
        sx: (rawX - viewport.panX) / viewport.zoom,
        sy: (rawY - viewport.panY) / viewport.zoom,
      }
    },
    [viewport]
  )

  // Inverse-rotate a point around a center
  const inverseRotatePoint = useCallback(
    (px: number, py: number, cx: number, cy: number, degrees: number) => {
      if (!degrees) return { rx: px, ry: py }
      const rad = -(degrees * Math.PI) / 180
      const dx = px - cx
      const dy = py - cy
      return {
        rx: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
        ry: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
      }
    },
    []
  )

  const findPlacementAtPixel = useCallback(
    (sx: number, sy: number): Placement | null => {
      for (const b of hitBoundsRef.current) {
        // Inverse-rotate mouse position relative to sprite center
        const { rx, ry } = inverseRotatePoint(
          sx,
          sy,
          b.centerX,
          b.centerY,
          b.rotation
        )
        if (rx >= b.left && rx <= b.right && ry >= b.top && ry <= b.bottom) {
          return placements.find((p) => p.uid === b.uid) || null
        }
      }
      return null
    },
    [placements, inverseRotatePoint]
  )

  const findHandleAtPixel = useCallback(
    (sx: number, sy: number): HandleType => {
      if (!selected) return null
      const bounds = hitBoundsRef.current.find((b) => b.uid === selected)
      if (!bounds) return null

      // Inverse-rotate mouse into sprite-local space
      const { rx, ry } = inverseRotatePoint(
        sx,
        sy,
        bounds.centerX,
        bounds.centerY,
        bounds.rotation
      )

      const { left, top, right, bottom, drawW } = bounds
      const hs = HANDLE_SIZE + 3

      // Corner handles
      if (Math.abs(rx - left) < hs && Math.abs(ry - top) < hs) return 'tl'
      if (Math.abs(rx - right) < hs && Math.abs(ry - top) < hs) return 'tr'
      if (Math.abs(rx - left) < hs && Math.abs(ry - bottom) < hs) return 'bl'
      if (Math.abs(rx - right) < hs && Math.abs(ry - bottom) < hs) return 'br'

      // Rotation handle (above top-center, in local space)
      const rotX = left + drawW / 2
      const rotY = top - ROTATE_HANDLE_DIST
      if (Math.hypot(rx - rotX, ry - rotY) < 10) return 'rotate'

      return null
    },
    [selected, inverseRotatePoint]
  )

  // ─── Canvas Mouse Events ─────────────────────────────────

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click OR Shift+left-click = pan (horizontal only for Shift+drag)
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault()
        isPanningRef.current = true
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: viewport.panX,
          panY: viewport.panY,
        }
        setCursorStyle('grabbing')
        return
      }

      const { sx, sy } = getCanvasPixel(e)

      // Check handles first (if something is selected)
      const handle = findHandleAtPixel(sx, sy)
      if (handle && selected) {
        const p = placements.find((pl) => pl.uid === selected)
        if (!p) return
        if (handle === 'rotate') {
          dragRef.current = {
            mode: 'rotate',
            uid: selected,
            asset: null,
            startSx: sx,
            startSy: sy,
            startGx: 0,
            startGy: 0,
            offsetGx: 0,
            offsetGy: 0,
            handle,
            startScale: p.scale,
            startRotation: p.rotation,
            startOffsetX: p.offset_x,
            startOffsetY: p.offset_y,
          }
        } else {
          dragRef.current = {
            mode: 'scale',
            uid: selected,
            asset: null,
            startSx: sx,
            startSy: sy,
            startGx: 0,
            startGy: 0,
            offsetGx: 0,
            offsetGy: 0,
            handle,
            startScale: p.scale,
            startRotation: p.rotation,
            startOffsetX: p.offset_x,
            startOffsetY: p.offset_y,
          }
        }
        return
      }

      // Check sprite hit
      const hit = findPlacementAtPixel(sx, sy)
      if (hit) {
        setSelected(hit.uid)
        dragRef.current = {
          mode: 'move',
          uid: hit.uid,
          asset: null,
          startSx: sx,
          startSy: sy,
          startGx: hit.x,
          startGy: hit.y,
          offsetGx: 0,
          offsetGy: 0,
          handle: null,
          startScale: hit.scale,
          startRotation: hit.rotation,
          startOffsetX: hit.offset_x,
          startOffsetY: hit.offset_y,
        }
      } else {
        setSelected(null)
      }
    },
    [
      getCanvasPixel,
      findHandleAtPixel,
      findPlacementAtPixel,
      selected,
      placements,
      viewport,
    ]
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Pan handling
      if (isPanningRef.current) {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        const newPanX =
          panStartRef.current.panX +
          (e.clientX - panStartRef.current.x) * scaleX
        const newPanY =
          panStartRef.current.panY +
          (e.clientY - panStartRef.current.y) * scaleY
        setViewport((v) => ({
          ...v,
          panX: newPanX,
          panY: newPanY,
        }))
        return
      }

      // Bounds drag preview
      const { sx, sy } = getCanvasPixel(e)
      const drag = dragRef.current

      if (!drag.mode) {
        // Hover cursor — show grab hand when Shift held (pan-ready)
        if (e.shiftKey) {
          setCursorStyle('grab')
          return
        }
        const handle = findHandleAtPixel(sx, sy)
        if (handle === 'rotate') setCursorStyle('grab')
        else if (handle === 'tl' || handle === 'br')
          setCursorStyle('nwse-resize')
        else if (handle === 'tr' || handle === 'bl')
          setCursorStyle('nesw-resize')
        else if (findPlacementAtPixel(sx, sy)) setCursorStyle('move')
        else setCursorStyle('crosshair')
        return
      }

      if (drag.mode === 'move' && drag.uid) {
        // Direct state update for reliable visual feedback
        const dx = (sx - drag.startSx) / CANVAS_SCALE
        const dy = (sy - drag.startSy) / CANVAS_SCALE
        const newOffX = Math.round(drag.startOffsetX + dx)
        const newOffY = Math.round(drag.startOffsetY + dy)
        setPlacements((prev) =>
          prev.map((p) =>
            p.uid === drag.uid
              ? { ...p, offset_x: newOffX, offset_y: newOffY }
              : p
          )
        )
      }

      if (drag.mode === 'scale' && drag.uid) {
        const bounds = hitBoundsRef.current.find((b) => b.uid === drag.uid)
        if (!bounds) return
        const distStart = Math.hypot(
          drag.startSx - bounds.centerX,
          drag.startSy - bounds.centerY
        )
        const distNow = Math.hypot(sx - bounds.centerX, sy - bounds.centerY)
        const factor = distStart > 0 ? distNow / distStart : 1
        const newScale = Math.max(
          0.1,
          Math.min(4.0, +(drag.startScale * factor).toFixed(2))
        )
        liveDragRef.current = {
          uid: drag.uid,
          dx: drag.startOffsetX,
          dy: drag.startOffsetY,
          scale: newScale,
          rotation: drag.startRotation,
        }
        renderCanvas()
      }

      if (drag.mode === 'rotate' && drag.uid) {
        const bounds = hitBoundsRef.current.find((b) => b.uid === drag.uid)
        if (!bounds) return
        const angleStart = Math.atan2(
          drag.startSy - bounds.centerY,
          drag.startSx - bounds.centerX
        )
        const angleNow = Math.atan2(sy - bounds.centerY, sx - bounds.centerX)
        let degrees =
          drag.startRotation + ((angleNow - angleStart) * 180) / Math.PI
        degrees = Math.round(degrees / 15) * 15
        degrees = ((degrees % 360) + 360) % 360
        liveDragRef.current = {
          uid: drag.uid,
          dx: drag.startOffsetX,
          dy: drag.startOffsetY,
          scale: drag.startScale,
          rotation: degrees,
        }
        renderCanvas()
      }

      if (drag.mode === 'place') {
        const { gx, gy } = screenToGrid(sx, sy)
        if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
          setDragGhost({ gx, gy })
        }
      }
    },
    [
      getCanvasPixel,
      findHandleAtPixel,
      findPlacementAtPixel,
      placements,
      renderCanvas,
    ]
  )

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // Stop panning
      if (isPanningRef.current) {
        isPanningRef.current = false
        setCursorStyle('crosshair')
        return
      }

      // Bounds drag complete
      const { sx, sy } = getCanvasPixel(e)
      const drag = dragRef.current

      if (drag.mode === 'move' && drag.uid) {
        // State already updated during drag — just record history
        pushHistory(placements, 'Move')
      }

      if ((drag.mode === 'scale' || drag.mode === 'rotate') && drag.uid) {
        const live = liveDragRef.current
        if (live && live.uid === drag.uid) {
          const updated = placements.map((p) =>
            p.uid === drag.uid
              ? {
                  ...p,
                  scale: live.scale,
                  rotation: live.rotation,
                  offset_x: live.dx,
                  offset_y: live.dy,
                }
              : p
          )
          setPlacements(updated)
          pushHistory(updated, drag.mode === 'scale' ? 'Scale' : 'Rotate')
        }
      }

      if (drag.mode === 'place' && drag.asset) {
        const { gx, gy } = screenToGrid(sx, sy)
        const clampX = Math.max(0, Math.min(GRID_W - 1, gx))
        const clampY = Math.max(0, Math.min(GRID_H - 1, gy))
        const asset = drag.asset
        const isGround = asset.type === 'tile'
        const ss = asset.metadata?.sprite_sheet
        const newPlacement: Placement = {
          uid: uid(),
          asset_name: asset.name,
          asset_id: asset.id,
          display_name: asset.display_name || asset.name,
          file_url: asset.file_url,
          x: clampX,
          y: clampY,
          z_index: isGround ? 0 : frontZIndex(placements, clampX, clampY),
          layer: isGround
            ? 'ground'
            : (asset.metadata?.spawn?.layer as string) || 'objects',
          scale: 1.0,
          offset_x: 0,
          offset_y: 0,
          rotation: 0,
          flip_h: false,
          flip_v: false,
          stack_order: 0,
          walkable: isGround,
          is_ground_fill: false,
          _meta: {
            pixel_width: ss ? ss.frame_width : asset.metadata?.pixel_width,
            pixel_height: ss ? ss.frame_height : asset.metadata?.pixel_height,
            hitbox_w: asset.metadata?.hitbox?.width,
            hitbox_h: asset.metadata?.hitbox?.height,
            sprite_sheet: ss
              ? {
                  frame_width: ss.frame_width,
                  frame_height: ss.frame_height,
                  columns: ss.columns,
                  rows: ss.rows,
                  total_frames: ss.columns * ss.rows,
                  fps: asset.metadata?.fps || 8,
                }
              : undefined,
          },
          _raw_metadata: asset.metadata as Record<string, unknown> | undefined,
        }
        const updated = [...placements, newPlacement]
        setPlacements(updated)
        setSelected(newPlacement.uid)
        pushHistory(updated, `Place ${asset.display_name}`)
      }

      liveDragRef.current = null
      dragRef.current = {
        mode: null,
        uid: null,
        asset: null,
        startSx: 0,
        startSy: 0,
        startGx: 0,
        startGy: 0,
        offsetGx: 0,
        offsetGy: 0,
        handle: null,
        startScale: 1,
        startRotation: 0,
        startOffsetX: 0,
        startOffsetY: 0,
      }
      setDragGhost(null)
    },
    [getCanvasPixel, placements, pushHistory]
  )

  // ─── Asset Catalog Drag Start ────────────────────────────

  const startPlaceAsset = useCallback((asset: Asset) => {
    dragRef.current = {
      mode: 'place',
      uid: null,
      asset,
      startSx: 0,
      startSy: 0,
      startGx: 0,
      startGy: 0,
      offsetGx: 0,
      offsetGy: 0,
      handle: null,
      startScale: 1,
      startRotation: 0,
      startOffsetX: 0,
      startOffsetY: 0,
    }
  }, [])

  // Quick place: click asset thumbnail → drop at center
  const quickPlaceAsset = useCallback(
    (asset: Asset) => {
      const isGround = asset.type === 'tile'
      const ss = asset.metadata?.sprite_sheet
      const newPlacement: Placement = {
        uid: uid(),
        asset_name: asset.name,
        asset_id: asset.id,
        display_name: asset.display_name || asset.name,
        file_url: asset.file_url,
        x: 8,
        y: 8,
        z_index: isGround ? 0 : frontZIndex(placements, 8, 8),
        layer: isGround
          ? 'ground'
          : (asset.metadata?.spawn?.layer as string) || 'objects',
        scale: 1.0,
        offset_x: 0,
        offset_y: 0,
        rotation: 0,
        flip_h: false,
        flip_v: false,
        stack_order: 0,
        walkable: isGround,
        is_ground_fill: false,
        _meta: {
          pixel_width: ss ? ss.frame_width : asset.metadata?.pixel_width,
          pixel_height: ss ? ss.frame_height : asset.metadata?.pixel_height,
          hitbox_w: asset.metadata?.hitbox?.width,
          hitbox_h: asset.metadata?.hitbox?.height,
          sprite_sheet: ss
            ? {
                frame_width: ss.frame_width,
                frame_height: ss.frame_height,
                columns: ss.columns,
                rows: ss.rows,
                total_frames: ss.columns * ss.rows,
                fps: asset.metadata?.fps || 8,
              }
            : undefined,
        },
        _raw_metadata: asset.metadata as Record<string, unknown> | undefined,
      }
      const updated = [...placements, newPlacement]
      setPlacements(updated)
      setSelected(newPlacement.uid)
      pushHistory(updated, `Place ${asset.display_name}`)
      setActiveTab('properties')
    },
    [placements, pushHistory]
  )

  const setAsGroundFill = useCallback(
    (asset: Asset) => {
      // Remove any existing ground fill
      const without = placements.filter((p) => !p.is_ground_fill)
      const gf: Placement = {
        uid: uid(),
        asset_name: asset.name,
        asset_id: asset.id,
        display_name: asset.display_name || asset.name,
        file_url: asset.file_url,
        x: 0,
        y: 0,
        z_index: 0,
        layer: 'ground',
        scale: 1.0,
        offset_x: 0,
        offset_y: 0,
        rotation: 0,
        flip_h: false,
        flip_v: false,
        stack_order: 0,
        walkable: true,
        is_ground_fill: true,
      }
      const updated = [gf, ...without]
      setPlacements(updated)
      pushHistory(updated, `Ground: ${asset.display_name}`)
    },
    [placements, pushHistory]
  )

  // ─── Placement Modification ──────────────────────────────

  const selectedPlacement = placements.find((p) => p.uid === selected) || null

  const updateSelected = useCallback(
    (patch: Partial<Placement>, label?: string) => {
      if (!selected) return
      const updated = placements.map((p) =>
        p.uid === selected ? { ...p, ...patch } : p
      )
      setPlacements(updated)
      if (label) pushHistory(updated, label)
    },
    [selected, placements, pushHistory]
  )

  const deleteSelected = useCallback(() => {
    if (!selected) return
    const updated = placements.filter((p) => p.uid !== selected)
    setPlacements(updated)
    setSelected(null)
    pushHistory(updated, 'Delete')
  }, [selected, placements, pushHistory])

  const duplicateSelected = useCallback(() => {
    if (!selectedPlacement) return
    const dup: Placement = {
      ...JSON.parse(JSON.stringify(selectedPlacement)),
      uid: uid(),
      x: Math.min(GRID_W - 1, selectedPlacement.x + 1),
      y: selectedPlacement.y,
    }
    dup.z_index = calcZIndex(dup.x, dup.y)
    const updated = [...placements, dup]
    setPlacements(updated)
    setSelected(dup.uid)
    pushHistory(updated, `Duplicate ${dup.display_name}`)
  }, [selectedPlacement, placements, pushHistory])

  const clearAll = useCallback(() => {
    setPlacements([])
    setSelected(null)
    pushHistory([], 'Clear all')
  }, [pushHistory])

  const clearGroundFill = useCallback(() => {
    const updated = placements.filter((p) => !p.is_ground_fill)
    setPlacements(updated)
    pushHistory(updated, 'Clear ground fill')
  }, [placements, pushHistory])

  const hasGroundFill = placements.some((p) => p.is_ground_fill)

  // ─── Chat Auto-scroll ─────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ─── Convert AI scene response to Placement[] ────────────

  const aiSceneToPlacementsFn = useCallback(
    (sceneData: Record<string, unknown>) => {
      const ap = (sceneData.asset_placements || []) as Record<string, unknown>[]

      // Build a lookup from asset_name → correct file_url from the loaded
      // asset catalog.  The AI sometimes returns wrong file_url / asset_id
      // values (e.g. copying them from another asset).  The catalog is the
      // authoritative source of truth for the mapping.
      const catalogByName = new Map<string, Asset>()
      for (const a of assets) {
        catalogByName.set(a.name, a)
      }

      // Build lookups of EXISTING placements for stable merging
      const existingByUid = new Map<string, Placement>()
      // Use a list per asset_name so multiple instances can each match a unique existing placement
      const existingByAssetName = new Map<string, Placement[]>()
      for (const p of placements) {
        existingByUid.set(p.uid, p)
        const bucket = existingByAssetName.get(p.asset_name) || []
        bucket.push(p)
        existingByAssetName.set(p.asset_name, bucket)
      }

      // Track which existing UIDs the AI referenced
      const matchedUids = new Set<string>()

      // Convert AI placements, preserving _meta and stable data from existing
      const aiPlacements: Placement[] = ap.map((p) => {
        const aiUid = p.uid as string | undefined
        const assetName = (p.asset_name as string) || ''

        // Match: first by uid (stable), then by asset_name (fallback)
        // For asset_name matching, consume one entry per match so each instance gets a unique uid
        let existing: Placement | undefined = aiUid
          ? existingByUid.get(aiUid)
          : undefined
        if (!existing) {
          const bucket = existingByAssetName.get(assetName)
          if (bucket && bucket.length > 0) {
            // Find first unmatched entry in this bucket
            const idx = bucket.findIndex((b) => !matchedUids.has(b.uid))
            if (idx !== -1) {
              existing = bucket[idx]
            }
          }
        }
        if (existing) matchedUids.add(existing.uid)

        // Handle both _meta (editor internal) and metadata (Flutter/AI format)
        const aiMeta = p._meta as Placement['_meta'] | undefined
        const aiMetadata = p.metadata as Record<string, unknown> | undefined

        // Build resolved _meta by merging both sources
        let resolvedMeta: Placement['_meta'] | undefined = aiMeta
          ? { ...aiMeta }
          : undefined

        // If metadata has sprite_sheet but _meta doesn't, pull it in
        if (aiMetadata?.sprite_sheet) {
          const ss = aiMetadata.sprite_sheet as Record<string, unknown>
          // Extract fps: top-level, or from first state definition
          let fpsParsed = (ss.fps as number) || 0
          if (!fpsParsed && ss.states && typeof ss.states === 'object') {
            const statesObj = ss.states as Record<
              string,
              Record<string, unknown>
            >
            const firstState = Object.values(statesObj)[0]
            if (firstState?.fps) fpsParsed = firstState.fps as number
          }
          const parsedSS = {
            frame_width: (ss.frame_width as number) || 0,
            frame_height: (ss.frame_height as number) || 0,
            columns: (ss.columns as number) || 1,
            rows: (ss.rows as number) || 1,
            total_frames:
              ((ss.columns as number) || 1) * ((ss.rows as number) || 1),
            fps: fpsParsed || 8,
            anchor_x: (ss.anchor_x as number) ?? undefined,
            anchor_y: (ss.anchor_y as number) ?? undefined,
          }
          if (!resolvedMeta) {
            resolvedMeta = {
              pixel_width: (aiMetadata.pixel_width as number) || undefined,
              pixel_height: (aiMetadata.pixel_height as number) || undefined,
              sprite_sheet: parsedSS,
            }
          } else if (!resolvedMeta.sprite_sheet) {
            resolvedMeta.sprite_sheet = parsedSS
          }
        }

        // Resolve file_url and asset_id from the authoritative asset catalog.
        // The AI may return incorrect values (e.g. copying from another asset),
        // so we prefer: catalog → existing placement → AI value.
        const catalogEntry = catalogByName.get(assetName)

        // When an existing placement was matched by uid, the AI is supposed to
        // return it verbatim.  However, the AI often strips transform fields
        // (offset_x, offset_y, scale, z_index) or resets them to 0/1.0.
        // To protect manually-positioned assets, we use existing values as
        // the authoritative source for uid-matched placements, only allowing
        // the AI to override when it provides an explicitly non-default value.
        const uidMatched = !!existing && aiUid === existing.uid

        // Helper: for uid-matched placements, prefer existing value unless
        // the AI provides a clearly intentional (non-default) value.
        const mergeNum = (
          aiVal: unknown,
          existVal: number | undefined,
          defaultVal: number
        ): number => {
          const ai = aiVal as number | undefined | null
          if (ai == null || ai === undefined) return existVal ?? defaultVal
          // If uid-matched and AI returns the default, keep existing
          if (uidMatched && existVal !== undefined && ai === defaultVal)
            return existVal
          return ai
        }

        return {
          uid: existing?.uid || uid(), // preserve existing uid for stable identity
          asset_name: assetName,
          asset_id:
            catalogEntry?.id ||
            (p.asset_id as string) ||
            existing?.asset_id ||
            '',
          display_name:
            (p.display_name as string) ||
            catalogEntry?.display_name ||
            (p.asset_name as string) ||
            existing?.display_name ||
            '',
          file_url:
            catalogEntry?.file_url ||
            existing?.file_url ||
            (p.file_url as string) ||
            '',
          x: (p.x as number) ?? existing?.x ?? 0,
          y: (p.y as number) ?? existing?.y ?? 0,
          z_index: (p.z_index as number) ?? existing?.z_index ?? 0,
          layer: (p.layer as string) || existing?.layer || 'objects',
          scale: mergeNum(p.scale, existing?.scale, 1.0),
          offset_x: mergeNum(p.offset_x, existing?.offset_x, 0),
          offset_y: mergeNum(p.offset_y, existing?.offset_y, 0),
          rotation: mergeNum(p.rotation, existing?.rotation, 0),
          flip_h: (p.flip_h as boolean) ?? existing?.flip_h ?? false,
          flip_v: (p.flip_v as boolean) ?? existing?.flip_v ?? false,
          stack_order: mergeNum(p.stack_order, existing?.stack_order, 0),
          walkable: (p.walkable as boolean) ?? existing?.walkable ?? false,
          is_ground_fill:
            (p.is_ground_fill as boolean) ?? existing?.is_ground_fill ?? false,
          // CRITICAL: preserve _meta (especially sprite_sheet) from existing placements
          _meta: resolvedMeta || existing?._meta || undefined,
          // Preserve full Flutter metadata for export
          _raw_metadata:
            (aiMetadata as Record<string, unknown>) ||
            existing?._raw_metadata ||
            undefined,
        }
      })

      // The AI always returns the COMPLETE scene.
      // Its asset_placements list is the source of truth — do NOT re-add
      // placements the AI omitted (that is how removals are expressed).
      // We only used `existingByUid / existingByAssetName` above to enrich
      // AI placements with stable UIDs and cached _meta/_raw_metadata.
      const merged = [...aiPlacements]

      // Update scene config if provided
      const sceneConfig = sceneData.scene as Record<string, unknown> | undefined
      if (sceneConfig) {
        setConfig((prev) => ({
          ...prev,
          scene_name: (sceneConfig.scene_name as string) || prev.scene_name,
          scene_type: (sceneConfig.scene_type as string) || prev.scene_type,
          description: (sceneConfig.description as string) || prev.description,
          lighting: (sceneConfig.lighting as string) || prev.lighting,
          background_color:
            (sceneConfig.background_color as string) || prev.background_color,
          spawn_x: (sceneConfig.spawn_x as number) ?? prev.spawn_x,
          spawn_y: (sceneConfig.spawn_y as number) ?? prev.spawn_y,
        }))
      }

      return merged
    },
    [placements, assets]
  )

  // ─── Export to SceneState (same format as AI creates) ────

  const exportSceneState = useCallback(() => {
    return {
      scene: config,
      asset_placements: placements.map((p) => {
        // Prefer full original metadata (from AI/asset DB) for Flutter compatibility
        // Fall back to building basic metadata from _meta
        let metadata: Record<string, unknown> | undefined = p._raw_metadata
          ? { ...p._raw_metadata }
          : undefined

        if (!metadata) {
          const basic: Record<string, unknown> = {}
          if (p._meta?.sprite_sheet) {
            basic.sprite_sheet = {
              frame_width: p._meta.sprite_sheet.frame_width,
              frame_height: p._meta.sprite_sheet.frame_height,
              columns: p._meta.sprite_sheet.columns,
              rows: p._meta.sprite_sheet.rows,
              ...(p._meta.sprite_sheet.fps
                ? { fps: p._meta.sprite_sheet.fps }
                : {}),
              ...(p._meta.sprite_sheet.anchor_x != null
                ? { anchor_x: p._meta.sprite_sheet.anchor_x }
                : {}),
              ...(p._meta.sprite_sheet.anchor_y != null
                ? { anchor_y: p._meta.sprite_sheet.anchor_y }
                : {}),
            }
          }
          if (p._meta?.pixel_width) basic.pixel_width = p._meta.pixel_width
          if (p._meta?.pixel_height) basic.pixel_height = p._meta.pixel_height
          if (p._meta?.hitbox_w || p._meta?.hitbox_h) {
            basic.hitbox = { width: p._meta.hitbox_w, height: p._meta.hitbox_h }
          }
          if (Object.keys(basic).length > 0) metadata = basic
        }

        return {
          uid: p.uid,
          asset_name: p.asset_name,
          asset_id: p.asset_id,
          display_name: p.display_name,
          file_url: p.file_url,
          x: p.x,
          y: p.y,
          z_index: p.z_index,
          layer: p.layer,
          scale: p.scale,
          offset_x: p.offset_x,
          offset_y: p.offset_y,
          rotation: p.rotation,
          flip_h: p.flip_h,
          flip_v: p.flip_v,
          stack_order: p.stack_order,
          walkable: p.walkable,
          is_ground_fill: p.is_ground_fill,
          metadata,
        }
      }),
      npcs: [],
      challenges: [],
      quests: [],
      routes: [],
      system_prompt: '',
      generation_notes: 'Built with Scene Builder',
    }
  }, [config, placements])

  // ─── Send Chat Message ───────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return

      const userMsg: ChatMessage = {
        id: genMsgId(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, userMsg])
      setChatInput('')
      setSuggestions([])

      const thinkingId = genMsgId()
      setChatMessages((prev) => [
        ...prev,
        {
          id: thinkingId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          thinking: true,
        },
      ])
      setIsThinking(true)

      try {
        // Build context about what's already on canvas
        // Build context about what's already on canvas — include uid for stable merging
        const canvasContext =
          placements.length > 0
            ? `[CURRENT SCENE STATE - DO NOT REMOVE THESE UNLESS ASKED]\n` +
              `Scene: "${config.scene_name}" (${config.scene_type})\n` +
              `Background: ${config.background_color}\n` +
              `Objects on canvas (${placements.filter((p) => !p.is_ground_fill).length}):\n` +
              placements
                .filter((p) => !p.is_ground_fill)
                .map((p) => {
                  const ss = p._meta?.sprite_sheet
                  const ssInfo = ss
                    ? ` sprite_sheet={frame_width:${ss.frame_width},frame_height:${ss.frame_height},columns:${ss.columns},rows:${ss.rows}}`
                    : ''
                  return `- uid="${p.uid}" asset_name="${p.asset_name}" asset_id="${p.asset_id}" display_name="${p.display_name}" at grid(${p.x},${p.y}) offset_x=${p.offset_x} offset_y=${p.offset_y} z_index=${p.z_index} scale=${p.scale} layer=${p.layer} file_url="${p.file_url}"${ssInfo}`
                })
                .join('\n') +
              (placements.some((p) => p.is_ground_fill)
                ? `\nGround fill: uid="${placements.find((p) => p.is_ground_fill)?.uid}" ${placements.find((p) => p.is_ground_fill)?.display_name}`
                : '') +
              `\n\nIMPORTANT RULES:` +
              `\n1. Keep ALL existing placements with their EXACT uid, asset_id, file_url, and positions.` +
              `\n2. Only ADD new objects or MODIFY what the user explicitly asks to change.` +
              `\n3. For existing objects, always return the same uid — this prevents duplicates.` +
              `\n4. Never change positions of objects the user didn't ask to move.` +
              `\n5. If an object has sprite_sheet metadata, preserve it exactly in the _meta field.`
            : ''

        const apiMessages = [...chatMessages, userMsg]
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content }))

        // Prepend canvas context to the latest user message
        if (canvasContext && apiMessages.length > 0) {
          const lastIdx = apiMessages.length - 1
          apiMessages[lastIdx] = {
            ...apiMessages[lastIdx],
            content:
              canvasContext +
              '\n\nUser request: ' +
              apiMessages[lastIdx].content,
          }
        }

        const currentSceneExport = exportSceneState()
        const response = await converseScene(
          apiMessages,
          currentSceneExport,
          gameContext
        )

        // Apply scene updates → convert to placements
        if (response.scene) {
          const newPlacements = aiSceneToPlacementsFn(response.scene)
          setPlacements(newPlacements)
          pushHistory(newPlacements, `AI: ${text.trim().slice(0, 30)}`)
        }

        if (response.suggestions?.length) setSuggestions(response.suggestions)

        setChatMessages((prev) =>
          prev
            .filter((m) => m.id !== thinkingId)
            .concat({
              id: genMsgId(),
              role: 'assistant',
              content: response.message,
              timestamp: new Date(),
            })
        )
      } catch {
        setChatMessages((prev) =>
          prev
            .filter((m) => m.id !== thinkingId)
            .concat({
              id: genMsgId(),
              role: 'assistant',
              content: '❌ Failed to get response. Try again.',
              timestamp: new Date(),
            })
        )
      } finally {
        setIsThinking(false)
        chatInputRef.current?.focus()
      }
    },
    [
      isThinking,
      chatMessages,
      exportSceneState,
      aiSceneToPlacementsFn,
      pushHistory,
      gameContext,
    ]
  )

  // ─── Auto-send concept from Game Editor ─────────────────

  const conceptSentRef = useRef(false)
  useEffect(() => {
    if (conceptSentRef.current) return
    const concept = sessionStorage.getItem('kinship_builder_concept')
    if (concept) {
      conceptSentRef.current = true
      sessionStorage.removeItem('kinship_builder_concept')
      // Small delay to let hooks settle
      setTimeout(() => sendMessage(concept), 500)
    }
  }, [sendMessage])

  // ─── Zoom / Pan Handlers ────────────────────────────────

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      // Mouse position in canvas space
      const mx = (e.clientX - rect.left) * (canvas.width / rect.width)
      const my = (e.clientY - rect.top) * (canvas.height / rect.height)

      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.2, Math.min(5, viewport.zoom * delta))

      // Zoom toward cursor
      setViewport((v) => ({
        zoom: newZoom,
        panX: mx - (mx - v.panX) * (newZoom / v.zoom),
        panY: my - (my - v.panY) * (newZoom / v.zoom),
      }))
    },
    [viewport.zoom]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const resetViewport = useCallback(() => {
    setViewport({ zoom: 1, panX: 0, panY: 0 })
  }, [])

  // ─── Z-Index Controls ─────────────────────────────────────

  const bringToFront = useCallback(() => {
    if (!selected) return
    const maxZ = Math.max(...placements.map((p) => p.z_index + p.stack_order))
    const updated = placements.map((p) =>
      p.uid === selected ? { ...p, z_index: maxZ + 10, stack_order: 0 } : p
    )
    setPlacements(updated)
    pushHistory(updated, 'Bring to front')
  }, [selected, placements, pushHistory])

  const sendToBack = useCallback(() => {
    if (!selected) return
    const minZ = Math.min(
      ...placements
        .filter((p) => !p.is_ground_fill && p.layer !== 'ground')
        .map((p) => p.z_index)
    )
    const updated = placements.map((p) =>
      p.uid === selected
        ? { ...p, z_index: Math.max(0, minZ - 10), stack_order: 0 }
        : p
    )
    setPlacements(updated)
    pushHistory(updated, 'Send to back')
  }, [selected, placements, pushHistory])

  const moveForward = useCallback(() => {
    if (!selected) return
    const updated = placements.map((p) =>
      p.uid === selected ? { ...p, z_index: p.z_index + 10 } : p
    )
    setPlacements(updated)
    pushHistory(updated, 'Move forward')
  }, [selected, placements, pushHistory])

  const moveBackward = useCallback(() => {
    if (!selected) return
    const updated = placements.map((p) =>
      p.uid === selected ? { ...p, z_index: Math.max(0, p.z_index - 10) } : p
    )
    setPlacements(updated)
    pushHistory(updated, 'Move backward')
  }, [selected, placements, pushHistory])

  // ─── Keyboard Shortcuts ──────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
      }
      if (ctrl && e.key === 'd') {
        e.preventDefault()
        duplicateSelected()
      }
      // Arrow keys: fine nudge (plain) or grid move (Shift)
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
        selected
      ) {
        e.preventDefault()
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
        const p = placements.find((pl) => pl.uid === selected)
        if (p && !p.is_ground_fill) {
          if (e.shiftKey) {
            // Shift + Arrow: move by 1 full grid cell (original behaviour)
            const nx = Math.max(0, Math.min(GRID_W - 1, p.x + dx))
            const ny = Math.max(0, Math.min(GRID_H - 1, p.y + dy))
            if (nx !== p.x || ny !== p.y) {
              updateSelected(
                { x: nx, y: ny, z_index: calcZIndex(nx, ny) },
                `Move (${nx},${ny})`
              )
            }
          } else {
            // Plain Arrow: fine-nudge by 4 game pixels via offset_x / offset_y
            const NUDGE = 4
            const newOffX = (p.offset_x ?? 0) + dx * NUDGE
            const newOffY = (p.offset_y ?? 0) + dy * NUDGE
            updateSelected(
              { offset_x: newOffX, offset_y: newOffY },
              `Nudge offset (${newOffX},${newOffY})`
            )
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    undo,
    redo,
    deleteSelected,
    duplicateSelected,
    selected,
    placements,
    updateSelected,
  ])

  // ─── Save ────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const data = exportSceneState()
      // Attach game_id so the scene is linked to the current game
      if (currentGame?.id) {
        ;(data as any).game_id = currentGame.id
      }
      const res = await fetch(`${BACKEND_URL}/api/scenes/save-generated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Save failed')
      const result = await res.json()

      // Auto-set as starting scene if this is the first scene in the game
      if (
        currentGame?.id &&
        !currentGame.starting_scene_id &&
        result.scene_id
      ) {
        try {
          await updateGame(currentGame.id, {
            starting_scene_id: result.scene_id,
          })
        } catch {
          /* non-critical */
        }
      }

      router.push(currentGame ? '/game-editor' : `/scenes/${result.scene_id}`)
    } catch (e) {
      alert('Save failed: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [exportSceneState, router, currentGame])

  // ─── Export JSON to clipboard ────────────────────────────

  const copyJSON = useCallback(() => {
    const data = exportSceneState()
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
  }, [exportSceneState])

  // ─── Flutter Preview Manifest ────────────────────────────

  const flutterManifest = useMemo(() => {
    const exported = exportSceneState()
    return {
      scene_name: config.scene_name,
      scene_type: config.scene_type,
      description: config.description,
      grid_width: config.dimensions.width,
      grid_height: config.dimensions.height,
      tile_width: 128,
      tile_height: 64,
      lighting: config.lighting,
      background_color: config.background_color,
      spawn_points: [
        {
          id: 'default',
          x: config.spawn_x,
          y: config.spawn_y,
          facing: 'down',
        },
      ],
      asset_placements: exported.asset_placements,
      // previewNpcs / previewChallenges are populated from the ?preview= param
      // (set by buildSceneManifest in game-editor). They are empty arrays when
      // the user opens the builder directly or via ?scene= (DB load path).
      npcs: previewNpcs,
      challenges: previewChallenges,
      zones: [],
    }
  }, [config, placements, exportSceneState, previewNpcs, previewChallenges])

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background">
      {/* ═══ TOOLBAR ═══ */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sidebar border-b border-card-border shrink-0">
        <button
          onClick={() => router.push(currentGame ? '/game-editor' : '/scenes')}
          className="text-muted hover:text-white text-xs mr-1"
        >
          ← Back
        </button>
        <input
          value={config.scene_name}
          onChange={(e) =>
            setConfig((c) => ({ ...c, scene_name: e.target.value }))
          }
          className="bg-transparent text-white font-bold text-sm border-b border-transparent hover:border-white/[0.15] focus:border-accent outline-none px-1 w-36"
        />
        <div className="flex-1" />

        <button
          onClick={undo}
          disabled={historyIdx <= 0}
          className="px-1.5 py-1 text-xs rounded bg-card text-white/70 hover:text-white disabled:opacity-30"
          title="Ctrl+Z"
        >
          ↩
        </button>
        <button
          onClick={redo}
          disabled={historyIdx >= history.length - 1}
          className="px-1.5 py-1 text-xs rounded bg-card text-white/70 hover:text-white disabled:opacity-30"
          title="Ctrl+Y"
        >
          ↪
        </button>
        <button
          onClick={clearAll}
          className="px-1.5 py-1 text-xs rounded bg-card text-red-400 hover:text-red-300"
          title="Clear all"
        >
          🗑
        </button>
        {hasGroundFill && (
          <button
            onClick={clearGroundFill}
            className="px-2 py-1 text-xs rounded bg-amber-500/20 text-accent hover:bg-amber-500/30 border border-amber-500/30 font-bold"
            title="Remove ground fill tile"
          >
            🗑 Ground
          </button>
        )}
        <button
          onClick={() => setShowGrid((g) => !g)}
          className={`px-1.5 py-1 text-xs rounded ${showGrid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-card text-white/70'}`}
        >
          ⊞
        </button>

        {/* Zoom controls */}
        <div className="w-px h-4 bg-input/50" />
        <button
          onClick={() =>
            setViewport((v) => ({ ...v, zoom: Math.max(0.2, v.zoom - 0.2) }))
          }
          className="px-1 py-1 text-xs rounded bg-card text-white/70 hover:text-white"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={resetViewport}
          className="px-1.5 py-1 text-[10px] rounded bg-card text-white/70 hover:text-white min-w-[36px] text-center"
          title="Reset zoom"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <button
          onClick={() =>
            setViewport((v) => ({ ...v, zoom: Math.min(5, v.zoom + 0.2) }))
          }
          className="px-1 py-1 text-xs rounded bg-card text-white/70 hover:text-white"
          title="Zoom in"
        >
          +
        </button>

        <div className="w-px h-4 bg-input/50" />
        <input
          type="color"
          value={config.background_color || '#1a1a2e'}
          onChange={(e) =>
            setConfig((c) => ({ ...c, background_color: e.target.value }))
          }
          className="w-5 h-5 rounded cursor-pointer bg-transparent border border-card-border p-0"
          title="Background color"
        />
        {['#1a1a2e', '#0f172a', '#1e3a2f', '#2d1b2e', '#1a1a1a', '#3b2f1e'].map(
          (c) => (
            <button
              key={c}
              onClick={() =>
                setConfig((prev) => ({ ...prev, background_color: c }))
              }
              className="w-3.5 h-3.5 rounded-sm border border-card-border/60 hover:border-white transition-colors"
              style={{ backgroundColor: c }}
              title={c}
            />
          )
        )}

        <div className="w-px h-4 bg-input/50" />
        <span className="text-[10px] text-muted">
          {placements.filter((p) => !p.is_ground_fill).length} obj
        </span>
        <button
          onClick={copyJSON}
          className="px-1.5 py-1 text-xs rounded bg-card text-white/70 hover:text-white"
          title="Copy JSON"
        >
          📋
        </button>
        <button
          onClick={handleSave}
          disabled={saving || placements.length === 0}
          className="px-3 py-1 text-xs rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-500 disabled:opacity-40"
        >
          {saving ? '...' : '💾 Save'}
        </button>
      </div>

      {/* ═══ 3-COLUMN LAYOUT ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT: Chat / Assets / Props ── */}
        <div className="w-80 shrink-0 bg-sidebar/95 border-r border-card-border flex flex-col">
          <div className="flex border-b border-card-border shrink-0">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${activeTab === 'chat' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-muted'}`}
            >
              💬 Prompt
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${activeTab === 'assets' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-muted'}`}
            >
              🎨 Assets
            </button>
            <button
              onClick={() => setActiveTab('properties')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider ${activeTab === 'properties' ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-muted'}`}
            >
              ⚙ Props
            </button>
          </div>

          {activeTab === 'chat' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-emerald-500/20 text-emerald-100'
                          : 'bg-card text-white/70'
                      }`}
                    >
                      {msg.thinking ? (
                        <div className="flex items-center gap-2 text-muted">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{' '}
                          Thinking...
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              {suggestions.length > 0 && !isThinking && (
                <div className="px-3 pb-2 flex flex-wrap gap-1">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="text-[10px] px-2 py-1 rounded-full bg-card text-white/70 hover:text-emerald-400 hover:bg-emerald-500/10 border border-card-border truncate max-w-full"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="p-2 border-t border-card-border">
                <div className="flex gap-2">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage(chatInput)
                      }
                    }}
                    placeholder="Describe your scene..."
                    rows={2}
                    disabled={isThinking}
                    className="flex-1 px-3 py-2 text-sm bg-card border border-card-border rounded-lg text-white placeholder-white/40 focus:border-accent outline-none resize-none"
                  />
                  <button
                    onClick={() => sendMessage(chatInput)}
                    disabled={!chatInput.trim() || isThinking}
                    className="px-3 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-30 self-end"
                  >
                    ▶
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'assets' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-2 space-y-2 shrink-0">
                <input
                  value={assetSearch}
                  onChange={(e) => setAssetSearch(e.target.value)}
                  placeholder="Search assets..."
                  className="w-full px-3 py-1.5 text-sm bg-card border border-card-border rounded-lg text-white placeholder-white/40 focus:border-accent outline-none"
                />
                <div className="flex gap-1 flex-wrap">
                  {assetTypes.map((t) => (
                    <button
                      key={t}
                      onClick={() => setAssetTypeFilter(t)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border ${
                        assetTypeFilter === t
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-card text-muted border-card-border hover:text-white/70'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {loadingAssets ? (
                  <div className="text-center text-muted py-8 text-sm">
                    Loading assets...
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {filteredAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="group relative bg-card rounded-lg border border-card-border hover:border-emerald-500/50 transition-all overflow-hidden"
                      >
                        <div
                          className="aspect-square flex items-center justify-center p-1 bg-input cursor-pointer"
                          onClick={() => quickPlaceAsset(asset)}
                          onMouseDown={() => startPlaceAsset(asset)}
                        >
                          <img
                            src={asset.thumbnail_url || asset.file_url}
                            alt={asset.display_name}
                            className="max-w-full max-h-full object-contain"
                            draggable={false}
                          />
                        </div>
                        <div className="px-1 py-0.5">
                          <div className="text-[9px] text-white/70 truncate">
                            {asset.display_name || asset.name}
                          </div>
                        </div>
                        <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                          <span className="text-[8px] px-1 py-0 rounded bg-sidebar/80 text-muted">
                            {asset.type}
                          </span>
                        </div>
                        <div className="absolute inset-0 bg-sidebar/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              quickPlaceAsset(asset)
                            }}
                            className="w-full text-[9px] px-1 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 font-bold"
                          >
                            + Place
                          </button>
                          {(asset.type === 'tile' ||
                            asset.tags?.some(
                              (t) =>
                                t.includes('ground') ||
                                t.includes('floor') ||
                                t.includes('terrain')
                            )) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setAsGroundFill(asset)
                              }}
                              className="w-full text-[9px] px-1 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 font-bold"
                            >
                              ▦ Fill Ground
                            </button>
                          )}
                          {asset.metadata?.sprite_sheet && (
                            <div className="text-[8px] text-accent mt-0.5">
                              🎬 Animated
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedPlacement ? (
                <>
                  <div className="text-center">
                    <img
                      src={selectedPlacement.file_url}
                      alt={selectedPlacement.display_name}
                      className="inline-block max-h-16 object-contain mb-1"
                    />
                    <div className="text-sm font-bold text-white">
                      {selectedPlacement.display_name}
                    </div>
                    <div className="text-[10px] text-muted">
                      {selectedPlacement.asset_name}
                    </div>
                  </div>

                  {/* Position */}
                  <fieldset className="border border-card-border rounded-lg p-2">
                    <legend className="text-[10px] font-bold text-muted uppercase px-1">
                      Position
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      <PropNumber
                        label="Grid X"
                        value={selectedPlacement.x}
                        min={0}
                        max={GRID_W - 1}
                        onChange={(v) =>
                          updateSelected(
                            {
                              x: v,
                              z_index: calcZIndex(v, selectedPlacement.y),
                            },
                            `Move X=${v}`
                          )
                        }
                      />
                      <PropNumber
                        label="Grid Y"
                        value={selectedPlacement.y}
                        min={0}
                        max={GRID_H - 1}
                        onChange={(v) =>
                          updateSelected(
                            {
                              y: v,
                              z_index: calcZIndex(selectedPlacement.x, v),
                            },
                            `Move Y=${v}`
                          )
                        }
                      />
                    </div>
                  </fieldset>

                  {/* Transform — Scale, Rotate, Flip */}
                  <fieldset className="border border-card-border rounded-lg p-2">
                    <legend className="text-[10px] font-bold text-muted uppercase px-1">
                      Transform
                    </legend>
                    <div className="space-y-2">
                      <PropSlider
                        label="Scale"
                        value={selectedPlacement.scale}
                        min={0.1}
                        max={3}
                        step={0.05}
                        onChange={(v) =>
                          updateSelected({ scale: v }, `Scale=${v}`)
                        }
                      />
                      <PropNumber
                        label="Rotation °"
                        value={selectedPlacement.rotation}
                        min={0}
                        max={360}
                        step={15}
                        onChange={(v) =>
                          updateSelected({ rotation: v }, `Rotate=${v}`)
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            updateSelected(
                              { flip_h: !selectedPlacement.flip_h },
                              'Flip H'
                            )
                          }
                          className={`flex-1 py-1 text-xs rounded ${selectedPlacement.flip_h ? 'bg-emerald-500/20 text-emerald-400' : 'bg-card text-white/70'}`}
                        >
                          ↔ Flip H
                        </button>
                        <button
                          onClick={() =>
                            updateSelected(
                              { flip_v: !selectedPlacement.flip_v },
                              'Flip V'
                            )
                          }
                          className={`flex-1 py-1 text-xs rounded ${selectedPlacement.flip_v ? 'bg-emerald-500/20 text-emerald-400' : 'bg-card text-white/70'}`}
                        >
                          ↕ Flip V
                        </button>
                      </div>
                    </div>
                  </fieldset>

                  {/* Z-Index / Layer */}
                  <fieldset className="border border-card-border rounded-lg p-2">
                    <legend className="text-[10px] font-bold text-muted uppercase px-1">
                      Layer & Depth
                    </legend>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[10px] text-muted">
                          Layer
                        </label>
                        <select
                          value={selectedPlacement.layer}
                          onChange={(e) =>
                            updateSelected(
                              { layer: e.target.value },
                              `Layer=${e.target.value}`
                            )
                          }
                          className="w-full px-2 py-1 text-xs bg-card border border-card-border rounded text-white"
                        >
                          <option value="ground">ground</option>
                          <option value="ground_decor">ground_decor</option>
                          <option value="objects">objects</option>
                          <option value="overhead">overhead</option>
                        </select>
                      </div>
                      <PropNumber
                        label="Z-Index"
                        value={selectedPlacement.z_index}
                        min={0}
                        max={999}
                        onChange={(v) =>
                          updateSelected({ z_index: v }, `Z=${v}`)
                        }
                      />
                    </div>
                    <PropNumber
                      label="Stack Order"
                      value={selectedPlacement.stack_order}
                      min={0}
                      max={10}
                      onChange={(v) =>
                        updateSelected({ stack_order: v }, `Stack=${v}`)
                      }
                    />
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      <button
                        onClick={sendToBack}
                        className="py-1 text-[9px] rounded bg-card text-white/70 hover:text-white"
                        title="Send to back"
                      >
                        ⇊ Back
                      </button>
                      <button
                        onClick={moveBackward}
                        className="py-1 text-[9px] rounded bg-card text-white/70 hover:text-white"
                        title="Move backward"
                      >
                        ↓ Down
                      </button>
                      <button
                        onClick={moveForward}
                        className="py-1 text-[9px] rounded bg-card text-white/70 hover:text-white"
                        title="Move forward"
                      >
                        ↑ Up
                      </button>
                      <button
                        onClick={bringToFront}
                        className="py-1 text-[9px] rounded bg-card text-white/70 hover:text-white"
                        title="Bring to front"
                      >
                        ⇈ Front
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedPlacement.walkable}
                        onChange={(e) =>
                          updateSelected({ walkable: e.target.checked })
                        }
                        className="checkbox checkbox-xs checkbox-success"
                      />
                      <span className="text-[10px] text-white/70">
                        Walkable
                      </span>
                    </div>
                  </fieldset>

                  {/* ═══ SPRITE SHEET ═══ */}
                  {selectedPlacement._meta?.sprite_sheet && (
                    <fieldset className="border border-cyan-500/30 rounded-lg p-2.5 bg-cyan-500/5">
                      <legend className="text-[10px] font-bold text-cyan-400 uppercase px-1">
                        🎞 Sprite Sheet
                      </legend>
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="bg-card rounded px-2 py-1.5">
                            <div className="text-[8px] text-muted">
                              Frame
                            </div>
                            <div className="text-[11px] text-white font-mono">
                              {selectedPlacement._meta.sprite_sheet.frame_width}
                              ×
                              {
                                selectedPlacement._meta.sprite_sheet
                                  .frame_height
                              }
                              px
                            </div>
                          </div>
                          <div className="bg-card rounded px-2 py-1.5">
                            <div className="text-[8px] text-muted">Grid</div>
                            <div className="text-[11px] text-white font-mono">
                              {selectedPlacement._meta.sprite_sheet.columns}×
                              {selectedPlacement._meta.sprite_sheet.rows}
                            </div>
                          </div>
                          <div className="bg-card rounded px-2 py-1.5">
                            <div className="text-[8px] text-muted">
                              Total frames
                            </div>
                            <div className="text-[11px] text-white font-mono">
                              {
                                selectedPlacement._meta.sprite_sheet
                                  .total_frames
                              }
                            </div>
                          </div>
                          <div className="bg-card rounded px-2 py-1.5">
                            <div className="text-[8px] text-muted">FPS</div>
                            <div className="text-[11px] text-white font-mono">
                              {selectedPlacement._meta.sprite_sheet.fps || 8}
                            </div>
                          </div>
                        </div>
                        <div className="text-[9px] text-muted">
                          {selectedPlacement._meta.sprite_sheet.rows > 1
                            ? `${selectedPlacement._meta.sprite_sheet.rows} rows — map each row to an action (idle, walk, run...)`
                            : 'Single row animation'}
                        </div>
                      </div>
                    </fieldset>
                  )}

                  {/* Info */}
                  {selectedPlacement._meta && (
                    <div className="text-[10px] text-white/40">
                      {selectedPlacement._meta.pixel_width && (
                        <span>
                          Size: {selectedPlacement._meta.pixel_width}×
                          {selectedPlacement._meta.pixel_height}px
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={duplicateSelected}
                      className="flex-1 py-1.5 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                    >
                      ⧉ Duplicate
                    </button>
                    <button
                      onClick={deleteSelected}
                      className="flex-1 py-1.5 text-xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      🗑 Delete
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-center text-white/40 py-2 text-sm">
                    Select an object on canvas
                  </div>

                  {/* ── Placed Assets List ── */}
                  {placements.filter((p) => !p.is_ground_fill).length > 0 && (
                    <fieldset className="border border-card-border rounded-lg p-2">
                      <legend className="text-[10px] font-bold text-muted uppercase px-1">
                        Placed Objects (
                        {placements.filter((p) => !p.is_ground_fill).length})
                      </legend>
                      <div className="space-y-1 max-h-52 overflow-y-auto">
                        {placements
                          .filter((p) => !p.is_ground_fill)
                          .map((p) => (
                            <button
                              key={p.uid}
                              onClick={() => {
                                setSelected(p.uid)
                                setActiveTab('properties')
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-card hover:bg-white/[0.1] text-left group"
                            >
                              <img
                                src={p.file_url}
                                alt={p.display_name}
                                className="w-7 h-7 object-contain shrink-0 rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] text-white font-medium truncate">
                                  {p.display_name}
                                </div>
                                <div className="text-[9px] text-muted">
                                  ({p.x}, {p.y})
                                </div>
                              </div>
                              <span className="text-[9px] text-emerald-400 opacity-0 group-hover:opacity-100 shrink-0">
                                Select →
                              </span>
                            </button>
                          ))}
                      </div>
                    </fieldset>
                  )}
                  {hasGroundFill &&
                    (() => {
                      const gf = placements.find((p) => p.is_ground_fill)
                      return gf ? (
                        <fieldset className="border border-amber-500/30 rounded-lg p-2 bg-amber-500/5">
                          <legend className="text-[10px] font-bold text-accent uppercase px-1">
                            Ground Fill
                          </legend>
                          <div className="flex items-center gap-2 mb-2">
                            <img
                              src={gf.file_url}
                              alt={gf.display_name}
                              className="w-10 h-10 object-contain rounded"
                            />
                            <div>
                              <div className="text-xs text-white font-bold">
                                {gf.display_name}
                              </div>
                              <div className="text-[10px] text-muted">
                                Fills entire grid
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={clearGroundFill}
                            className="w-full py-1.5 text-xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold"
                          >
                            🗑 Remove Ground Fill
                          </button>
                        </fieldset>
                      ) : null
                    })()}
                </div>
              )}
              <fieldset className="border border-card-border rounded-lg p-2">
                <legend className="text-[10px] font-bold text-muted uppercase px-1">
                  Scene
                </legend>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-muted">Type</label>
                    <input
                      value={config.scene_type}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, scene_type: e.target.value }))
                      }
                      className="w-full px-2 py-1 text-xs bg-card border border-card-border rounded text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PropNumber
                      label="Spawn X"
                      value={config.spawn_x}
                      min={0}
                      max={15}
                      onChange={(v) => setConfig((c) => ({ ...c, spawn_x: v }))}
                    />
                    <PropNumber
                      label="Spawn Y"
                      value={config.spawn_y}
                      min={0}
                      max={15}
                      onChange={(v) => setConfig((c) => ({ ...c, spawn_y: v }))}
                    />
                  </div>
                </div>
              </fieldset>
            </div>
          )}
        </div>

        {/* ── CENTER: Canvas ── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto flex items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            style={{ imageRendering: 'pixelated', cursor: cursorStyle }}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={handleCanvasMouseUp}
            onMouseMove={handleCanvasMouseMove}
            onContextMenu={(e) => e.preventDefault()}
            onMouseLeave={() => {
              setDragGhost(null)
              liveDragRef.current = null
              dragRef.current.mode = null
              isPanningRef.current = false
              setCursorStyle('crosshair')
            }}
          />
        </div>

        {/* ── RIGHT: Flutter Preview ── */}
        <div className="w-80 shrink-0 bg-sidebar/95 border-l border-card-border flex flex-col">
          <FlutterPreviewPanel manifest={flutterManifest} />
        </div>
      </div>
    </div>
  )
}

// ─── Property Input Components ───────────────────────────

function PropNumber({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-muted">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-2 py-1 text-xs bg-card border border-card-border rounded text-white font-mono"
      />
    </div>
  )
}

function PropSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-muted">{label}</label>
        <span className="text-[10px] text-emerald-400 font-mono">
          {value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-emerald-500"
      />
    </div>
  )
}

// ─── Flutter Preview Panel ───────────────────────────────

// ─── Flutter Preview Panel ───────────────────────────────
// Mirrors the FlutterPreview component in SceneDetailPage exactly:
//   - loaded is set ONLY by 'kinship:flutter_ready' (never by iframe onLoad)
//   - manifest is sent directly in the [loaded, manifest] effect (no debounce)
//   - 'kinship:flutter_error' is handled with a fallback UI
//   - iframe is only rendered when hasManifest is true

function FlutterPreviewPanel({
  manifest,
}: {
  manifest: Record<string, unknown>
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [previewError, setPreviewError] = useState(false)

  // hasManifest: true when the scene has at least a name — same guard as
  // SceneDetailPage's `hasScene` check (asset_placements.length > 0 there,
  // but the builder always has a manifest object so we check for scene_name).
  const hasManifest = Boolean(manifest?.scene_name)

  // Send manifest to Flutter whenever it changes OR when Flutter first
  // signals it is ready. This is the exact same pattern as SceneDetailPage.
  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow || !hasManifest) return
    try {
      iframeRef.current.contentWindow.postMessage(
        { type: 'kinship:scene_update', manifest },
        '*'
      )
    } catch {
      // iframe not ready yet
    }
  }, [loaded, manifest])

  // Listen for messages from Flutter — identical to SceneDetailPage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'kinship:flutter_ready') {
        setLoaded(true)
        setPreviewError(false)
      }
      if (e.data?.type === 'kinship:flutter_error') {
        setPreviewError(true)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const postManifest = () => {
    if (iframeRef.current?.contentWindow && hasManifest) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: 'kinship:scene_update', manifest },
          '*'
        )
      } catch {}
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-card-border">
        <div
          className={`w-2 h-2 rounded-full ${
            hasManifest
              ? loaded
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-amber-400'
              : 'bg-input'
          }`}
        />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {hasManifest ? (loaded ? 'Live Preview' : 'Loading...') : 'Preview'}
        </span>
        {hasManifest && loaded && (
          <button
            onClick={postManifest}
            className="ml-auto text-[10px] px-2 py-1 rounded bg-card text-white/70 hover:text-white transition-colors"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 relative bg-background">
        {hasManifest ? (
          <>
            {/* No onLoad — loaded is set exclusively by kinship:flutter_ready */}
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
    </div>
  )
}