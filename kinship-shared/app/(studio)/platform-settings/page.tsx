'use client'

import { useState, useEffect, useRef } from 'react'
import { useStudio } from '@/lib/studio-context'
import { deletePlatform } from '@/hooks/useApi'
import { Card, ConfirmDialog, Spinner } from '@/components/UI'
import {
  LayoutDashboard,
  Palette,
  Activity,
  UserRound,
  Users,
  CheckCircle,
  FolderOpen,
  TriangleAlert,
  Fingerprint,
  BarChart2,
  Library,
  Compass,
  Brain,
  Zap,
  ArrowUpRight,
  Save,
  Check,
  AlertCircle,
  Copy,
  Type,
  Heading,
  MessageSquareCode,
  UserPlus,
  UserMinus,
  Globe,
  Plus,
  MoreHorizontal,
  Archive,
  LogOut,
  Trash2,
  X,
  LockKeyhole,
  EyeOff,
  Clock,
  Loader2,
} from 'lucide-react'

// ─── Signals (HEARTS) ────────────────────────────────────────────────────────
const ALL_SIGNALS = [
  { signalId: 'health', name: 'Health', letter: 'H', color: '#9b7bb8' },
  { signalId: 'empathy', name: 'Empathy', letter: 'E', color: '#e07b4c' },
  { signalId: 'aspiration', name: 'Aspiration', letter: 'A', color: '#4cada8' },
  { signalId: 'resilience', name: 'Resilience', letter: 'R', color: '#5b8db8' },
  { signalId: 'thinking', name: 'Thinking', letter: 'T', color: '#c9a227' },
  {
    signalId: 'self-identity',
    name: 'Self-Identity',
    letter: 'Si',
    color: '#5c5a8d',
  },
  { signalId: 'social', name: 'Social', letter: 'So', color: '#d4737a' },
]

// ─── Themes ──────────────────────────────────────────────────────────────────
const THEMES = [
  {
    id: 'kinship',
    name: 'Kinship',
    description: 'Deep navy with orange accents — the default',
    accent: '#eb8000',
    bg: '#050824',
    surface: '#100e59',
    swatches: ['#eb8000', '#050824', '#100e59', '#c96d00'],
  },
  {
    id: 'twilight',
    name: 'Twilight',
    description: 'Deep blues and teals',
    accent: '#4CADA8',
    bg: '#0f1117',
    surface: '#1a1d28',
    swatches: ['#4CADA8', '#0f1117', '#1a1d28', '#6ee7e0'],
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm ambers and burnt oranges',
    accent: '#f97316',
    bg: '#120a06',
    surface: '#1e1108',
    swatches: ['#f97316', '#120a06', '#1e1108', '#fb923c'],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Vibrant purples and electric greens',
    accent: '#a855f7',
    bg: '#0d0a18',
    surface: '#150f28',
    swatches: ['#a855f7', '#0d0a18', '#150f28', '#c084fc'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Earthy greens and deep wood tones',
    accent: '#22c55e',
    bg: '#080e0a',
    surface: '#0e1812',
    swatches: ['#22c55e', '#080e0a', '#0e1812', '#4ade80'],
  },
]

// ─── Mock Users ──────────────────────────────────────────────────────────────
const INITIAL_USERS = [
  {
    id: 'u1',
    name: 'Platform Owner',
    email: 'owner@kinship.studio',
    role: 'owner',
    joined: 'Jan 15, 2024',
    initials: 'PO',
    color: '#eb8000',
  },
]

const HANDLE_RE = /^[a-zA-Z0-9_.]*$/
const HANDLE_MAX = 50

type Tab = 'overview' | 'theme' | 'signals' | 'presence' | 'users' | 'danger'

const TABS: {
  id: Tab
  label: string
  icon: React.ElementType
  danger?: boolean
}[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'signals', label: 'Signals', icon: Activity },
  { id: 'presence', label: 'Presence', icon: UserRound },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'danger', label: 'Danger Zone', icon: TriangleAlert, danger: true },
]

// ─── Shared sub-components ───────────────────────────────────────────────────
function SectionHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {subtitle && <p className="text-muted text-sm mt-0.5">{subtitle}</p>}
    </div>
  )
}

