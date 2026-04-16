'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useStudio } from '@/lib/studio-context'
import PageHeader from '@/components/PageHeader'
import { Card, FacetBadge, Spinner } from '@/components/UI'
import { HEARTS_FACETS } from '@/lib/data'

// ─── Types ───────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  sceneUpdate?: Partial<SceneState> | null
  thinking?: boolean
}

interface AssetPlacement {
  asset_name: string
  asset_id?: string
  display_name: string
  file: string
  file_url?: string
  x: number
  y: number
  z_index: number
  layer: string
  scale: number
  purpose: string
  type?: string
  facet?: string | null
  interaction_type?: string
}

interface GeneratedNPC {
  name: string
  role: string
  facet: string
  personality: string
  background: string
  dialogue_style: string
  catchphrases: string[]
  position: { x: number; y: number }
}

interface GeneratedChallenge {
  name: string
  description: string
  facets: string[]
  difficulty: string
  steps: { order: number; description: string; hint?: string }[]
  success_criteria: string
  base_delta: number
  time_limit_sec: number
  related_assets?: string[]
}

interface GeneratedQuest {
  name: string
  beat_type: string
  facet: string
  description: string
  narrative_content: string
  sequence_order: number
}

interface GeneratedRoute {
  name: string
  from_scene: string
  to_scene: string
  description: string
  trigger_type: string
  conditions: { type: string; value?: string }[]
  bidirectional: boolean
}

interface SceneConfig {
  scene_name: string
  scene_type: string
  description: string
  lighting: string
  weather: string
  target_facets: string[]
  dimensions: { width: number; height: number }
  spawn_points?: { id: string; x: number; y: number; facing: string }[]
  zone_descriptions?: {
    name: string
    x_range: number[]
    y_range: number[]
    description: string
  }[]
}

interface SceneState {
  scene: SceneConfig | null
  asset_placements: AssetPlacement[]
  npcs: GeneratedNPC[]
  challenges: GeneratedChallenge[]
  quests: GeneratedQuest[]
  routes: GeneratedRoute[]
  system_prompt: string
  generation_notes: string
}

interface ConverseResponse {
  message: string
  scene: Partial<SceneState> | null
  phase: 'exploring' | 'designing' | 'refining' | 'ready'
  suggestions: string[]
}

// ─── API ─────────────────────────────────────────────────

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const FLUTTER_PREVIEW_URL =
  process.env.NEXT_PUBLIC_FLUTTER_PREVIEW_URL || '/flutter_web/index.html'

async function converseScene(
  messages: { role: string; content: string }[],
  currentScene: SceneState
): Promise<ConverseResponse> {
  const res = await fetch(`${BACKEND_URL}/api/scenes/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      current_scene: currentScene,
    }),
  })
  if (!res.ok) throw new Error('Conversation failed')
  return res.json()
}

async function saveScene(
  data: SceneState,
  gameId?: string
): Promise<{ scene_id: string }> {
  const payload: any = { ...data }
  if (gameId) payload.game_id = gameId
  const res = await fetch(`${BACKEND_URL}/api/scenes/save-generated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Save failed')
  return res.json()
}

// ─── Helpers ─────────────────────────────────────────────

function genId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function mergeSceneState(
  current: SceneState,
  update: Partial<SceneState>
): SceneState {
  return {
    scene: update.scene
      ? { ...(current.scene || ({} as SceneConfig)), ...update.scene }
      : current.scene,
    asset_placements: update.asset_placements ?? current.asset_placements,
    npcs: update.npcs ?? current.npcs,
    challenges: update.challenges ?? current.challenges,
    quests: update.quests ?? current.quests,
    routes: update.routes ?? current.routes,
    system_prompt: update.system_prompt ?? current.system_prompt,
    generation_notes: update.generation_notes ?? current.generation_notes,
  }
}

const EMPTY_SCENE: SceneState = {
  scene: null,
  asset_placements: [],
  npcs: [],
  challenges: [],
  quests: [],
  routes: [],
  system_prompt: '',
  generation_notes: '',
}

const STARTER_SUGGESTIONS = [
  'A mystical forest clearing with campfire',
  'Underwater crystal cave for meditation',
  'Mountain temple focused on honesty',
  'Community garden with enchanted plants',
]

// ─── Phase indicator labels ──────────────────────────────

const PHASE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  exploring: {
    label: 'Exploring Ideas',
    color: 'text-blue-400 bg-blue-500/15 border-blue-500/25',
    icon: '💭',
  },
  designing: {
    label: 'Designing Scene',
    color: 'text-violet-400 bg-violet-500/15 border-violet-500/25',
    icon: '🎨',
  },
  refining: {
    label: 'Refining Details',
    color: 'text-accent bg-accent/15 border-amber-500/25',
    icon: '✨',
  },
  ready: {
    label: 'Ready to Save',
    color: 'text-[#22c55e] bg-[#22c55e]/15 border-[#22c55e]/25',
    icon: '✅',
  },
}

