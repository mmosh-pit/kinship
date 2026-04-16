'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import type { Presence, PresenceSignal } from '@/lib/agent-types'
import { ALL_SIGNALS, HANDLE_MAX, isValidHandle } from '@/lib/agent-types'
import {
  ArrowLeft,
  Crown,
  Bot,
  Save,
  Pencil,
  Trash2,
  Brain,
  MessageSquareCode,
  Activity,
  Sparkles,
  BookOpen,
  ScanFace,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Check,
  Image as ImageIcon,
  Library,
  Plus,
  Users,
  UserRound,
} from 'lucide-react'

// Backend API URL for direct calls
const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'

interface KnowledgeBase {
  id: string
  name: string
}

interface PromptItem {
  id: string
  name: string
}

// ─── Dummy members for Members section ───────────────────────────────────────
interface Member {
  id: string
  name: string
  email: string
  joinedAt: string
}

const INITIAL_MEMBERS: Member[] = [
  { id: 'member-1', name: 'Michael Brown', email: 'michael@example.com', joinedAt: 'Mar 15, 2024, 4:00 PM' },
  { id: 'member-2', name: 'Sarah Johnson', email: 'sarah@example.com', joinedAt: 'Mar 18, 2024, 7:50 PM' },
  { id: 'member-3', name: 'David Lee', email: 'david@example.com', joinedAt: 'Apr 2, 2024, 2:45 PM' },
]

