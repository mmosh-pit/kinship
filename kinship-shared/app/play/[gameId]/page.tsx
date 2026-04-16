'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { Game, Scene } from '@/lib/types'

const FLUTTER_PREVIEW_URL =
  process.env.NEXT_PUBLIC_FLUTTER_PREVIEW_URL || '/flutter_web/index.html'

type LoadState = 'loading' | 'ready' | 'error' | 'not_found' | 'not_published'

export default function PlayGamePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const [state, setState] = useState<LoadState>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null)
  const [manifest, setManifest] = useState<any>(null)
  const [hasVisualContent, setHasVisualContent] = useState(false)
  const [loadingScene, setLoadingScene] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const manifestRef = useRef<any>(null)
  manifestRef.current = manifest

  // Load game + scenes
  useEffect(() => {
    if (!gameId) return
    ;(async () => {
      try {
        const g = await api.getGame(gameId)
        if (!g) {
          setState('not_found')
          return
        }
        if (g.status !== 'published') {
          setState('not_published')
          return
        }
        setGame(g)

        const s = await api.listScenes(undefined, gameId)
        setScenes(s || [])

        const startId = g.starting_scene_id || s?.[0]?.id
        if (startId) setCurrentSceneId(startId)
        setState('ready')
      } catch {
        setState('error')
      }
    })()
  }, [gameId])

  const currentScene = scenes.find((s) => s.id === currentSceneId)

  // Load manifest for current scene
  useEffect(() => {
    if (state !== 'ready' || !currentSceneId) return
    setLoadingScene(true)
    setHasVisualContent(false)
    api
      .getSceneManifest(currentSceneId)
      .then((data: any) => {
        const m = data?.gcsManifest || data || null
        setManifest(m)
        const assets =
          m?.assets ||
          m?.placed_assets ||
          m?.scene_assets ||
          m?.asset_placements ||
          []
        setHasVisualContent(Array.isArray(assets) && assets.length > 0)
        sendManifestToFlutter(m)
      })
      .catch(() => {
        setManifest(null)
        setHasVisualContent(false)
      })
      .finally(() => setLoadingScene(false))
  }, [currentSceneId, state])

  const sendManifestToFlutter = useCallback((m: any) => {
    if (!m || !iframeRef.current?.contentWindow) return
    setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'kinship:scene_update', manifest: m },
        '*'
      )
    }, 200)
  }, [])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'kinship:flutter_ready' && manifestRef.current) {
        sendManifestToFlutter(manifestRef.current)
      }
      if (e.data?.type === 'kinship:route_transition') {
        const targetSceneId = e.data.to_scene
        if (scenes.find((s) => s.id === targetSceneId))
          setCurrentSceneId(targetSceneId)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [scenes, sendManifestToFlutter])

  // ─── Error States ──────────────────────────

  if (state === 'loading')
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/70 text-sm">Loading game...</p>
        </div>
      </div>
    )

  if (state === 'not_found')
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">🎮</p>
          <p className="text-white font-bold text-lg mb-1">Game not found</p>
          <p className="text-muted text-sm">
            This game doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    )

  if (state === 'not_published')
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-white font-bold text-lg mb-1">
            Game not published
          </p>
          <p className="text-muted text-sm">
            This game is still being built. Check back later!
          </p>
        </div>
      </div>
    )

  if (state === 'error')
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-white font-bold text-lg mb-1">
            Something went wrong
          </p>
          <p className="text-muted text-sm">Could not load the game.</p>
        </div>
      </div>
    )

  // ─── Game View ──────────────────────────

  return (
    <div className="h-screen w-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-sidebar/80 border-b border-card-border">
        <div className="flex items-center gap-3">
          <span className="text-sm">🎮</span>
          <span className="text-white text-sm font-bold">
            {game?.name || 'Game'}
          </span>
          {currentScene && (
            <span className="text-muted text-xs">
              · {currentScene.scene_name || (currentScene as any)?.name}
            </span>
          )}
        </div>
        {scenes.length > 1 && (
          <div className="flex items-center gap-1.5">
            {scenes.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentSceneId(s.id)}
                className={`w-2 h-2 rounded-full transition-all ${s.id === currentSceneId ? 'bg-accent w-4' : 'bg-input hover:bg-white/[0.1]'}`}
                title={s.scene_name || (s as any)?.name || `Scene ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Game area — always Flutter iframe */}
      <div className="flex-1 relative">
        {loadingScene && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={`${FLUTTER_PREVIEW_URL}?mode=play`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />

        {!loadingScene && !hasVisualContent && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-sidebar/95 border border-amber-400/20 rounded-xl px-5 py-3 text-center backdrop-blur-sm">
            <p className="text-accent/80 text-xs font-semibold">
              No visual tiles placed yet
            </p>
            <p className="text-muted text-[10px] mt-1">
              Open this scene in the Scene Builder to add tiles and objects
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