// ─── Scene Summary Stats ─────────────────────────────────

function SceneSummary({
  scene,
  collapsed,
}: {
  scene: SceneState
  collapsed?: boolean
}) {
  if (!scene.scene) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-card border border-card-border flex items-center justify-center mb-3">
          <span className="text-2xl opacity-50">🗺️</span>
        </div>
        <p className="text-white/40 text-sm">
          Scene will appear here as you describe it
        </p>
      </div>
    )
  }

  const s = scene.scene
  const stats = [
    {
      icon: '🗺️',
      label: 'Assets',
      value: scene.asset_placements.length,
      show: scene.asset_placements.length > 0,
    },
    {
      icon: '🧑',
      label: 'NPCs',
      value: scene.npcs.length,
      show: scene.npcs.length > 0,
    },
    {
      icon: '⚡',
      label: 'Challenges',
      value: scene.challenges.length,
      show: scene.challenges.length > 0,
    },
    {
      icon: '📖',
      label: 'Quests',
      value: scene.quests.length,
      show: scene.quests.length > 0,
    },
    {
      icon: '🔀',
      label: 'Routes',
      value: scene.routes.length,
      show: scene.routes.length > 0,
    },
    {
      icon: '💬',
      label: 'Prompt',
      value: scene.system_prompt ? '✓' : '—',
      show: true,
    },
  ]

  return (
    <div className="space-y-3">
      {/* Scene header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#eb8000]/30 to-amber-600/30 flex items-center justify-center text-lg shrink-0">
          🌲
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-bold text-sm truncate">
            {s.scene_name}
          </h3>
          <p className="text-muted text-xs line-clamp-2">{s.description}</p>
        </div>
      </div>

      {/* Meta pills */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 font-bold uppercase tracking-wider">
          {s.scene_type}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/20 font-bold uppercase tracking-wider">
          {s.lighting}
        </span>
        {s.weather && s.weather !== 'clear' && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.1] text-muted border border-card-border font-bold uppercase tracking-wider">
            {s.weather}
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.1] text-muted border border-card-border font-medium">
          {s.dimensions.width}×{s.dimensions.height}
        </span>
      </div>

      {/* Facets */}
      {s.target_facets.length > 0 && (
        <div className="flex gap-1.5">
          {s.target_facets.map((f) => (
            <FacetBadge key={f} facet={f} size="sm" />
          ))}
        </div>
      )}

      {/* Stats grid */}
      {!collapsed && (
        <div className="grid grid-cols-3 gap-2">
          {stats
            .filter((s) => s.show)
            .map((stat) => (
              <div
                key={stat.label}
                className="bg-input rounded-lg px-2.5 py-2 text-center"
              >
                <span className="text-xs">{stat.icon}</span>
                <p className="text-accent font-bold text-sm">{stat.value}</p>
                <p className="text-white/40 text-[10px]">{stat.label}</p>
              </div>
            ))}
        </div>
      )}

      {/* NPC list preview */}
      {!collapsed && scene.npcs.length > 0 && (
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-1.5">
            NPCs
          </p>
          <div className="space-y-1">
            {scene.npcs.map((npc, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 bg-sidebar/40 rounded-lg"
              >
                <FacetBadge facet={npc.facet} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-medium truncate">
                    {npc.name}
                  </p>
                  <p className="text-white/40 text-[10px] truncate">
                    {npc.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Challenges list preview */}
      {!collapsed && scene.challenges.length > 0 && (
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-1.5">
            Challenges
          </p>
          <div className="space-y-1">
            {scene.challenges.map((ch, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 bg-sidebar/40 rounded-lg"
              >
                <span className="text-xs">⚡</span>
                <p className="text-white text-xs font-medium truncate flex-1">
                  {ch.name}
                </p>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    ch.difficulty === 'easy'
                      ? 'bg-accent/15 text-accent'
                      : ch.difficulty === 'hard'
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-accent/15 text-accent'
                  }`}
                >
                  {ch.difficulty}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Flutter Preview iframe ──────────────────────────────

function FlutterPreview({
  scene,
  className = '',
}: {
  scene: SceneState
  className?: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [previewError, setPreviewError] = useState(false)

  // Build a manifest the Flutter web app can understand
  const manifest = scene.scene
    ? {
        scene_name: scene.scene.scene_name,
        scene_type: scene.scene.scene_type,
        description: scene.scene.description,
        grid_width: scene.scene.dimensions.width,
        grid_height: scene.scene.dimensions.height,
        tile_width: 128,
        tile_height: 64,
        lighting: scene.scene.lighting,
        weather: scene.scene.weather,
        spawn_points: scene.scene.spawn_points || [],
        asset_placements: scene.asset_placements,
        npcs: scene.npcs.map((n) => ({
          id: n.name.toLowerCase().replace(/\s+/g, '_'),
          name: n.name,
          role: n.role,
          facet: n.facet,
          position: n.position,
          personality: n.personality,
          dialogue_style: n.dialogue_style,
        })),
        challenges: scene.challenges.map((c) => ({
          id: c.name.toLowerCase().replace(/\s+/g, '_'),
          name: c.name,
          facets: c.facets,
          trigger_positions: [],
        })),
        zones: scene.scene.zone_descriptions || [],
      }
    : null

  // FIX: Send manifest to iframe ONLY after Flutter signals it is ready.
  // Previously, onLoad on the <iframe> set loaded=true too early (when the
  // HTML/JS finished loading) and the postMessage was sent before Flutter/Dart
  // had initialized and registered its _onKinshipManifestUpdate callback.
  // Now loaded=true is set exclusively by the 'kinship:flutter_ready' message,
  // which is emitted by preview_bridge.js only after Flutter is fully booted.
  useEffect(() => {
    if (!loaded || !iframeRef.current?.contentWindow || !manifest) return
    try {
      iframeRef.current.contentWindow.postMessage(
        { type: 'kinship:scene_update', manifest },
        '*'
      )
    } catch {
      // iframe not ready yet
    }
  }, [loaded, manifest])

  // Listen for messages from Flutter
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'kinship:flutter_ready') {
        // Flutter bridge is fully initialized — safe to send the manifest now
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

  const hasScene = scene.scene !== null && scene.asset_placements.length > 0

  return (
    <div
      className={`relative bg-background rounded-xl overflow-hidden border border-card-border ${className}`}
    >
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-[#050824]/95 to-transparent">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${hasScene ? (loaded ? 'bg-[#22c55e] animate-pulse' : 'bg-amber-400') : 'bg-input'}`}
          />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {hasScene ? (loaded ? 'Live Preview' : 'Loading...') : 'Preview'}
          </span>
        </div>
        {hasScene && loaded && (
          <button
            onClick={() => {
              if (iframeRef.current?.contentWindow && manifest) {
                iframeRef.current.contentWindow.postMessage(
                  { type: 'kinship:scene_update', manifest },
                  '*'
                )
              }
            }}
            className="text-[10px] px-2 py-1 rounded bg-card text-white/70 hover:text-white transition-colors"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      {hasScene ? (
        <>
          {/* FIX: Removed onLoad={() => setLoaded(true)} — that fired too early
              (when HTML/JS loaded) before Flutter/Dart was initialized, causing
              the manifest postMessage to be sent and lost. loaded is now set
              exclusively via the 'kinship:flutter_ready' postMessage above. */}
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
            <p className="text-white/40 text-sm">
              Isometric preview will appear
            </p>
            <p className="text-white/30 text-xs mt-1">
              once assets are placed on the grid
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Chat Message Bubble ─────────────────────────────────

function MessageBubble({
  message,
  onSuggestionClick,
}: {
  message: ChatMessage
  onSuggestionClick?: (text: string) => void
}) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] px-3 py-1 rounded-full bg-card text-white/40 border border-card-border">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
          isUser
            ? 'bg-gradient-to-br from-[#eb8000] to-amber-600 text-white'
            : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white'
        }`}
      >
        {isUser ? '🧙' : '✨'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] space-y-2 ${isUser ? 'items-end' : ''}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-accent/15 text-white border border-accent/20 rounded-tr-md'
              : 'bg-card text-white/80 border border-card-border rounded-tl-md'
          }`}
        >
          {message.thinking ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className="text-white/70 text-xs italic">Thinking...</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
        </div>

        {/* Scene update indicator */}
        {message.sceneUpdate && (
          <div className="flex items-center gap-1.5 px-2">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10px] text-accent/80 font-medium">
              Scene updated
            </span>
            {message.sceneUpdate.scene && (
              <span className="text-[10px] text-white/40">
                ·{' '}
                {[
                  message.sceneUpdate.asset_placements
                    ? `${message.sceneUpdate.asset_placements.length} assets`
                    : '',
                  message.sceneUpdate.npcs
                    ? `${message.sceneUpdate.npcs.length} NPCs`
                    : '',
                  message.sceneUpdate.challenges
                    ? `${message.sceneUpdate.challenges.length} challenges`
                    : '',
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Timestamp */}
        <p
          className={`text-[10px] text-white/30 px-2 ${isUser ? 'text-right' : ''}`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export default function SceneCreatePage() {
  const router = useRouter()
  const { currentGame } = useStudio()

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: genId(),
      role: 'assistant',
      content: `Hey there, Wizard! 🧙✨ I'm your scene co-designer. Let's build something amazing together.\n\nTell me about the scene you're imagining — the vibe, the setting, what emotions you want players to feel. I'll help shape it step by step, and you'll see a live preview as we go.\n\nWhat kind of world are we creating?`,
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [phase, setPhase] = useState<string>('exploring')
  const [suggestions, setSuggestions] = useState<string[]>(STARTER_SUGGESTIONS)

  // Scene state (built progressively)
  const [sceneState, setSceneState] = useState<SceneState>(EMPTY_SCENE)

  // UI state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [rightPanel, setRightPanel] = useState<'preview' | 'summary'>('preview')

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ─── Send message ──────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return
      setError('')

      // Add user message
      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInputValue('')
      setSuggestions([])

      // Add thinking indicator
      const thinkingId = genId()
      setMessages((prev) => [
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
        // Build conversation history for API
        const apiMessages = [...messages, userMsg]
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content }))

        const response = await converseScene(apiMessages, sceneState)

        // Apply scene updates
        if (response.scene) {
          setSceneState((prev) => mergeSceneState(prev, response.scene!))
        }

        // Update phase
        if (response.phase) {
          setPhase(response.phase)
        }

        // Update suggestions
        if (response.suggestions?.length) {
          setSuggestions(response.suggestions)
        }

        // Replace thinking message with actual response
        const assistantMsg: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: response.message,
          timestamp: new Date(),
          sceneUpdate: response.scene,
        }

        setMessages((prev) =>
          prev.filter((m) => m.id !== thinkingId).concat(assistantMsg)
        )
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== thinkingId))
        setError('Failed to get response. Please try again.')
      } finally {
        setIsThinking(false)
        inputRef.current?.focus()
      }
    },
    [isThinking, messages, sceneState]
  )

  // ─── Save scene ────────────────────────────────────────

  const handleSave = async () => {
    if (!sceneState.scene) return
    setSaving(true)
    setError('')
    try {
      const saved = await saveScene(sceneState, currentGame?.id)
      router.push(`/scenes/${saved.scene_id}`)
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  // ─── Handle input ──────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  // ─── Phase info ────────────────────────────────────────

  const phaseInfo = PHASE_CONFIG[phase] || PHASE_CONFIG.exploring
  const canSave =
    sceneState.scene !== null && sceneState.asset_placements.length > 0

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════

  return (
    <>
      <PageHeader
        title="Create Scene"
        subtitle="Conversational scene designer"
        breadcrumbs={[
          { label: 'Scenes', href: '/scenes' },
          { label: 'Create' },
        ]}
        action={
          <div className="flex items-center gap-3">
            {/* Phase badge */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${phaseInfo.color}`}
            >
              {phaseInfo.icon} {phaseInfo.label}
            </span>
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="px-5 py-2 bg-gradient-to-r from-[#eb8000] to-[#c96d00] text-white font-semibold rounded-xl text-sm hover:from-[#c96d00] hover:to-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-accent/20 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Spinner size="sm" /> Saving...
                </>
              ) : (
                '💾 Save Scene'
              )}
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* ═══ Main Layout: Chat (left) + Preview (right) ═══ */}
      <div
        className="grid grid-cols-[1fr_420px] gap-5 mt-2"
        style={{ height: 'calc(100vh - 180px)' }}
      >
        {/* ─── Left: Chat Panel ─── */}
        <div className="flex flex-col bg-card/30 rounded-2xl border border-card-border overflow-hidden">
          {/* Chat messages area */}
          <div
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            style={{ scrollBehavior: 'smooth' }}
          >
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onSuggestionClick={sendMessage}
              />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && !isThinking && (
            <div className="px-5 pb-2 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-card text-white/70 hover:text-white hover:bg-white/[0.1] transition-all border border-card-border hover:border-white/[0.15] truncate max-w-[280px]"
                >
                  💡 {s}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-card-border p-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={
                    phase === 'exploring'
                      ? "Describe the scene you're imagining..."
                      : phase === 'designing'
                        ? 'Add details, request changes...'
                        : phase === 'refining'
                          ? 'Fine-tune anything — NPCs, challenges, layout...'
                          : "Say 'save' or make final adjustments..."
                  }
                  disabled={isThinking}
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-3 pr-12 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 resize-none disabled:opacity-50 transition-all"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                  onInput={(e) => {
                    const t = e.currentTarget
                    t.style.height = 'auto'
                    t.style.height = `${Math.min(t.scrollHeight, 120)}px`
                  }}
                />
                <span className="absolute right-3 bottom-3 text-[10px] text-white/30">
                  ↵ send
                </span>
              </div>
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || isThinking}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#eb8000] to-amber-600 flex items-center justify-center text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:from-[#c96d00] hover:to-amber-600 shrink-0 shadow-lg shadow-accent/20"
              >
                {isThinking ? <Spinner size="sm" /> : '➤'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Right: Preview + Summary ─── */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Tab toggle */}
          <div className="flex bg-card/40 rounded-xl p-1 border border-card-border shrink-0">
            {[
              { key: 'preview' as const, label: '🎮 Preview' },
              { key: 'summary' as const, label: '📊 Summary' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRightPanel(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  rightPanel === tab.key
                    ? 'bg-white/[0.1] text-white shadow-sm'
                    : 'text-muted hover:text-white/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          {rightPanel === 'preview' ? (
            <FlutterPreview scene={sceneState} className="flex-1" />
          ) : (
            <Card className="flex-1 overflow-y-auto p-5">
              <SceneSummary scene={sceneState} />
            </Card>
          )}

          {/* Quick stats bar (always visible) */}
          {sceneState.scene && (
            <div className="grid grid-cols-5 gap-1.5 shrink-0">
              {[
                { icon: '🗺️', n: sceneState.asset_placements.length },
                { icon: '🧑', n: sceneState.npcs.length },
                { icon: '⚡', n: sceneState.challenges.length },
                { icon: '📖', n: sceneState.quests.length },
                { icon: '🔀', n: sceneState.routes.length },
              ].map((s, i) => (
                <div
                  key={i}
                  className="bg-card rounded-lg py-1.5 text-center border border-card-border"
                >
                  <span className="text-[10px]">{s.icon}</span>
                  <p className="text-accent font-bold text-xs">{s.n}</p>
                </div>
              ))}
            </div>
          )}

          {/* Save button at bottom */}
          {canSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-gradient-to-r from-[#eb8000] to-[#c96d00] text-white font-bold rounded-xl text-sm hover:from-[#c96d00] hover:to-amber-700 disabled:opacity-50 transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-2 shrink-0"
            >
              {saving ? (
                <>
                  <Spinner size="sm" /> Saving...
                </>
              ) : (
                '💾 Save All & Create Scene'
              )}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