// ─── Editable text section ──────────────────────────────────────────
function EditableSection({
  label,
  icon: Icon,
  value,
  onChange,
  onSave,
  saving,
  savedFlash,
  placeholder,
  rows = 10,
}: {
  label: string
  icon: React.ElementType
  value: string
  onChange: (v: string) => void
  onSave: () => void
  saving: boolean
  savedFlash: boolean
  placeholder: string
  rows?: number
}) {
  const [isEditing, setIsEditing] = useState(false)
  const originalRef = useRef('')

  function startEditing() {
    originalRef.current = value
    setIsEditing(true)
  }

  function handleCancel() {
    onChange(originalRef.current)
    setIsEditing(false)
  }

  async function handleSave() {
    await onSave()
    setIsEditing(false)
  }

  useEffect(() => {
    if (!value) setIsEditing(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`border rounded-xl p-5 transition-colors ${
        isEditing ? 'bg-card border-accent/40' : 'bg-card border-card-border'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Icon size={16} className="text-accent" />
          {label}
          {isEditing && (
            <span className="text-xs font-normal text-accent/70 bg-accent/10 px-2 py-0.5 rounded-full">
              Editing
            </span>
          )}
        </h3>
        {value && <span className="text-xs text-muted">{value.length} chars</span>}
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!isEditing}
        placeholder={placeholder}
        rows={rows}
        className={`w-full rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none text-sm leading-relaxed transition-colors ${
          isEditing
            ? 'bg-input border border-accent/30 focus:border-accent/60 resize-y cursor-text'
            : 'bg-transparent border border-transparent cursor-default resize-none select-text'
        }`}
      />

      <div className="flex items-center gap-3 mt-3">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2 rounded-full transition-colors flex items-center gap-2 text-sm disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save {label}
            </button>
            <button
              onClick={handleCancel}
              className="border border-card-border text-foreground/70 hover:text-foreground hover:border-accent/40 font-medium px-4 py-2 rounded-full transition-colors text-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={startEditing}
            className="bg-card border border-card-border hover:border-accent/50 text-foreground font-medium px-5 py-2 rounded-full transition-colors flex items-center gap-2 text-sm"
          >
            <Pencil size={14} />
            Edit {label}
          </button>
        )}
        <p
          className={`text-xs flex items-center gap-1 transition-colors ${
            savedFlash ? 'text-green-400' : 'text-muted'
          }`}
        >
          {savedFlash && <CheckCircle size={12} />}
          {savedFlash ? 'Saved!' : ''}
        </p>
      </div>
    </div>
  )
}

// ─── Collapsible sidebar card ─────────────────────────────────────────────────
function SidebarCard({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-white font-semibold flex items-center gap-2 text-sm">
          <Icon size={16} className="text-accent" />
          {title}
        </span>
        {open ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-card-border pt-4">{children}</div>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AgentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [agent, setAgent] = useState<Presence | null>(null)
  const [loading, setLoading] = useState(true)

  // Editable fields
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [editingHandle, setEditingHandle] = useState(false)
  const [handleError, setHandleError] = useState('')
  const [briefDescription, setBriefDescription] = useState('')
  const [editingBrief, setEditingBrief] = useState(false)
  const [description, setDescription] = useState('')
  const [backstory, setBackstory] = useState('')

  // Save state per section
  const [descSaving, setDescSaving] = useState(false)
  const [descFlash, setDescFlash] = useState(false)
  const [backSaving, setBackSaving] = useState(false)
  const [backFlash, setBackFlash] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)
  const [handleSaving, setHandleSaving] = useState(false)
  const [briefSaving, setBriefSaving] = useState(false)

  // Relationships
  const [allKBs, setAllKBs] = useState<KnowledgeBase[]>([])
  const [allPrompts, setAllPrompts] = useState<PromptItem[]>([])
  const [selectedKBIds, setSelectedKBIds] = useState<string[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [activeSignals, setActiveSignals] = useState<PresenceSignal[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [selectedAssetName, setSelectedAssetName] = useState('')

  // AI assistant
  const [aiTarget, setAiTarget] = useState<'description' | 'backstory'>('description')
  const [aiMode, setAiMode] = useState<'generate' | 'refine'>('generate')
  const [aiInstructions, setAiInstructions] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  // Sidebar save state
  const [sidebarSaving, setSidebarSaving] = useState(false)
  const [sidebarFlash, setSidebarFlash] = useState(false)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Members
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)

  const flashTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function flash(key: string, setter: (v: boolean) => void) {
    setter(true)
    if (flashTimer.current[key]) clearTimeout(flashTimer.current[key])
    flashTimer.current[key] = setTimeout(() => setter(false), 2500)
  }

  // ── Load ──
  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${id}`)
      if (!res.ok) {
        router.push('/agents')
        return
      }
      const data = await res.json()
      const a: Presence = data.agent
      setAgent(a)
      setName(a.name)
      setHandle(a.handle || '')
      setBriefDescription(a.briefDescription || '')
      setDescription(a.description || '')
      setBackstory(a.backstory || '')
      setSelectedKBIds(a.knowledgeBaseIds || [])
      setSelectedPromptId(a.promptId || '')
      setActiveSignals(a.signals || [])
      setSelectedAssetId(a.assetId || '')
      setSelectedAssetName(a.assetName || '')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchAgent()
    fetch('/api/knowledge')
      .then((r) => r.json())
      .then((d) => setAllKBs(d.knowledgeBases || []))
      .catch(() => {})
    fetch('/api/prompts')
      .then((r) => r.json())
      .then((d) => setAllPrompts(d.prompts || []))
      .catch(() => {})
  }, [fetchAgent])

  // ── Save name ──
  async function handleSaveName() {
    if (!name.trim() || name.trim() === agent?.name) return
    setNameSaving(true)
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (res.ok) {
      const d = await res.json()
      setAgent(d.agent)
      setName(d.agent.name)
    }
    setNameSaving(false)
  }

  // ── Save handle ──
  async function handleSaveHandle() {
    const trimmed = handle.trim().toLowerCase()
    if (!trimmed) {
      setHandleError('Handle is required')
      return
    }
    if (!isValidHandle(trimmed) || trimmed.length > HANDLE_MAX) {
      setHandleError('Only letters, numbers, _ and . — max 25 characters')
      return
    }
    if (trimmed === agent?.handle) {
      setEditingHandle(false)
      return
    }
    setHandleSaving(true)
    setHandleError('')
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: trimmed }),
    })
    if (res.ok) {
      const d = await res.json()
      setAgent(d.agent)
      setHandle(d.agent.handle)
      setEditingHandle(false)
    } else {
      const d = await res.json()
      setHandleError(d.error || 'Failed to update handle')
    }
    setHandleSaving(false)
  }

  // ── Save brief description ──
  async function handleSaveBriefDescription() {
    setBriefSaving(true)
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ briefDescription }),
    })
    if (res.ok) {
      const d = await res.json()
      setAgent(d.agent)
    }
    setBriefSaving(false)
    setEditingBrief(false)
  }

  // ── Save description ──
  async function handleSaveDescription() {
    setDescSaving(true)
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    })
    if (res.ok) {
      const d = await res.json()
      setAgent(d.agent)
      flash('desc', setDescFlash)
    }
    setDescSaving(false)
  }

  // ── Save backstory ──
  async function handleSaveBackstory() {
    setBackSaving(true)
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backstory }),
    })
    if (res.ok) {
      const d = await res.json()
      setAgent(d.agent)
      flash('back', setBackFlash)
    }
    setBackSaving(false)
  }

  // ── Save sidebar (KB, prompt, signals, asset) ──
  async function handleSaveSidebar() {
    setSidebarSaving(true)
    const kbNames = selectedKBIds.map((kbId) => allKBs.find((k) => k.id === kbId)?.name ?? kbId)
    const promptName = allPrompts.find((p) => p.id === selectedPromptId)?.name ?? ''
    const res = await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: selectedAssetId || null,
        assetName: selectedAssetName || null,
        knowledgeBaseIds: selectedKBIds,
        knowledgeBaseNames: kbNames,
        promptId: selectedPromptId || null,
        promptName: selectedPromptId ? promptName : null,
        signals: activeSignals,
      }),
    })
    if (res.ok) {
      const d = await res.json()
      setAgent(d.agent)
      flash('sidebar', setSidebarFlash)
    }
    setSidebarSaving(false)
  }

  // ── AI generate ──
  async function handleAIGenerate() {
    if (!aiInstructions.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch(`${AGENT_API_URL}/api/agents/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: aiTarget, instructions: aiInstructions, mode: aiMode }),
      })
      if (res.ok) {
        const data = await res.json()
        if (aiTarget === 'description') {
          setDescription(data.content)
          flash('desc', setDescFlash)
        } else {
          setBackstory(data.content)
          flash('back', setBackFlash)
        }
        setAgent(data.agent)
        setAiInstructions('')
      } else {
        const data = await res.json()
        setAiError(data.detail || data.error || 'Generation failed')
      }
    } catch {
      setAiError('Something went wrong')
    } finally {
      setAiLoading(false)
    }
  }

  // ── Signals ──
  function toggleSignal(sig: (typeof ALL_SIGNALS)[number]) {
    setActiveSignals((prev) => {
      const exists = prev.find((s) => s.signalId === sig.signalId)
      if (exists) return prev.filter((s) => s.signalId !== sig.signalId)
      return [...prev, { ...sig, value: 50 }]
    })
  }
  function setSignalValue(signalId: string, value: number) {
    setActiveSignals((prev) => prev.map((s) => (s.signalId === signalId ? { ...s, value } : s)))
  }

  // ── Delete ──
  async function handleDelete() {
    await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    router.push('/agents')
  }

  // ── Members ──
  function handleConfirmRemoveMember() {
    if (!memberToRemove) return
    setMembers((prev) => prev.filter((m) => m.id !== memberToRemove.id))
    setMemberToRemove(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={36} className="text-muted animate-spin" />
      </div>
    )
  }
  if (!agent) return null

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted mb-4">
        <button onClick={() => router.push('/agents')} className="hover:text-accent transition-colors">
          Agents
        </button>
        <ChevronRight size={14} />
        <span className="text-foreground">{agent.name}</span>
      </div>

      {/* Title row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            {agent.type?.toLowerCase() === 'presence' ? (
              <Crown size={20} className="text-accent" />
            ) : (
              <Bot size={20} className="text-accent" />
            )}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            disabled={nameSaving}
            className="text-2xl font-bold text-white bg-transparent border-b border-transparent hover:border-white/20 focus:border-accent/50 focus:outline-none transition-colors py-0.5 flex-1 min-w-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${
              agent.type?.toLowerCase() === 'presence' ? 'bg-accent/20 text-accent' : 'bg-white/[0.08] text-white/60'
            }`}
          >
            {agent.type?.toLowerCase() === 'presence' ? 'Supervisor' : 'Worker'}
          </span>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="shrink-0 text-muted hover:text-red-400 transition-colors flex items-center gap-1.5 text-sm border border-transparent hover:border-red-400/30 px-3 py-1.5 rounded-lg"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Handle — inline editable */}
      <div className="ml-[52px] mb-2 flex items-start gap-2">
        {editingHandle ? (
          <>
            <div className="flex items-center flex-1 min-w-0">
              <span className="text-muted text-sm mr-1 shrink-0">@</span>
              <div className="flex-1 relative min-w-0">
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, HANDLE_MAX)
                    setHandle(cleaned)
                    setHandleError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveHandle()
                    if (e.key === 'Escape') {
                      setHandle(agent?.handle || '')
                      setHandleError('')
                      setEditingHandle(false)
                    }
                  }}
                  autoFocus
                  maxLength={HANDLE_MAX}
                  placeholder="handle"
                  className={`w-full text-sm bg-input border rounded-lg px-3 py-1.5 text-foreground placeholder:text-muted focus:outline-none pr-12 ${
                    handleError ? 'border-red-500/50 focus:border-red-500/70' : 'border-accent/40 focus:border-accent/70'
                  }`}
                />
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums pointer-events-none ${
                    handle.length >= HANDLE_MAX ? 'text-red-400' : 'text-muted'
                  }`}
                >
                  {handle.length}/{HANDLE_MAX}
                </span>
              </div>
            </div>
            <button
              onClick={handleSaveHandle}
              disabled={handleSaving}
              className="shrink-0 bg-accent hover:bg-accent-dark text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-60"
            >
              {handleSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
            <button
              onClick={() => {
                setHandle(agent?.handle || '')
                setHandleError('')
                setEditingHandle(false)
              }}
              className="shrink-0 text-muted hover:text-white text-xs px-2 py-1.5 rounded-lg transition-colors"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <button onClick={() => setEditingHandle(true)} className="group flex items-center gap-2 text-left">
            <span className="text-sm text-muted font-mono">
              {handle ? `@${handle}` : <span className="text-muted/40 not-italic">Add a handle…</span>}
            </span>
            <Pencil size={12} className="text-muted/30 group-hover:text-accent transition-colors shrink-0" />
          </button>
        )}
      </div>
      {handleError && (
        <div className="ml-[52px] mb-1">
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle size={11} />
            {handleError}
          </p>
        </div>
      )}

      {/* Brief description — inline editable */}
      <div className="ml-[52px] mb-6 flex items-start gap-2">
        {editingBrief ? (
          <>
            <input
              type="text"
              value={briefDescription}
              onChange={(e) => setBriefDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveBriefDescription()
                if (e.key === 'Escape') {
                  setBriefDescription(agent.briefDescription || '')
                  setEditingBrief(false)
                }
              }}
              autoFocus
              placeholder="Brief description of this being…"
              className="flex-1 text-sm text-muted bg-input border border-accent/40 rounded-lg px-3 py-1.5 italic focus:outline-none focus:border-accent/70 min-w-0"
            />
            <button
              onClick={handleSaveBriefDescription}
              disabled={briefSaving}
              className="shrink-0 bg-accent hover:bg-accent-dark text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-60"
            >
              {briefSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
            <button
              onClick={() => {
                setBriefDescription(agent.briefDescription || '')
                setEditingBrief(false)
              }}
              className="shrink-0 text-muted hover:text-white text-xs px-2 py-1.5 rounded-lg transition-colors"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <button onClick={() => setEditingBrief(true)} className="group flex items-center gap-2 text-left">
            <span className="text-sm text-muted italic">
              {briefDescription ? `"${briefDescription}"` : <span className="text-muted/40">Add a brief description…</span>}
            </span>
            <Pencil size={12} className="text-muted/30 group-hover:text-accent transition-colors shrink-0" />
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* ── Left: Description + Backstory ───────────────────────────── */}
        <div className="flex-[3] min-w-0 space-y-4">
          <EditableSection
            label="Description"
            icon={ScanFace}
            value={description}
            onChange={setDescription}
            onSave={handleSaveDescription}
            saving={descSaving}
            savedFlash={descFlash}
            placeholder="A vivid description of this presence — what it looks like, how it moves, what energy it carries. Use AI to generate one based on the brief description above."
            rows={10}
          />

          <EditableSection
            label="Backstory"
            icon={BookOpen}
            value={backstory}
            onChange={setBackstory}
            onSave={handleSaveBackstory}
            saving={backSaving}
            savedFlash={backFlash}
            placeholder="The origin, history, and motivations of this presence. Use AI to generate a backstory, or write your own."
            rows={8}
          />

          {/* ── Members ──────────────────────────────────────────────── */}
          <div className="border rounded-xl p-5 transition-colors bg-card border-accent/40">
            {/* Header */}
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                <Users size={18} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <span>Members</span>
                </h3>
                <p className="text-xs text-muted">
                  {members.length} member{members.length !== 1 ? 's' : ''} joined this agent
                </p>
              </div>
            </div>

            {/* Member list */}
            {members.length > 0 ? (
              <div className="rounded-xl border border-card-border overflow-hidden">
                {members.map((member, idx) => (
                  <div
                    key={member.id}
                    className={`flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/[0.02] transition-colors ${
                      idx !== 0 ? 'border-t border-card-border' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full border border-accent/25 bg-white/[0.04] flex items-center justify-center shrink-0">
                      <UserRound size={18} className="text-accent/60" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white block truncate">
                        {member.name}
                      </span>
                      <span className="text-xs text-muted/60 block truncate">
                        {member.email}
                      </span>
                    </div>

                    {/* Joined date */}
                    <div className="text-right shrink-0 hidden sm:block mr-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted/40 block">
                        Joined
                      </span>
                      <span className="text-xs text-muted/70">
                        {member.joinedAt}
                      </span>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => setMemberToRemove(member)}
                      className="shrink-0 text-red-400/70 hover:text-red-400 text-xs font-medium border border-red-500/20 hover:border-red-500/40 bg-red-500/[0.04] hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 rounded-xl border border-dashed border-card-border">
                <Users size={28} className="text-muted/20 mx-auto mb-2.5" />
                <p className="text-sm text-muted/40">No members have joined yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────────── */}
        <div className="flex-[2] min-w-0 space-y-3">
          {/* AI Assistant */}
          <SidebarCard title="AI Assistant" icon={Sparkles}>
            <div className="space-y-3">
              {/* Target toggle */}
              <div className="flex rounded-lg overflow-hidden border border-card-border">
                <button
                  onClick={() => setAiTarget('description')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    aiTarget === 'description' ? 'bg-accent text-white' : 'bg-input text-muted hover:text-foreground'
                  }`}
                >
                  Description
                </button>
                <button
                  onClick={() => setAiTarget('backstory')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    aiTarget === 'backstory' ? 'bg-accent text-white' : 'bg-input text-muted hover:text-foreground'
                  }`}
                >
                  Backstory
                </button>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg overflow-hidden border border-card-border">
                <button
                  onClick={() => setAiMode('generate')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    aiMode === 'generate' ? 'bg-white/10 text-white' : 'bg-input text-muted hover:text-foreground'
                  }`}
                >
                  Generate
                </button>
                <button
                  onClick={() => setAiMode('refine')}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    aiMode === 'refine' ? 'bg-white/10 text-white' : 'bg-input text-muted hover:text-foreground'
                  }`}
                >
                  Refine
                </button>
              </div>

              <p className="text-xs text-muted">
                {aiMode === 'generate'
                  ? `Generate a ${aiTarget} from the name and brief description.`
                  : `Refine the existing ${aiTarget} based on your instructions.`}
              </p>

              <textarea
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                placeholder={
                  aiTarget === 'description'
                    ? 'e.g. Lean into the mystical side, make it feel ancient and otherworldly…'
                    : 'e.g. Give them a tragic origin tied to a lost civilization. Keep it mysterious.'
                }
                rows={3}
                className="w-full bg-input border border-card-border rounded-xl px-3 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
              />

              {aiError && (
                <p className="text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle size={12} />
                  {aiError}
                </p>
              )}

              <button
                onClick={handleAIGenerate}
                disabled={aiLoading || !aiInstructions.trim()}
                className="w-full bg-accent hover:bg-accent-dark text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {aiLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {aiMode === 'generate' ? 'Generating…' : 'Refining…'}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    {aiMode === 'generate' ? `Generate ${aiTarget}` : `Refine ${aiTarget}`}
                  </>
                )}
              </button>
            </div>
          </SidebarCard>

          {/* Knowledge Bases — Presence only */}
          {agent.type?.toLowerCase() !== 'worker' && (
            <SidebarCard title="Knowledge Bases" icon={Brain}>
              <p className="text-xs text-muted mb-3">Select one or more KBs for this agent to draw from.</p>
              {allKBs.length === 0 ? (
                <p className="text-xs text-muted/60 italic">No knowledge bases available.</p>
              ) : (
                <div className="space-y-1.5">
                  {allKBs.map((kb) => {
                    const checked = selectedKBIds.includes(kb.id)
                    return (
                      <label
                        key={kb.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          checked
                            ? 'bg-accent/10 border border-accent/30'
                            : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedKBIds((prev) =>
                              prev.includes(kb.id) ? prev.filter((x) => x !== kb.id) : [...prev, kb.id]
                            )
                          }
                          className="accent-accent"
                        />
                        <span className={`text-sm ${checked ? 'text-white' : 'text-muted'}`}>{kb.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </SidebarCard>
          )}

          {/* System Prompt */}
          <SidebarCard title="System Prompt" icon={MessageSquareCode}>
            <p className="text-xs text-muted mb-3">Assign one prompt to govern this agent&apos;s behaviour.</p>
            <select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              className="w-full bg-input border border-card-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
            >
              <option value="">— No prompt —</option>
              {allPrompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </SidebarCard>

          {/* Signals */}
          <SidebarCard title="Signals" icon={Activity}>
            <p className="text-xs text-muted mb-4">Enable signals and set the starting value for this agent.</p>
            <div className="space-y-3">
              {ALL_SIGNALS.map((sig) => {
                const active = activeSignals.find((s) => s.signalId === sig.signalId)
                return (
                  <div key={sig.signalId}>
                    <div className="flex items-center gap-2.5 mb-1">
                      <button
                        type="button"
                        onClick={() => toggleSignal(sig)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0 transition-opacity ${
                          active ? 'opacity-100' : 'opacity-25'
                        }`}
                        style={{ backgroundColor: sig.color }}
                      >
                        {sig.letter}
                      </button>
                      <span className={`text-sm flex-1 ${active ? 'text-white' : 'text-muted'}`}>{sig.name}</span>
                      {active && <span className="text-xs font-mono text-accent w-6 text-right">{active.value}</span>}
                    </div>
                    {active && (
                      <div className="pl-[38px]">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={active.value}
                          onChange={(e) => setSignalValue(sig.signalId, Number(e.target.value))}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                          style={{
                            accentColor: sig.color,
                            background: `linear-gradient(to right, ${sig.color} ${active.value}%, rgba(255,255,255,0.1) ${active.value}%)`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SidebarCard>

          {/* Save sidebar button */}
          <button
            onClick={handleSaveSidebar}
            disabled={sidebarSaving}
            className="w-full bg-white/[0.06] hover:bg-white/[0.1] border border-card-border hover:border-accent/40 text-foreground font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {sidebarSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {sidebarSaving ? 'Saving…' : 'Save Configuration'}
          </button>
          {sidebarFlash && (
            <p className="text-xs text-green-400 text-center flex items-center justify-center gap-1">
              <CheckCircle size={12} />
              Configuration saved!
            </p>
          )}
        </div>
      </div>

      {/* Remove member confirm */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMemberToRemove(null)} />
          <div className="relative bg-card border border-card-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Remove Member?</h3>

            {/* Member preview */}
            <div className="flex items-center gap-3 bg-white/[0.03] border border-card-border rounded-xl px-4 py-3 mb-5">
              <div className="w-9 h-9 rounded-full border border-accent/25 bg-white/[0.04] flex items-center justify-center shrink-0">
                <UserRound size={16} className="text-accent/60" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{memberToRemove.name}</p>
                <p className="text-xs text-muted/60 truncate">{memberToRemove.email}</p>
              </div>
            </div>

            <p className="text-muted text-sm mb-5">
              This member will be removed from this agent. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setMemberToRemove(null)}
                className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-card-border text-foreground font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveMember}
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash2 size={13} />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-card border border-card-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Agent?</h3>
            <p className="text-muted text-sm mb-5">
              &ldquo;{agent.name}&rdquo; will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-card-border text-foreground font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}