function SaveBar({
  saving,
  flash,
  onSave,
  label = 'Save Changes',
}: {
  saving: boolean
  flash: boolean
  onSave: () => void
  label?: string
}) {
  return (
    <div className="flex items-center gap-3 mt-5">
      <button
        onClick={onSave}
        disabled={saving}
        className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2 rounded-full transition-colors flex items-center gap-2 text-sm disabled:opacity-60"
      >
        {saving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Save size={14} />
        )}
        {saving ? 'Saving…' : label}
      </button>
      {flash && (
        <p className="text-xs text-green-400 flex items-center gap-1">
          <Check size={12} />
          Saved!
        </p>
      )}
    </div>
  )
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-6 py-4 border-b border-card-border last:border-0">
      <div className="w-[200px] shrink-0 pt-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && (
          <p className="text-xs text-muted mt-0.5 leading-snug">{hint}</p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PlatformSettingsPage() {
  const { currentPlatform, refetchPlatforms } = useStudio()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // ── Identity ──
  const [platformName, setPlatformName] = useState('')
  const [platformHandle, setPlatformHandle] = useState('')
  const [handleError, setHandleError] = useState('')
  const [description, setDescription] = useState('')
  const [platformIcon, setPlatformIcon] = useState('🎮')
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identityFlash, setIdentityFlash] = useState(false)

  // ── Theme ──
  const [selectedTheme, setSelectedTheme] = useState('kinship')
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeFlash, setThemeFlash] = useState(false)

  // ── Signals ──
  const [enabledSignals, setEnabledSignals] = useState<string[]>(
    ALL_SIGNALS.map((s) => s.signalId)
  )
  const [signalsSaving, setSignalsSaving] = useState(false)
  const [signalsFlash, setSignalsFlash] = useState(false)

  // ── Presence ──
  const [platformPromptId, setPlatformPromptId] = useState('')
  const [promptMode, setPromptMode] = useState<'select' | 'custom'>('select')
  const [customSystemPrompt, setCustomSystemPrompt] = useState('')
  const [presenceSaving, setPresenceSaving] = useState(false)
  const [presenceFlash, setPresenceFlash] = useState(false)

  // ── Users ──
  const [users, setUsers] = useState(INITIAL_USERS)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')

  // ── Danger ──
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  function triggerFlash(key: string, setter: (v: boolean) => void) {
    setter(true)
    if (flashTimers.current[key]) clearTimeout(flashTimers.current[key])
    flashTimers.current[key] = setTimeout(() => setter(false), 2500)
  }

  // Load platform data
  useEffect(() => {
    if (currentPlatform) {
      setPlatformName(currentPlatform.name || '')
      setPlatformHandle(currentPlatform.slug || '')
      setDescription(currentPlatform.description || '')
      setPlatformIcon(currentPlatform.icon || '🎮')
    }
  }, [currentPlatform])

  // ── Save handlers ──
  async function saveIdentity() {
    if (platformHandle && !HANDLE_RE.test(platformHandle)) {
      setHandleError('Only letters, numbers, _ and . allowed')
      return
    }
    setIdentitySaving(true)
    await new Promise((r) => setTimeout(r, 600))
    setIdentitySaving(false)
    triggerFlash('identity', setIdentityFlash)
  }

  async function saveTheme() {
    setThemeSaving(true)
    await new Promise((r) => setTimeout(r, 500))
    setThemeSaving(false)
    triggerFlash('theme', setThemeFlash)
  }

  async function saveSignals() {
    setSignalsSaving(true)
    await new Promise((r) => setTimeout(r, 500))
    setSignalsSaving(false)
    triggerFlash('signals', setSignalsFlash)
  }

  async function savePresence() {
    setPresenceSaving(true)
    await new Promise((r) => setTimeout(r, 600))
    setPresenceSaving(false)
    triggerFlash('presence', setPresenceFlash)
  }

  function updateUserRole(id: string, role: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)))
  }

  function removeUser(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return
    setUsers((prev) => [
      ...prev,
      {
        id: `u${Date.now()}`,
        name: inviteEmail.split('@')[0],
        email: inviteEmail,
        role: inviteRole,
        joined: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        initials: inviteEmail.slice(0, 2).toUpperCase(),
        color: '#64748b',
      },
    ])
    setInviteEmail('')
    setShowInvite(false)
  }

  const handleDelete = async () => {
    if (!currentPlatform) return
    setDeleting(true)
    try {
      await deletePlatform(currentPlatform.id)
      refetchPlatforms()
      setConfirmDelete(false)
    } catch {
      // error handled by UI
    } finally {
      setDeleting(false)
    }
  }

  // ── Empty state ──
  if (!currentPlatform) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-2xl bg-accent/15 border border-card-border flex items-center justify-center mb-4">
          <span className="text-4xl">⚙️</span>
        </div>
        <h3 className="text-white font-bold text-lg mb-1">
          No platform selected
        </h3>
        <p className="text-muted text-sm max-w-sm">
          Select a platform to view its settings.
        </p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab: Overview
  // ─────────────────────────────────────────────────────────────────────────────
  function renderOverview() {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Overview"
          subtitle="Platform identity and live metrics"
        />

        {/* Identity */}
        <div className="bg-card border border-card-border rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2 text-sm">
            <Fingerprint size={16} className="text-accent" />
            Platform Identity
          </h3>
          <div className="divide-y divide-card-border">
            <FieldRow label="Platform Name">
              <input
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                className="w-full bg-input border border-card-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50"
              />
            </FieldRow>

            <FieldRow
              label="Handle"
              hint="@ identifier — letters, numbers, _ and . only, max 50"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-muted text-sm shrink-0">@</span>
                <div className="flex-1 relative">
                  <input
                    value={platformHandle}
                    onChange={(e) => {
                      const cleaned = e.target.value
                        .replace(/[^a-zA-Z0-9_.]/g, '')
                        .slice(0, HANDLE_MAX)
                      setPlatformHandle(cleaned)
                      setHandleError('')
                    }}
                    maxLength={HANDLE_MAX}
                    className={`w-full bg-input border rounded-xl px-3 py-2 text-sm text-foreground font-mono focus:outline-none pr-16 ${
                      handleError
                        ? 'border-red-500/50 focus:border-red-500/70'
                        : 'border-card-border focus:border-accent/50'
                    }`}
                  />
                  <span
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums pointer-events-none ${
                      platformHandle.length >= HANDLE_MAX
                        ? 'text-red-400'
                        : 'text-muted'
                    }`}
                  >
                    {platformHandle.length}/{HANDLE_MAX}
                  </span>
                </div>
              </div>
              {handleError && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} />
                  {handleError}
                </p>
              )}
            </FieldRow>

            <FieldRow label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-input border border-card-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50 resize-none"
              />
            </FieldRow>

            <FieldRow label="Icon" hint="Emoji or 1–2 char symbol">
              <input
                value={platformIcon}
                onChange={(e) => setPlatformIcon(e.target.value)}
                maxLength={4}
                className="w-20 bg-input border border-card-border rounded-xl px-3 py-2 text-2xl text-center focus:outline-none focus:border-accent/50"
              />
            </FieldRow>

            <FieldRow label="Platform ID" hint="Read-only system identifier">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-input border border-card-border rounded-xl px-3 py-2 text-xs text-muted font-mono truncate">
                  {currentPlatform!.id}
                </code>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(currentPlatform!.id)
                  }
                  className="shrink-0 text-muted hover:text-accent transition-colors p-2 rounded-lg hover:bg-white/[0.05]"
                  title="Copy ID"
                >
                  <Copy size={14} />
                </button>
              </div>
            </FieldRow>
          </div>
          <SaveBar
            saving={identitySaving}
            flash={identityFlash}
            onSave={saveIdentity}
          />
        </div>

        {/* Metrics */}
        <div>
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
            <BarChart2 size={16} className="text-accent" />
            Platform Metrics
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: 'Assets',
                value: String((currentPlatform as any)?.assets_count ?? 0),
                icon: Library,
                color: '#4CADA8',
              },
              {
                label: 'Experiences',
                value: String((currentPlatform as any)?.games_count ?? 0),
                icon: Compass,
                color: '#f97316',
              },
              {
                label: 'Actors',
                value: String((currentPlatform as any)?.actors_count ?? 0),
                icon: UserRound,
                color: '#a855f7',
              },
              {
                label: 'Knowledge Bases',
                value: String(
                  (currentPlatform as any)?.knowledge_bases_count ?? 0
                ),
                icon: Brain,
                color: '#3b82f6',
              },
              {
                label: 'Signals Active',
                value: `${enabledSignals.length} / ${ALL_SIGNALS.length}`,
                icon: Activity,
                color: '#22c55e',
              },
              {
                label: 'Projects',
                value: String((currentPlatform as any)?.projects_count ?? 0),
                icon: FolderOpen,
                color: '#f59e0b',
              },
              {
                label: 'Tokens Used',
                value: (
                  (currentPlatform as any)?.tokens_used ?? 0
                ).toLocaleString(),
                icon: Zap,
                color: '#ec4899',
              },
              {
                label: 'API Calls',
                value: (
                  (currentPlatform as any)?.api_calls ?? 0
                ).toLocaleString(),
                icon: ArrowUpRight,
                color: '#94a3b8',
              },
            ].map((m) => {
              const IconComponent = m.icon
              return (
                <div
                  key={m.label}
                  className="bg-card border border-card-border rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${m.color}22` }}
                    >
                      <IconComponent size={13} style={{ color: m.color }} />
                    </div>
                    <span className="text-xs text-muted">{m.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {m.value}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab: Theme
  // ─────────────────────────────────────────────────────────────────────────────
  function renderTheme() {
    const current = THEMES.find((t) => t.id === selectedTheme) ?? THEMES[0]
    return (
      <div>
        <SectionHeader
          title="Theme"
          subtitle="Choose colours applied platform-wide"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-6">
          {THEMES.map((theme) => {
            const active = selectedTheme === theme.id
            return (
              <button
                key={theme.id}
                onClick={() => setSelectedTheme(theme.id)}
                className={`relative text-left p-5 rounded-xl border transition-all ${
                  active
                    ? 'border-accent/50 bg-accent/5 shadow-[0_0_0_1px_rgba(235,128,0,0.2)]'
                    : 'border-card-border bg-card hover:border-white/20 hover:bg-white/[0.03]'
                }`}
              >
                {active && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <Check size={11} className="text-white" />
                  </div>
                )}
                <div className="flex gap-1.5 mb-3">
                  {theme.swatches.map((s, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded-full border border-white/10"
                      style={{ backgroundColor: s }}
                    />
                  ))}
                </div>
                <p className="text-white font-semibold text-sm">{theme.name}</p>
                <p className="text-xs text-muted mt-0.5">{theme.description}</p>
              </button>
            )
          })}
        </div>

        {/* Preview strip */}
        <div
          className="rounded-xl p-6 border border-white/10 mb-5"
          style={{ backgroundColor: current.surface }}
        >
          <p
            className="text-xs uppercase tracking-widest mb-3 font-semibold"
            style={{ color: `${current.accent}90` }}
          >
            Preview — {current.name}
          </p>
          <p className="text-white text-2xl font-bold mb-1">Sample Heading</p>
          <p
            className="text-sm mb-4"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Supporting body copy that demonstrates readability at comfortable
            sizes.
          </p>
          <div className="flex gap-3">
            <button
              className="text-sm font-semibold px-5 py-2 rounded-full text-white"
              style={{ backgroundColor: current.accent }}
            >
              Primary Action
            </button>
            <button
              className="text-sm font-medium px-5 py-2 rounded-full border"
              style={{
                color: current.accent,
                borderColor: `${current.accent}40`,
              }}
            >
              Secondary
            </button>
          </div>
        </div>

        <SaveBar
          saving={themeSaving}
          flash={themeFlash}
          onSave={saveTheme}
          label="Apply Theme"
        />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab: Signals (HEARTS)
  // ─────────────────────────────────────────────────────────────────────────────
  function renderSignals() {
    return (
      <div>
        <SectionHeader
          title="Signals (HEARTS)"
          subtitle="Select which HEARTS facets are enabled platform-wide"
        />

        <div className="bg-card border border-card-border rounded-xl overflow-hidden mb-3">
          {ALL_SIGNALS.map((sig) => {
            const active = enabledSignals.includes(sig.signalId)
            return (
              <div
                key={sig.signalId}
                className="flex items-center gap-4 px-5 py-4 border-b border-card-border last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                <button
                  onClick={() =>
                    setEnabledSignals((prev) =>
                      prev.includes(sig.signalId)
                        ? prev.filter((s) => s !== sig.signalId)
                        : [...prev, sig.signalId]
                    )
                  }
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 transition-all ${
                    active ? 'opacity-100 scale-100' : 'opacity-25 scale-95'
                  }`}
                  style={{ backgroundColor: sig.color }}
                >
                  {sig.letter}
                </button>
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium transition-colors ${
                      active ? 'text-white' : 'text-muted'
                    }`}
                  >
                    {sig.name}
                  </p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    active
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-white/5 text-muted'
                  }`}
                >
                  {active ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted mb-5">
          {enabledSignals.length} of {ALL_SIGNALS.length} signals enabled
          platform-wide
        </p>

        <SaveBar
          saving={signalsSaving}
          flash={signalsFlash}
          onSave={saveSignals}
        />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab: Presence
  // ─────────────────────────────────────────────────────────────────────────────
  function renderPresence() {
    return (
      <div>
        <SectionHeader
          title="Platform Presence"
          subtitle="System prompt and AI configuration available across all games"
        />

        <div className="space-y-4">
          {/* System Prompt */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-white font-semibold mb-1 text-sm flex items-center gap-2">
              <MessageSquareCode size={15} className="text-accent" />
              Platform System Prompt
            </h3>
            <p className="text-xs text-muted mb-4">
              Applies to all AI interactions platform-wide unless overridden by
              a game or NPC.
            </p>

            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-card-border mb-4 w-fit">
              {(['select', 'custom'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPromptMode(m)}
                  className={`px-4 py-1.5 text-xs font-medium transition-colors capitalize ${
                    promptMode === m
                      ? 'bg-accent text-white'
                      : 'bg-input text-muted hover:text-foreground'
                  }`}
                >
                  {m === 'select' ? 'Select Existing' : 'Write Custom'}
                </button>
              ))}
            </div>

            {promptMode === 'select' ? (
              <select
                value={platformPromptId}
                onChange={(e) => setPlatformPromptId(e.target.value)}
                className="w-full bg-input border border-card-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
              >
                <option value="">— No platform prompt —</option>
                <option value="default">Default Kinship Prompt</option>
              </select>
            ) : (
              <textarea
                value={customSystemPrompt}
                onChange={(e) => setCustomSystemPrompt(e.target.value)}
                rows={6}
                placeholder="e.g. You are an assistant on the Kinship platform. Be helpful, curious, and engaging. Always stay within the context of the platform's educational goals."
                className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 resize-y font-mono"
              />
            )}
          </div>
        </div>

        <SaveBar
          saving={presenceSaving}
          flash={presenceFlash}
          onSave={savePresence}
        />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab: Users
  // ─────────────────────────────────────────────────────────────────────────────
  function renderUsers() {
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-white">Users</h2>
            <p className="text-muted text-sm mt-0.5">
              {users.length} member{users.length !== 1 ? 's' : ''} on this
              platform
            </p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="bg-accent hover:bg-accent-dark text-white font-semibold px-4 py-2 rounded-full transition-colors flex items-center gap-2 text-sm"
          >
            <UserPlus size={14} />
            Invite User
          </button>
        </div>

        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_120px_80px_36px] gap-4 px-5 py-3 border-b border-card-border">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              User
            </p>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider text-center">
              Role
            </p>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider text-center hidden sm:block">
              Joined
            </p>
            <div />
          </div>

          {users.map((user) => (
            <div
              key={user.id}
              className="grid grid-cols-[1fr_120px_80px_36px] gap-4 items-center px-5 py-3.5 border-b border-card-border last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                  style={{ backgroundColor: user.color }}
                >
                  {user.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-muted truncate">{user.email}</p>
                </div>
              </div>

              <div className="flex justify-center">
                {user.role === 'owner' ? (
                  <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                    Owner
                  </span>
                ) : (
                  <select
                    value={user.role}
                    onChange={(e) => updateUserRole(user.id, e.target.value)}
                    className="bg-input border border-card-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-accent/50 w-full"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                )}
              </div>

              <div className="text-xs text-muted text-center hidden sm:block">
                {user.joined}
              </div>

              <div className="flex justify-center">
                {user.role !== 'owner' && (
                  <button
                    onClick={() => removeUser(user.id)}
                    className="text-muted hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/5"
                    title="Remove user"
                  >
                    <UserMinus size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Invite modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowInvite(false)}
            />
            <div className="relative bg-card border border-card-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-lg font-semibold text-white mb-1">
                Invite User
              </h3>
              <p className="text-muted text-sm mb-4">
                They&apos;ll receive an email to join this platform.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    autoFocus
                    placeholder="user@example.com"
                    className="w-full bg-input border border-card-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full bg-input border border-card-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent/50"
                  >
                    <option value="admin">
                      Admin — can manage platform settings
                    </option>
                    <option value="member">
                      Member — can create and edit content
                    </option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowInvite(false)}
                  className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-card-border text-foreground font-medium px-4 py-2.5 rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim()}
                  className="flex-1 bg-accent hover:bg-accent-dark text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
                >
                  Send Invite
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tab: Danger
  // ─────────────────────────────────────────────────────────────────────────────
  function renderDanger() {
    return (
      <div>
        <SectionHeader
          title="Danger Zone"
          subtitle="Irreversible platform operations — proceed with caution"
        />

        <div className="border border-red-500/30 rounded-xl divide-y divide-red-500/20 overflow-hidden">
          <div className="flex items-start justify-between gap-6 p-6">
            <div>
              <p className="text-white font-semibold text-sm">
                Transfer Ownership
              </p>
              <p className="text-muted text-xs mt-1 max-w-sm">
                Transfer platform ownership to another admin. You will lose
                owner privileges.
              </p>
            </div>
            <button className="shrink-0 bg-white/[0.06] border border-white/15 text-foreground hover:bg-white/[0.1] font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              Transfer
            </button>
          </div>

          <div className="flex items-start justify-between gap-6 p-6">
            <div>
              <p className="text-white font-semibold text-sm">
                Archive Platform
              </p>
              <p className="text-muted text-xs mt-1 max-w-sm">
                Disables all public access and pauses AI interactions. Platform
                data and settings are fully preserved.
              </p>
            </div>
            <button className="shrink-0 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 font-medium px-4 py-2 rounded-lg text-sm transition-colors">
              Archive
            </button>
          </div>

          <div className="flex items-start justify-between gap-6 p-6">
            <div>
              <p className="text-white font-semibold text-sm">
                Delete Platform
              </p>
              <p className="text-muted text-xs mt-1 max-w-sm">
                Permanently deletes all data: assets, NPCs, knowledge bases,
                games, and content.
                <strong className="text-red-400">
                  {' '}
                  This cannot be undone.
                </strong>
              </p>
            </div>
            <button
              onClick={() => setConfirmDelete(true)}
              className="shrink-0 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Delete Platform
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <h1 className="text-3xl font-bold text-white">Platform Settings</h1>
        <p className="text-muted mt-1 flex items-center gap-2 text-sm flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="text-lg">{platformIcon}</span>
            {platformName || currentPlatform!.name}
          </span>
          <span className="text-muted/30">·</span>
          <span className="font-mono text-accent/70">
            @{platformHandle || currentPlatform!.slug || '—'}
          </span>
          <span className="text-muted/30">·</span>
          <span className="font-mono text-xs text-muted/50">
            {currentPlatform!.id.slice(0, 8)}…
          </span>
        </p>
      </div>

      {/* Two-column layout: nav + content */}
      <div className="flex gap-6 items-start">
        {/* Left nav */}
        <nav className="w-[200px] shrink-0 space-y-1 sticky top-6">
          {TABS.map((tab) => {
            const isDanger = tab.danger ?? false
            const isActive = activeTab === tab.id
            const IconComponent = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                  isDanger
                    ? isActive
                      ? 'bg-red-500/10 text-red-400 border-red-500/30'
                      : 'text-red-400/40 hover:text-red-400 hover:bg-red-500/5 border-transparent'
                    : isActive
                      ? 'bg-accent/15 text-accent border-accent/25'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05] border-transparent'
                } ${tab.id === 'danger' ? 'mt-3' : ''}`}
              >
                <IconComponent size={16} />
                <span className="flex-1 text-left">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Content pane */}
        <div className="flex-1 min-w-0">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'theme' && renderTheme()}
          {activeTab === 'signals' && renderSignals()}
          {activeTab === 'presence' && renderPresence()}
          {activeTab === 'users' && renderUsers()}
          {activeTab === 'danger' && renderDanger()}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${currentPlatform!.name}?`}
        message="This will permanently delete this platform and all its games, assets, and content. This cannot be undone."
        confirmLabel="Delete Platform"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
