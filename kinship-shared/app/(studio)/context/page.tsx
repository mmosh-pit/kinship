'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { useAuth } from '@/lib/auth-context'
import {
  listContextsWithNested,
  listAccessibleContextsWithPermissions,
  createContext as apiCreateContext,
  createNestedContext as apiCreateNestedContext,
  deleteContext as apiDeleteContext,
  deleteNestedContext as apiDeleteNestedContext,
  type Context,
  type ContextWithNested,
  type ContextWithNestedAndPermissions,
  type NestedContext,
  type VisibilityLevel,
} from '@/lib/context-api'

// ─────────────────────────────────────────────────────────────────────────────
// Types for Presences (Agents API)
// ─────────────────────────────────────────────────────────────────────────────

interface Presence {
  id: string
  name: string
  handle: string | null
  type: string
  status: string
  description: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Types for Knowledge Bases
// ─────────────────────────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string
  name: string
  namespace: string
  description: string | null
  contentType: string | null
  itemCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Types for System Prompts
// ─────────────────────────────────────────────────────────────────────────────

interface SystemPrompt {
  id: string
  name: string
  content: string
  connectedKBId: string | null
  connectedKBName: string | null
  status: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Types for Games (Gatherings)
// ─────────────────────────────────────────────────────────────────────────────

interface Game {
  id: string
  platformId: string
  name: string
  slug: string
  description: string
  icon: string
  status: string
  scenesCount: number
  questsCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// API Configuration
// ─────────────────────────────────────────────────────────────────────────────

const AGENTS_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://192.168.1.30:8000'
const ASSETS_API_URL =
  process.env.NEXT_PUBLIC_ASSETS_API_URL || 'http://192.168.1.30:4000/api/v1'

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Presences from Agents API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPresences(wallet: string): Promise<Presence[]> {
  try {
    const response = await fetch(
      `${AGENTS_API_URL}/api/agents?wallet=${encodeURIComponent(wallet)}&includeWorkers=false`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch presences: ${response.statusText}`)
    }
    const data = await response.json()
    // Filter to only include PRESENCE type agents
    return (data.agents || []).filter((agent: any) => agent.type === 'PRESENCE')
  } catch (error) {
    console.error('Error fetching presences:', error)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Knowledge Bases from API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchKnowledgeBases(wallet: string): Promise<KnowledgeBase[]> {
  try {
    const response = await fetch(
      `${AGENTS_API_URL}/api/knowledge?wallet=${encodeURIComponent(wallet)}`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch knowledge bases: ${response.statusText}`)
    }
    const data = await response.json()
    return data.knowledgeBases || []
  } catch (error) {
    console.error('Error fetching knowledge bases:', error)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch System Prompts from API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSystemPrompts(wallet: string): Promise<SystemPrompt[]> {
  try {
    const response = await fetch(
      `${AGENTS_API_URL}/api/prompts?wallet=${encodeURIComponent(wallet)}`
    )
    if (!response.ok) {
      throw new Error(`Failed to fetch system prompts: ${response.statusText}`)
    }
    const data = await response.json()
    return (data.prompts || []).filter((p: any) => p.status === 'active')
  } catch (error) {
    console.error('Error fetching system prompts:', error)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Games (Gatherings) from Assets API
// ─────────────────────────────────────────────────────────────────────────────

async function fetchGames(platformId?: string): Promise<Game[]> {
  try {
    const url = platformId
      ? `${ASSETS_API_URL}/games?platform_id=${encodeURIComponent(platformId)}`
      : `${ASSETS_API_URL}/games`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch games: ${response.statusText}`)
    }
    const data = await response.json()
    // Transform snake_case to camelCase
    return (data.data || []).map((game: any) => ({
      id: game.id,
      platformId: game.platform_id,
      name: game.name,
      slug: game.slug,
      description: game.description || '',
      icon: game.icon || '🎮',
      status: game.status || 'draft',
      scenesCount: game.scenes_count || 0,
      questsCount: game.quests_count || 0,
    }))
  } catch (error) {
    console.error('Error fetching games:', error)
    return []
  }
}

const VISIBILITY_OPTIONS: {
  value: VisibilityLevel
  label: string
  icon: string
  description: string
  color: string
  enabled: boolean
}[] = [
  {
    value: 'public',
    label: 'Public',
    icon: 'lucide:globe',
    description: 'Anyone can join',
    color: 'text-green-400',
    enabled: true,
  },
  {
    value: 'private',
    label: 'Private',
    icon: 'lucide:lock',
    description: 'Listed, requires code',
    color: 'text-amber-400',
    enabled: false,
  },
  {
    value: 'secret',
    label: 'Secret',
    icon: 'lucide:eye-off',
    description: 'Hidden until code entered',
    color: 'text-red-400',
    enabled: false,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Context Type Options
// ─────────────────────────────────────────────────────────────────────────────

const CONTEXT_TYPES = [
  'Association',
  'Chapter',
  'Committee',
  'Team',
  'Social Group',
  'Network',
  'Clinic',
  'Cohort',
  'Class',
  'Working Group',
  'Conference',
  'Event',
  'Meeting',
  'Course',
  'Community',
  'Project',
  'Platform',
  'Campaign',
  'Coalition',
  'Library',
  'Game',
  'Gathering',
  'Workshop',
  'Other',
] as const

type ContextType = (typeof CONTEXT_TYPES)[number]

// Handle validation
const HANDLE_RE = /^[a-zA-Z0-9_.]*$/
const HANDLE_MAX = 25

// Length validation constants (max only, like Presence/Worker creation)
const NAME_MAX = 25
const DESCRIPTION_MAX = 255

// Validation functions
function validateName(name: string): string | null {
  if (!name) return null
  if (name.length > NAME_MAX) return `Max ${NAME_MAX} characters`
  return null
}

function validateDescription(desc: string): string | null {
  if (!desc) return null
  if (desc.length > DESCRIPTION_MAX) return `Max ${DESCRIPTION_MAX} characters`
  return null
}

function validateHandle(h: string): string | null {
  if (!h) return null
  if (!HANDLE_RE.test(h)) return 'Only letters, numbers, underscores, and periods allowed'
  if (h.length > HANDLE_MAX) return `Max ${HANDLE_MAX} characters`
  return null
}

function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, HANDLE_MAX)
}

function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h) && h.length <= HANDLE_MAX
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Save Draft Storage
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_DRAFT_KEY = 'kinship_platform_draft'
const PROJECT_DRAFT_KEY = 'kinship_project_draft'
const AUTO_SAVE_DEBOUNCE_MS = 500

interface PlatformDraft {
  name: string
  handle: string
  contextType: string
  customType: string
  description: string
  presenceIds: string[]
  visibility: VisibilityLevel
  knowledgeBases: string[]
  instructionIds: string[]
  savedAt: number
}

interface ProjectDraft {
  contextId: string
  name: string
  handle: string
  contextType: string
  customType: string
  description: string
  presenceIds: string[]
  visibility: VisibilityLevel
  knowledgeBases: string[]
  gatherings: string[]
  instructionIds: string[]
  savedAt: number
}

function savePlatformDraft(draft: PlatformDraft): void {
  try { localStorage.setItem(PLATFORM_DRAFT_KEY, JSON.stringify(draft)) } catch {}
}

function loadPlatformDraft(): PlatformDraft | null {
  try {
    const stored = localStorage.getItem(PLATFORM_DRAFT_KEY)
    if (stored) {
      const draft = JSON.parse(stored) as PlatformDraft
      if (Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) return draft
      localStorage.removeItem(PLATFORM_DRAFT_KEY)
    }
  } catch {}
  return null
}

function clearPlatformDraft(): void {
  try { localStorage.removeItem(PLATFORM_DRAFT_KEY) } catch {}
}

function saveProjectDraft(draft: ProjectDraft): void {
  try { localStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify(draft)) } catch {}
}

function loadProjectDraft(contextId: string): ProjectDraft | null {
  try {
    const stored = localStorage.getItem(PROJECT_DRAFT_KEY)
    if (stored) {
      const draft = JSON.parse(stored) as ProjectDraft
      if (draft.contextId === contextId && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) return draft
      localStorage.removeItem(PROJECT_DRAFT_KEY)
    }
  } catch {}
  return null
}

function clearProjectDraft(): void {
  try { localStorage.removeItem(PROJECT_DRAFT_KEY) } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Visibility Selector Component
// ─────────────────────────────────────────────────────────────────────────────

interface VisibilitySelectorProps {
  value: VisibilityLevel
  onChange: (value: VisibilityLevel) => void
}

function VisibilitySelector({ value, onChange }: VisibilitySelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        Visibility
      </label>
      <div className="grid grid-cols-3 gap-2">
        {VISIBILITY_OPTIONS.map((option) => {
          const isDisabled = !option.enabled
          const isSelected = value === option.value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => option.enabled && onChange(option.value)}
              disabled={isDisabled}
              className={`relative px-3 py-3 rounded-xl border text-left transition-all ${
                isDisabled
                  ? 'cursor-not-allowed opacity-100 border-card-border bg-card pointer-events-none select-none'
                  : isSelected
                    ? 'border-accent bg-accent/10 cursor-pointer'
                    : 'border-card-border hover:border-white/30 hover:bg-white/[0.02] cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon
                  icon={option.icon}
                  width={16}
                  height={16}
                  className={
                    isDisabled
                      ? 'text-muted/50'
                      : isSelected
                        ? option.color
                        : 'text-muted'
                  }
                />
                <span
                  className={`text-sm font-medium ${isDisabled ? 'text-muted/50' : isSelected ? 'text-white' : 'text-muted'}`}
                >
                  {option.label}
                </span>
              </div>
              <p
                className={`text-[10px] ${isDisabled ? 'text-muted/40' : 'text-muted'}`}
              >
                {option.description}
              </p>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted/60 mt-2 italic">
        Private and Secret visibility will be available after Codes are set up.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Type Selector Component
// ─────────────────────────────────────────────────────────────────────────────

interface TypeSelectorProps {
  value: string
  customValue: string
  onChange: (value: string) => void
  onCustomChange: (value: string) => void
}

function TypeSelector({ value, customValue, onChange, onCustomChange }: TypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const displayValue = value

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        Type <span className="text-accent">*</span>
      </label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full bg-input border rounded-xl px-4 py-3 text-left flex items-center justify-between transition-colors ${
            isOpen ? 'border-accent/50' : 'border-card-border hover:border-white/30'
          }`}
        >
          <span className={value ? 'text-foreground' : 'text-muted'}>
            {displayValue || 'Select a type...'}
          </span>
          <Icon
            icon={isOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'}
            width={16}
            height={16}
            className="text-muted"
          />
        </button>

        {isOpen && (
          <div className="absolute z-20 w-full mt-2 bg-card border border-card-border rounded-xl shadow-xl max-h-64 overflow-y-auto">
            {CONTEXT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onChange(type)
                  if (type !== 'Other') {
                    onCustomChange('')
                  }
                  setIsOpen(false)
                }}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2 ${
                  value === type
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground hover:bg-white/[0.04]'
                }`}
              >
                {value === type && (
                  <Icon icon="lucide:check" width={14} height={14} className="text-accent" />
                )}
                <span className={value === type ? '' : 'ml-5'}>{type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom type input when "Other" is selected */}
      {value === 'Other' && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-muted mb-1.5">
            Custom Type
          </label>
          <input
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="Enter your custom type..."
            maxLength={50}
            className="w-full bg-input border border-card-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Presence Selector Component
// ─────────────────────────────────────────────────────────────────────────────

interface PresenceMultiSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  presences: Presence[]
  loading?: boolean
}

function PresenceMultiSelector({
  value,
  onChange,
  presences,
  loading,
}: PresenceMultiSelectorProps) {
  function togglePresence(presenceId: string) {
    if (value.includes(presenceId)) {
      onChange(value.filter((id) => id !== presenceId))
    } else {
      onChange([...value, presenceId])
    }
  }

  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Presences
        </label>
        <div className="flex items-center gap-2 text-muted text-sm py-3">
          <Icon
            icon="lucide:loader-2"
            width={16}
            height={16}
            className="animate-spin"
          />
          Loading presences...
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-foreground">
          Presences
        </label>
        <Link
          href="/agents"
          className="text-xs text-accent hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          <Icon icon="lucide:plus" width={12} height={12} />
          Create New
        </Link>
      </div>
      {presences.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-card-border rounded-xl">
          <Icon icon="lucide:bot" width={24} height={24} className="mx-auto mb-2 text-muted" />
          <p className="text-xs text-muted/60 mb-2">
            No presence agents found.
          </p>
          <Link
            href="/agents"
            className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors inline-flex items-center gap-1"
          >
            <Icon icon="lucide:plus" width={12} height={12} />
            Create Presence
          </Link>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {presences.map((presence) => {
            const isSelected = value.includes(presence.id)
            return (
              <button
                key={presence.id}
                type="button"
                onClick={() => togglePresence(presence.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-card-border hover:border-accent/50 hover:bg-white/[0.02]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected ? 'border-accent bg-accent' : 'border-muted'
                  }`}
                >
                  {isSelected && (
                    <Icon
                      icon="lucide:check"
                      width={12}
                      height={12}
                      className="text-white"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground font-medium">
                    {presence.name}
                  </p>
                  {presence.handle && (
                    <p className="text-xs text-muted">@{presence.handle}</p>
                  )}
                </div>
                <Icon
                  icon="lucide:bot"
                  width={16}
                  height={16}
                  className={isSelected ? 'text-accent' : 'text-muted'}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Base Selector Component
// ─────────────────────────────────────────────────────────────────────────────

interface KnowledgeBaseSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  knowledgeBases: KnowledgeBase[]
  loading?: boolean
}

function KnowledgeBaseSelector({
  value,
  onChange,
  knowledgeBases,
  loading,
}: KnowledgeBaseSelectorProps) {
  function toggleKB(kbId: string) {
    if (value.includes(kbId)) {
      onChange(value.filter((id) => id !== kbId))
    } else {
      onChange([...value, kbId])
    }
  }

  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Knowledge Bases <span className="text-accent">*</span>
          
        </label>
        <div className="flex items-center gap-2 text-muted text-sm py-3">
          <Icon
            icon="lucide:loader-2"
            width={16}
            height={16}
            className="animate-spin"
          />
          Loading knowledge bases...
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-foreground">
          Knowledge Bases <span className="text-accent">*</span>
        </label>
        <Link
          href="/knowledge"
          className="text-xs text-accent hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          <Icon icon="lucide:plus" width={12} height={12} />
          Create New
        </Link>
      </div>
      {knowledgeBases.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-card-border rounded-xl">
          <Icon icon="lucide:database" width={24} height={24} className="mx-auto mb-2 text-muted" />
          <p className="text-xs text-muted/60 mb-2">
            No knowledge bases found.
          </p>
          <Link
            href="/knowledge"
            className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors inline-flex items-center gap-1"
          >
            <Icon icon="lucide:plus" width={12} height={12} />
            Create Knowledge Base
          </Link>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {knowledgeBases.map((kb) => {
            const isSelected = value.includes(kb.id)
            return (
              <button
                key={kb.id}
                type="button"
                onClick={() => toggleKB(kb.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-card-border hover:border-accent/50 hover:bg-white/[0.02]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected ? 'border-accent bg-accent' : 'border-muted'
                  }`}
                >
                  {isSelected && (
                    <Icon
                      icon="lucide:check"
                      width={12}
                      height={12}
                      className="text-white"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-foreground'}`}
                  >
                    {kb.name}
                  </p>
                  <p className="text-xs text-muted">
                    {kb.description ||
                      `${kb.itemCount} item${kb.itemCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt Selector Component
// ─────────────────────────────────────────────────────────────────────────────

interface PromptSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  prompts: SystemPrompt[]
  loading?: boolean
}

function PromptSelector({
  value,
  onChange,
  prompts,
  loading,
}: PromptSelectorProps) {
  function togglePrompt(promptId: string) {
    if (value.includes(promptId)) {
      onChange(value.filter((id) => id !== promptId))
    } else {
      onChange([...value, promptId])
    }
  }

  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Instructions (System Prompts) <span className="text-accent">*</span>
          
        </label>
        <div className="flex items-center gap-2 text-muted text-sm py-3">
          <Icon
            icon="lucide:loader-2"
            width={16}
            height={16}
            className="animate-spin"
          />
          Loading system prompts...
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-foreground">
          Instructions (System Prompts) <span className="text-accent">*</span>
        </label>
        <Link
          href="/prompts"
          className="text-xs text-accent hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          <Icon icon="lucide:plus" width={12} height={12} />
          Create New
        </Link>
      </div>
      {prompts.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-card-border rounded-xl">
          <Icon icon="lucide:file-text" width={24} height={24} className="mx-auto mb-2 text-muted" />
          <p className="text-xs text-muted/60 mb-2">
            No system prompts found.
          </p>
          <Link
            href="/prompts"
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors inline-flex items-center gap-1"
          >
            <Icon icon="lucide:plus" width={12} height={12} />
            Create System Prompt
          </Link>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {prompts.map((prompt) => {
            const isSelected = value.includes(prompt.id)
            // Truncate content for preview
            const preview =
              prompt.content.length > 80
                ? prompt.content.substring(0, 80) + '...'
                : prompt.content
            return (
              <button
                key={prompt.id}
                type="button"
                onClick={() => togglePrompt(prompt.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'border-amber-400 bg-amber-400/10'
                    : 'border-card-border hover:border-amber-400/50 hover:bg-white/[0.02]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    isSelected
                      ? 'border-amber-400 bg-amber-400'
                      : 'border-muted'
                  }`}
                >
                  {isSelected && (
                    <Icon
                      icon="lucide:check"
                      width={12}
                      height={12}
                      className="text-white"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-foreground'}`}
                  >
                    {prompt.name}
                  </p>
                  <p className="text-xs text-muted truncate">{preview}</p>
                  {prompt.connectedKBName && (
                    <p className="text-xs text-amber-400/70 mt-0.5 flex items-center gap-1">
                      <Icon icon="lucide:database" width={10} height={10} />
                      {prompt.connectedKBName}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Gatherings Selector Component (for Projects only)
// ─────────────────────────────────────────────────────────────────────────────

interface GatheringsSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  games: Game[]
  loading?: boolean
}

function GatheringsSelector({
  value,
  onChange,
  games,
  loading,
}: GatheringsSelectorProps) {
  function toggleGathering(gatheringId: string) {
    if (value.includes(gatheringId)) {
      onChange(value.filter((id) => id !== gatheringId))
    } else {
      onChange([...value, gatheringId])
    }
  }

  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Gatherings (Games)
          
        </label>
        <div className="flex items-center gap-2 text-muted text-sm py-3">
          <Icon
            icon="lucide:loader-2"
            width={16}
            height={16}
            className="animate-spin"
          />
          Loading games...
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        Gatherings (Games) <span className="text-accent">*</span>
      </label>
      <p className="text-xs text-muted mb-3">
        Add games and experiences to this nested box
      </p>
      {games.length === 0 ? (
        <p className="text-xs text-muted/60 py-2">
          No games found. Create one in the Games page.
        </p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {games.map((game) => {
            const isSelected = value.includes(game.id)
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => toggleGathering(game.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'border-purple-400 bg-purple-400/10'
                    : 'border-card-border hover:border-purple-400/50 hover:bg-white/[0.02]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-purple-400 bg-purple-400'
                      : 'border-muted'
                  }`}
                >
                  {isSelected && (
                    <Icon
                      icon="lucide:check"
                      width={12}
                      height={12}
                      className="text-white"
                    />
                  )}
                </div>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isSelected ? 'bg-purple-400/20' : 'bg-white/[0.06]'
                  }`}
                >
                  <span className="text-base">{game.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-foreground'}`}
                    >
                      {game.name}
                    </p>
                    <span
                      className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        game.status === 'published'
                          ? 'bg-green-400/20 text-green-400'
                          : 'bg-amber-400/20 text-amber-400'
                      }`}
                    >
                      {game.status}
                    </span>
                  </div>
                  {game.description && (
                    <p className="text-xs text-muted line-clamp-1">
                      {game.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-muted flex items-center gap-1">
                      <Icon icon="lucide:map" width={10} height={10} />
                      {game.scenesCount} scene
                      {game.scenesCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Platform Modal
// ─────────────────────────────────────────────────────────────────────────────

interface CreateContextModalProps {
  onClose: () => void
  onCreate: (context: Context) => void
  wallet: string
}

function CreateContextModal({
  onClose,
  onCreate,
  wallet,
}: CreateContextModalProps) {
  const initialDraft = loadPlatformDraft()

  const [name, setName] = useState(initialDraft?.name || '')
  const [nameTouched, setNameTouched] = useState(false)
  const [handle, setHandle] = useState(initialDraft?.handle || '')
  const [handleTouched, setHandleTouched] = useState(false)
  const [contextType, setContextType] = useState(initialDraft?.contextType || '')
  const [customType, setCustomType] = useState(initialDraft?.customType || '')
  const [description, setDescription] = useState(initialDraft?.description || '')
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [presenceIds, setPresenceIds] = useState<string[]>(initialDraft?.presenceIds || [])
  const [visibility, setVisibility] = useState<VisibilityLevel>(initialDraft?.visibility || 'public')
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>(initialDraft?.knowledgeBases || [])
  const [instructionIds, setInstructionIds] = useState<string[]>(initialDraft?.instructionIds || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-save timer ref
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always-current ref — updated on every render so handleXClose never reads stale closure values
  const latestDraftRef = useRef({ name, handle, contextType, customType, description, presenceIds, visibility, knowledgeBases, instructionIds })
  latestDraftRef.current = { name, handle, contextType, customType, description, presenceIds, visibility, knowledgeBases, instructionIds }

  // Debounced draft save
  useEffect(() => {
    if (!name && !handle && !description) return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      savePlatformDraft({ ...latestDraftRef.current, savedAt: Date.now() })
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current) }
  }, [name, handle, contextType, customType, description, presenceIds, visibility, knowledgeBases, instructionIds])

  // Flush draft immediately and close (used by X button and backdrop)
  function handleXClose() {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    const d = latestDraftRef.current
    if (d.name || d.handle || d.description || d.presenceIds.length > 0) {
      savePlatformDraft({ ...d, savedAt: Date.now() })
    }
    onClose()
  }

  // Fetch presences, knowledge bases, and prompts
  const [presences, setPresences] = useState<Presence[]>([])
  const [presencesLoading, setPresencesLoading] = useState(true)
  const [kbList, setKbList] = useState<KnowledgeBase[]>([])
  const [kbLoading, setKbLoading] = useState(true)
  const [promptList, setPromptList] = useState<SystemPrompt[]>([])
  const [promptsLoading, setPromptsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setPresencesLoading(true)
      setKbLoading(true)
      setPromptsLoading(true)

      const [presenceData, kbData, promptData] = await Promise.all([
        fetchPresences(wallet),
        fetchKnowledgeBases(wallet),
        fetchSystemPrompts(wallet),
      ])

      setPresences(presenceData)
      setPresencesLoading(false)
      setKbList(kbData)
      setKbLoading(false)
      setPromptList(promptData)
      setPromptsLoading(false)
    }
    loadData()
  }, [wallet])

  function onNameChange(val: string) {
    setName(val)
    if (!handleTouched) {
      setHandle(suggestHandle(val))
    }
  }

  function onHandleChange(val: string) {
    const cleaned = val.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, HANDLE_MAX)
    setHandle(cleaned)
    setHandleTouched(true)
  }

  // Validation errors (only max length)
  const nameError = nameTouched ? validateName(name) : null
  const handleError = handleTouched ? validateHandle(handle) : null
  const descriptionError = descriptionTouched ? validateDescription(description) : null

  // Compute the final type value (custom type if "Other" is selected)
  const finalContextType = (contextType === 'Other' ? customType.trim() : contextType).toLowerCase()

  const canSubmit =
    name.trim() &&
    name.length <= NAME_MAX &&
    handle.trim() &&
    isValidHandle(handle) &&
    finalContextType &&
    description.trim() &&
    description.length <= DESCRIPTION_MAX &&
    presenceIds.length > 0 &&
    knowledgeBases.length > 0 &&
    instructionIds.length > 0 &&
    !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Touch all fields to show validation
    setNameTouched(true)
    setHandleTouched(true)
    setDescriptionTouched(true)
    
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      const context = await apiCreateContext({
        name: name.trim(),
        handle: handle.trim(),
        contextType: finalContextType,
        description: description.trim(),
        presenceIds: presenceIds,
        visibility,
        knowledgeBaseIds: knowledgeBases,
        instructionIds: instructionIds,
        createdBy: wallet,
      })

      clearPlatformDraft()
      onCreate(context)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleXClose}
      />
      <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-card-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/15 flex items-center justify-center">
              <Icon
                icon="lucide:building-2"
                width={20}
                height={20}
                className="text-amber-400"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">
                  New Box
                </h2>
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-400">
                  Organization
                </span>
              </div>
              <p className="text-xs text-muted">
                Create an organization-level box
              </p>
            </div>
          </div>
          <button
            onClick={handleXClose}
            className="text-muted hover:text-white transition-colors p-1 cursor-pointer"
          >
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="rounded-xl border border-card-border bg-card/50 p-4 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Basic Information
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Box Name <span className="text-accent">*</span>
                </label>
                <span className={`text-xs tabular-nums ${nameError ? 'text-red-400' : 'text-muted'}`}>
                  {name.length}/{NAME_MAX}
                </span>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={() => setNameTouched(true)}
                placeholder="e.g. Kinship Health, Acme Corp..."
                maxLength={NAME_MAX}
                autoFocus
                className={`w-full bg-input border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${
                  nameError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'
                }`}
              />
              {nameError && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <Icon icon="lucide:alert-circle" width={12} height={12} />
                  {nameError}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Handle <span className="text-accent">*</span>{' '}
                <span className="text-muted font-normal ml-1">
                  (unique · max {HANDLE_MAX})
                </span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-sm select-none">
                  @
                </span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => onHandleChange(e.target.value)}
                  onBlur={() => setHandleTouched(true)}
                  placeholder="kinship_health"
                  maxLength={HANDLE_MAX}
                  className={`w-full bg-input border rounded-xl pl-8 pr-14 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${
                    handleError
                      ? 'border-red-500/50'
                      : 'border-card-border focus:border-accent/50'
                  }`}
                />
                <span
                  className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums ${handleError ? 'text-red-400' : 'text-muted'}`}
                >
                  {handle.length}/{HANDLE_MAX}
                </span>
              </div>
              {handleError && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <Icon icon="lucide:alert-circle" width={12} height={12} />
                  {handleError}
                </p>
              )}
            </div>
            <TypeSelector
              value={contextType}
              customValue={customType}
              onChange={setContextType}
              onCustomChange={setCustomType}
            />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Description <span className="text-accent">*</span>
                </label>
                <span className={`text-xs tabular-nums ${descriptionError ? 'text-red-400' : 'text-muted'}`}>
                  {description.length}/{DESCRIPTION_MAX}
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => setDescriptionTouched(true)}
                placeholder="What is this box for?"
                rows={2}
                maxLength={DESCRIPTION_MAX}
                className={`w-full bg-input border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none text-sm resize-none transition-colors ${
                  descriptionError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'
                }`}
              />
              {descriptionError && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <Icon icon="lucide:alert-circle" width={12} height={12} />
                  {descriptionError}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-card-border bg-card/50 p-4 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Access & Agent
            </div>
            <PresenceMultiSelector
              value={presenceIds}
              onChange={setPresenceIds}
              presences={presences}
              loading={presencesLoading}
            />
            <VisibilitySelector value={visibility} onChange={setVisibility} />
          </div>

          <div className="rounded-xl border border-card-border bg-card/50 p-4 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Knowledge & Behavior
            </div>
            <KnowledgeBaseSelector
              value={knowledgeBases}
              onChange={setKnowledgeBases}
              knowledgeBases={kbList}
              loading={kbLoading}
            />
            <PromptSelector
              value={instructionIds}
              onChange={setInstructionIds}
              prompts={promptList}
              loading={promptsLoading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { clearPlatformDraft(); onClose() }}
              className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-card-border text-foreground font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <Icon
                  icon="lucide:loader-2"
                  width={16}
                  height={16}
                  className="animate-spin"
                />
              ) : (
                <Icon icon="lucide:plus" width={16} height={16} />
              )}
              {loading ? 'Creating…' : 'Create Box'}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Project Modal
// ─────────────────────────────────────────────────────────────────────────────

interface CreateNestedContextModalProps {
  onClose: () => void
  onCreate: (nestedContext: NestedContext) => void
  contextId: string
  contextName: string
  wallet: string
}

function CreateNestedContextModal({
  onClose,
  onCreate,
  contextId,
  contextName,
  wallet,
}: CreateNestedContextModalProps) {
  const initialDraft = loadProjectDraft(contextId)

  const [name, setName] = useState(initialDraft?.name || '')
  const [nameTouched, setNameTouched] = useState(false)
  const [handle, setHandle] = useState(initialDraft?.handle || '')
  const [handleTouched, setHandleTouched] = useState(false)
  const [contextType, setContextType] = useState(initialDraft?.contextType || '')
  const [customType, setCustomType] = useState(initialDraft?.customType || '')
  const [description, setDescription] = useState(initialDraft?.description || '')
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [presenceIds, setPresenceIds] = useState<string[]>(initialDraft?.presenceIds || [])
  const [visibility, setVisibility] = useState<VisibilityLevel>(initialDraft?.visibility || 'public')
  const [knowledgeBases, setKnowledgeBases] = useState<string[]>(initialDraft?.knowledgeBases || [])
  const [gatherings, setGatherings] = useState<string[]>(initialDraft?.gatherings || [])
  const [instructionIds, setInstructionIds] = useState<string[]>(initialDraft?.instructionIds || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-save timer ref
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Always-current ref — updated on every render so handleXClose never reads stale closure values
  const latestDraftRef = useRef({ contextId, name, handle, contextType, customType, description, presenceIds, visibility, knowledgeBases, gatherings, instructionIds })
  latestDraftRef.current = { contextId, name, handle, contextType, customType, description, presenceIds, visibility, knowledgeBases, gatherings, instructionIds }

  // Debounced draft save
  useEffect(() => {
    if (!name && !handle && !description) return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      saveProjectDraft({ ...latestDraftRef.current, savedAt: Date.now() })
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current) }
  }, [contextId, name, handle, contextType, customType, description, presenceIds, visibility, knowledgeBases, gatherings, instructionIds])

  // Flush draft immediately and close (used by X button and backdrop)
  function handleXClose() {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    const d = latestDraftRef.current
    if (d.name || d.handle || d.description || d.presenceIds.length > 0) {
      saveProjectDraft({ ...d, savedAt: Date.now() })
    }
    onClose()
  }

  // Fetch presences, knowledge bases, prompts, and games
  const [presences, setPresences] = useState<Presence[]>([])
  const [presencesLoading, setPresencesLoading] = useState(true)
  const [kbList, setKbList] = useState<KnowledgeBase[]>([])
  const [kbLoading, setKbLoading] = useState(true)
  const [promptList, setPromptList] = useState<SystemPrompt[]>([])
  const [promptsLoading, setPromptsLoading] = useState(true)
  const [gamesList, setGamesList] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setPresencesLoading(true)
      setKbLoading(true)
      setPromptsLoading(true)
      setGamesLoading(true)

      const [presenceData, kbData, promptData, gamesData] = await Promise.all([
        fetchPresences(wallet),
        fetchKnowledgeBases(wallet),
        fetchSystemPrompts(wallet),
        fetchGames(contextId), // Fetch games for this context
      ])

      setPresences(presenceData)
      setPresencesLoading(false)
      setKbList(kbData)
      setKbLoading(false)
      setPromptList(promptData)
      setPromptsLoading(false)
      setGamesList(gamesData)
      setGamesLoading(false)
    }
    loadData()
  }, [wallet, contextId])

  function onNameChange(val: string) {
    setName(val)
    if (!handleTouched) setHandle(suggestHandle(val))
  }

  function onHandleChange(val: string) {
    const cleaned = val.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, HANDLE_MAX)
    setHandle(cleaned)
    setHandleTouched(true)
  }

  // Validation errors (only max length)
  const nameError = nameTouched ? validateName(name) : null
  const handleError = handleTouched ? validateHandle(handle) : null
  const descriptionError = descriptionTouched ? validateDescription(description) : null

  // Compute the final type value (custom type if "Other" is selected)
  const finalContextType = (contextType === 'Other' ? customType.trim() : contextType).toLowerCase()

  const canSubmit =
    name.trim() &&
    name.length <= NAME_MAX &&
    handle.trim() &&
    isValidHandle(handle) &&
    finalContextType &&
    description.trim() &&
    description.length <= DESCRIPTION_MAX &&
    presenceIds.length > 0 &&
    knowledgeBases.length > 0 &&
    instructionIds.length > 0 &&
    !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Touch all fields to show validation
    setNameTouched(true)
    setHandleTouched(true)
    setDescriptionTouched(true)
    
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      const nestedContext = await apiCreateNestedContext({
        contextId,
        name: name.trim(),
        handle: handle.trim(),
        contextType: finalContextType,
        description: description.trim(),
        presenceIds: presenceIds,
        visibility,
        knowledgeBaseIds: knowledgeBases,
        gatheringIds: gatherings,
        instructionIds: instructionIds,
        createdBy: wallet,
      })
      clearProjectDraft()
      onCreate(nestedContext)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleXClose}
      />
      <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-card-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-400/15 flex items-center justify-center">
              <Icon
                icon="lucide:folder"
                width={20}
                height={20}
                className="text-purple-400"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">
                  New Nested Box
                </h2>
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-400/20 text-purple-400">
                  Team
                </span>
              </div>
              <p className="text-xs text-muted">
                Create a nested box in {contextName}
              </p>
            </div>
          </div>
          <button
            onClick={handleXClose}
            className="text-muted hover:text-white transition-colors p-1 cursor-pointer"
          >
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="rounded-xl border border-card-border bg-card/50 p-4 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Basic Information
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Nested Box Name <span className="text-accent">*</span>
                </label>
                <span className={`text-xs tabular-nums ${nameError ? 'text-red-400' : 'text-muted'}`}>
                  {name.length}/{NAME_MAX}
                </span>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={() => setNameTouched(true)}
                placeholder="e.g. Patient Care Team..."
                maxLength={NAME_MAX}
                autoFocus
                className={`w-full bg-input border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${
                  nameError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'
                }`}
              />
              {nameError && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <Icon icon="lucide:alert-circle" width={12} height={12} />
                  {nameError}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Handle <span className="text-accent">*</span>{' '}
                <span className="text-muted font-normal ml-1">
                  (unique · max {HANDLE_MAX})
                </span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-sm select-none">
                  @
                </span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => onHandleChange(e.target.value)}
                  onBlur={() => setHandleTouched(true)}
                  placeholder="patient_care"
                  maxLength={HANDLE_MAX}
                  className={`w-full bg-input border rounded-xl pl-8 pr-14 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${
                    handleError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'
                  }`}
                />
                <span
                  className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums ${handleError ? 'text-red-400' : 'text-muted'}`}
                >
                  {handle.length}/{HANDLE_MAX}
                </span>
              </div>
              {handleError && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <Icon icon="lucide:alert-circle" width={12} height={12} />
                  {handleError}
                </p>
              )}
            </div>
            <TypeSelector
              value={contextType}
              customValue={customType}
              onChange={setContextType}
              onCustomChange={setCustomType}
            />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground">
                  Description <span className="text-accent">*</span>
                </label>
                <span className={`text-xs tabular-nums ${descriptionError ? 'text-red-400' : 'text-muted'}`}>
                  {description.length}/{DESCRIPTION_MAX}
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => setDescriptionTouched(true)}
                placeholder="What is this nested box about?"
                rows={2}
                maxLength={DESCRIPTION_MAX}
                className={`w-full bg-input border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none text-sm resize-none transition-colors ${
                  descriptionError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'
                }`}
              />
              {descriptionError && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <Icon icon="lucide:alert-circle" width={12} height={12} />
                  {descriptionError}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-card-border bg-card/50 p-4 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Access & Agent
            </div>
            <PresenceMultiSelector
              value={presenceIds}
              onChange={setPresenceIds}
              presences={presences}
              loading={presencesLoading}
            />
            <VisibilitySelector value={visibility} onChange={setVisibility} />
          </div>

          <div className="rounded-xl border border-card-border bg-card/50 p-4 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Gatherings
            </div>
            <GatheringsSelector
              value={gatherings}
              onChange={setGatherings}
              games={gamesList}
              loading={gamesLoading}
            />
          </div>

          <div className="rounded-xl border border-card-border bg-card/50 p-4 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Knowledge & Behavior
            </div>
            <KnowledgeBaseSelector
              value={knowledgeBases}
              onChange={setKnowledgeBases}
              knowledgeBases={kbList}
              loading={kbLoading}
            />
            <PromptSelector
              value={instructionIds}
              onChange={setInstructionIds}
              prompts={promptList}
              loading={promptsLoading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { clearProjectDraft(); onClose() }}
              className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] border border-card-border text-foreground font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <Icon
                  icon="lucide:loader-2"
                  width={16}
                  height={16}
                  className="animate-spin"
                />
              ) : (
                <Icon icon="lucide:plus" width={16} height={16} />
              )}
              {loading ? 'Creating…' : 'Create Nested Box'}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Choice Modal
// ─────────────────────────────────────────────────────────────────────────────

interface CreateContextChoiceModalProps {
  onClose: () => void
  onChooseContext: () => void
  onChooseNestedContext: (contextId: string, contextName: string) => void
  contexts: ContextWithNested[]
}

function CreateContextChoiceModal({
  onClose,
  onChooseContext,
  onChooseNestedContext,
  contexts,
}: CreateContextChoiceModalProps) {
  const [selectedContext, setSelectedContext] =
    useState<ContextWithNested | null>(null)
  const [contextDropdownOpen, setContextDropdownOpen] = useState(false)
  const contextDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextDropdownRef.current && !contextDropdownRef.current.contains(e.target as Node)) {
        setContextDropdownOpen(false)
      }
    }
    if (contextDropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [contextDropdownOpen])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />
      <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-card-border sticky top-0 bg-card z-10">
          <div>
            <h2 className="text-xl font-bold text-white">Create New Box</h2>
            <p className="text-sm text-muted mt-1">
              Choose what kind of box to create
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 gap-4">
          <button
            onClick={onChooseContext}
            className="group text-left bg-background border border-card-border rounded-xl p-5 transition-all hover:border-amber-400/60 hover:bg-amber-400/10 cursor-pointer"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-400/15 group-hover:bg-amber-400/25 transition-colors">
                <Icon
                  icon="lucide:building-2"
                  width={22}
                  height={22}
                  className="text-amber-400"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-white font-semibold text-base">
                    Top-level Box
                  </h3>
                </div>
                <p className="text-sm text-muted group-hover:text-foreground/80 leading-relaxed transition-colors">
                  Create an organization-level box. Add Nested Boxes and a
                  Box Presence.
                </p>
              </div>
              <Icon
                icon="lucide:chevron-right"
                width={18}
                height={18}
                className="text-muted group-hover:text-amber-400 transition-colors flex-shrink-0 mt-3"
              />
            </div>
          </button>

          <button
            onClick={() => {
              if (contexts.length === 0) return
              if (contexts.length === 1) {
                onChooseNestedContext(contexts[0].id, contexts[0].name)
              } else {
                setSelectedContext(contexts[0])
              }
            }}
            disabled={contexts.length === 0}
            className={`group text-left bg-background border border-card-border rounded-xl p-5 transition-all ${contexts.length === 0 ? 'opacity-60 cursor-not-allowed' : 'hover:border-purple-400/60 hover:bg-purple-400/10 cursor-pointer'}`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${contexts.length === 0 ? 'bg-white/[0.06]' : 'bg-purple-400/15 group-hover:bg-purple-400/25'}`}
              >
                {contexts.length === 0 ? (
                  <Icon
                    icon="lucide:lock"
                    width={22}
                    height={22}
                    className="text-muted"
                  />
                ) : (
                  <Icon
                    icon="lucide:folder"
                    width={22}
                    height={22}
                    className="text-purple-400"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-white font-semibold text-base">
                    Nested Box
                  </h3>
                  {contexts.length === 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 flex items-center gap-1">
                      <Icon icon="lucide:lock" width={10} height={10} />
                      Requires Box
                    </span>
                  )}
                </div>
                {contexts.length === 0 ? (
                  <p className="text-sm text-muted leading-relaxed">
                    You must create a Box first.
                    <br />
                    <span className="text-amber-400">
                      Create a Box above to unlock.
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted group-hover:text-foreground/80 leading-relaxed transition-colors">
                    Create a team-level box. Add Gatherings and a Nested Box
                    Presence.
                  </p>
                )}
              </div>
              <Icon
                icon="lucide:chevron-right"
                width={18}
                height={18}
                className="text-muted group-hover:text-purple-400 transition-colors flex-shrink-0 mt-3"
              />
            </div>
          </button>

          {selectedContext && contexts.length > 1 && (
            <div className="mt-4 p-4 bg-background border border-card-border rounded-xl">
              <label className="block text-sm font-medium text-foreground mb-2">
                Choose Box for Nested Box
              </label>
              <div className="relative" ref={contextDropdownRef}>
                <button
                  type="button"
                  onClick={() => setContextDropdownOpen((o) => !o)}
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-left focus:outline-none focus:border-accent/50 cursor-pointer flex items-center justify-between gap-2 transition-colors hover:border-white/30"
                >
                  <span className="text-foreground">{selectedContext.name}</span>
                  <Icon
                    icon={contextDropdownOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                    width={16}
                    height={16}
                    className="text-muted flex-shrink-0"
                  />
                </button>

                {contextDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {contexts.map((c) => {
                        const isSelected = selectedContext.id === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setSelectedContext(c); setContextDropdownOpen(false) }}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-accent/15 text-accent'
                                : 'text-foreground hover:bg-white/[0.06] hover:text-white'
                            }`}
                          >
                            <span>{c.name}</span>
                            {isSelected && (
                              <Icon icon="lucide:check" width={14} height={14} className="text-accent flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() =>
                  onChooseNestedContext(selectedContext.id, selectedContext.name)
                }
                className="w-full mt-3 bg-accent hover:bg-accent-dark text-white font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Icon icon="lucide:plus" width={16} height={16} />
                Create Nested Box in {selectedContext.name}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Visibility Badge Component
// ─────────────────────────────────────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility: VisibilityLevel }) {
  const config = VISIBILITY_OPTIONS.find((v) => v.value === visibility)
  return (
    <span
      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 ${visibility === 'public' ? 'bg-green-400/20 text-green-400' : visibility === 'private' ? 'bg-amber-400/20 text-amber-400' : 'bg-red-400/20 text-red-400'}`}
    >
      <Icon icon={config?.icon || 'lucide:globe'} width={10} height={10} />
      {config?.label || visibility}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Context Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ContextPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [contexts, setContexts] = useState<ContextWithNestedAndPermissions[]>([])
  const [presences, setPresences] = useState<Presence[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(
    new Set()
  )
  const [expandedNestedLists, setExpandedNestedLists] = useState<Set<string>>(
    new Set()
  )
  const [showChoiceModal, setShowChoiceModal] = useState(false)
  const [showCreateContext, setShowCreateContext] = useState(false)
  const [showCreateNestedContext, setShowCreateNestedContext] = useState<{
    contextId: string
    contextName: string
  } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch only accessible contexts (owned OR has any permission via code redemption)
      if (user?.wallet) {
        const data = await listAccessibleContextsWithPermissions(user.wallet)
        setContexts(data)
        // Fetch presences, knowledge bases, and prompts
        const [presenceData, kbData, promptData] = await Promise.all([
          fetchPresences(user.wallet),
          fetchKnowledgeBases(user.wallet),
          fetchSystemPrompts(user.wallet),
        ])
        setPresences(presenceData)
        setKnowledgeBases(kbData)
        setSystemPrompts(promptData)
      } else {
        setContexts([])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [user?.wallet])

  useEffect(() => {
    loadData()
  }, [loadData])
  useEffect(() => {
    if (contexts.length > 0)
      setExpandedContexts(new Set(contexts.map((c) => c.id)))
  }, [contexts])

  function toggleContext(contextId: string) {
    setExpandedContexts((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(contextId)) newSet.delete(contextId)
      else newSet.add(contextId)
      return newSet
    })
  }

  function toggleNestedList(contextId: string) {
    setExpandedNestedLists((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(contextId)) newSet.delete(contextId)
      else newSet.add(contextId)
      return newSet
    })
  }

  function getPresenceName(presenceId?: string | null): string | null {
    if (!presenceId) return null
    return presences.find((p) => p.id === presenceId)?.name || null
  }

  function getPresenceNames(presenceIds?: string[]): string[] {
    if (!presenceIds || presenceIds.length === 0) return []
    return presenceIds
      .map((id) => presences.find((p) => p.id === id)?.name)
      .filter((name): name is string => !!name)
  }

  function getKnowledgeBaseNames(kbIds?: string[]): string[] {
    if (!kbIds || kbIds.length === 0) return []
    return kbIds
      .map((id) => knowledgeBases.find((kb) => kb.id === id)?.name)
      .filter((name): name is string => !!name)
  }

  function getPromptNames(promptIds?: string[]): string[] {
    if (!promptIds || promptIds.length === 0) return []
    return promptIds
      .map((id) => systemPrompts.find((p) => p.id === id)?.name)
      .filter((name): name is string => !!name)
  }

  const totalNestedContexts = contexts.reduce(
    (acc, c) => acc + (c.nestedContexts?.length || 0),
    0
  )

  async function handleDeleteContext(contextId: string) {
    try {
      await apiDeleteContext(contextId)
      setContexts((prev) => prev.filter((c) => c.id !== contextId))
    } catch (err) {
      console.error('Failed to delete context:', err)
    }
  }

  async function handleDeleteNestedContext(nestedContextId: string, contextId: string) {
    try {
      await apiDeleteNestedContext(nestedContextId)
      setContexts((prev) =>
        prev.map((c) =>
          c.id === contextId
            ? {
                ...c,
                nestedContexts: c.nestedContexts.filter((nc) => nc.id !== nestedContextId),
              }
            : c
        )
      )
    } catch (err) {
      console.error('Failed to delete nested box:', err)
    }
  }

  // Navigate to context detail page
  function handleContextClick(context: ContextWithNested) {
    router.push(`/context/${context.id}`)
  }

  return (
    <div className="max-w-full overflow-hidden">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white">Box</h1>
          <p className="text-muted mt-1">
            {contexts.length} top-level box{contexts.length !== 1 ? 'es' : ''} •{' '}
            {totalNestedContexts} nested box{totalNestedContexts !== 1 ? 'es' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowChoiceModal(true)}
          className="bg-accent hover:bg-accent-dark text-white font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2 flex-shrink-0"
        >
          <Icon icon="lucide:plus" width={18} height={18} />
          Create New Box
        </button>
      </div>

      {loading && (
        <div className="text-center py-16">
          <Icon
            icon="lucide:loader-2"
            width={40}
            height={40}
            className="mx-auto mb-3 text-muted animate-spin"
          />
          <p className="text-muted">Loading boxes…</p>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-red-400/15 flex items-center justify-center mx-auto mb-4">
            <Icon
              icon="lucide:alert-circle"
              width={32}
              height={32}
              className="text-red-400"
            />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Failed to load contexts
          </h3>
          <p className="text-muted mb-6 max-w-md mx-auto">{error}</p>
          <button
            onClick={loadData}
            className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && contexts.length > 0 && (
        <div className="space-y-4">
          {contexts.map((context) => {
            const isExpanded = expandedContexts.has(context.id)
            const presenceNames = getPresenceNames(context.presenceIds)
            const contextNestedContexts = context.nestedContexts || []
            // Use permissions from API
            const { isOwner, canEdit, canDelete } = context.permissions

            return (
              <div
                key={context.id}
                className="bg-card border border-card-border rounded-xl overflow-hidden"
                style={{ borderLeftWidth: 3, borderLeftColor: '#f59e0b' }}
              >
                {/* Make the entire card clickable */}
                <div 
                  className="p-5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => handleContextClick(context)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0 flex-1 group">
                      <div className="w-12 h-12 rounded-xl bg-amber-400/15 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-400/25 transition-colors">
                        <Icon
                          icon="lucide:building-2"
                          width={24}
                          height={24}
                          className="text-amber-400"
                        />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-white font-semibold text-lg group-hover:text-accent transition-colors truncate max-w-[200px] sm:max-w-[300px] md:max-w-none">
                            {context.name}
                          </h3>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-400 flex-shrink-0">
                            Box
                          </span>
                          {isOwner ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 flex-shrink-0 flex items-center gap-1">
                              <Icon icon="lucide:user" width={10} height={10} />
                              Owner
                            </span>
                          ) : canEdit ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex-shrink-0 flex items-center gap-1">
                              <Icon icon="lucide:edit" width={10} height={10} />
                              Editor
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 flex-shrink-0 flex items-center gap-1">
                              <Icon icon="lucide:eye" width={10} height={10} />
                              Viewer
                            </span>
                          )}
                          <VisibilityBadge visibility={context.visibility} />
                        </div>
                        {context.handle && (
                          <p className="text-xs text-muted/70 mb-1 truncate">
                            @{context.handle}
                          </p>
                        )}
                        {context.description && (
                          <p className="text-sm text-muted line-clamp-2 break-all overflow-hidden">
                            {context.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          <span className="text-xs text-muted flex items-center gap-1">
                            <Icon icon="lucide:folder" width={12} height={12} />
                            {contextNestedContexts.length} nested box
                            {contextNestedContexts.length !== 1 ? 's' : ''}
                          </span>
                          {presenceNames.length > 0 && (
                            <span className="text-xs text-accent flex items-center gap-1">
                              <Icon icon="lucide:bot" width={12} height={12} />
                              {presenceNames.length === 1 ? presenceNames[0] : `${presenceNames.length} presences`}
                            </span>
                          )}
                          {context.knowledgeBaseIds?.length > 0 && (
                            <span className="text-xs text-muted flex items-center gap-1">
                              <Icon
                                icon="lucide:database"
                                width={12}
                                height={12}
                              />
                              {context.knowledgeBaseIds.length} KB
                              {context.knowledgeBaseIds.length !== 1
                                ? 's'
                                : ''}
                            </span>
                          )}
                          {context.instructions && (
                            <span className="text-xs text-muted flex items-center gap-1">
                              <Icon
                                icon="lucide:file-text"
                                width={12}
                                height={12}
                              />
                              Instructions
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowCreateNestedContext({
                              contextId: context.id,
                              contextName: context.name,
                            })
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-purple-400/10 text-purple-400 hover:bg-purple-400/20 transition-colors flex items-center gap-1"
                        >
                          <Icon icon="lucide:plus" width={12} height={12} />
                          Add Nested Box
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteContext(context.id)
                          }}
                          className="text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Icon icon="lucide:trash-2" width={16} height={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && contextNestedContexts.length > 0 && (
                  <div className="border-t border-card-border bg-background/50">
                    {expandedNestedLists.has(context.id) && contextNestedContexts.map((nestedContext, idx) => {
                      const nestedContextPresenceNames = getPresenceNames(
                        nestedContext.presenceIds
                      )
                      const isLast = idx === contextNestedContexts.length - 1
                      return (
                        <div
                          key={nestedContext.id}
                          onClick={() => router.push(`/context/${context.id}/project/${nestedContext.id}`)}
                          className={`p-4 pl-20 flex items-start justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors group ${!isLast ? 'border-b border-card-border/50' : ''}`}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-lg bg-purple-400/15 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-400/25 transition-colors">
                              <Icon
                                icon="lucide:folder"
                                width={18}
                                height={18}
                                className="text-purple-400"
                              />
                            </div>
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h4 className="text-white font-medium truncate max-w-[150px] sm:max-w-[250px] md:max-w-none group-hover:text-purple-400 transition-colors">
                                  {nestedContext.name}
                                </h4>
                                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-400/20 text-purple-400 flex-shrink-0">
                                  Nested Box
                                </span>
                                <VisibilityBadge
                                  visibility={nestedContext.visibility}
                                />
                              </div>
                              {nestedContext.handle && (
                                <p className="text-xs text-muted/70 truncate">
                                  @{nestedContext.handle}
                                </p>
                              )}
                              {nestedContext.description && (
                                <p className="text-sm text-muted mt-1 line-clamp-1 break-all overflow-hidden">
                                  {nestedContext.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-2 flex-wrap">
                                {nestedContextPresenceNames.length > 0 && (
                                  <span className="text-xs text-accent flex items-center gap-1">
                                    <Icon
                                      icon="lucide:bot"
                                      width={11}
                                      height={11}
                                    />
                                    {nestedContextPresenceNames.length === 1 ? nestedContextPresenceNames[0] : `${nestedContextPresenceNames.length} presences`}
                                  </span>
                                )}
                                {nestedContext.gatheringIds?.length > 0 && (
                                  <span className="text-xs text-purple-400 flex items-center gap-1">
                                    <Icon
                                      icon="lucide:gamepad-2"
                                      width={11}
                                      height={11}
                                    />
                                    {nestedContext.gatheringIds.length} Gathering
                                    {nestedContext.gatheringIds.length !== 1
                                      ? 's'
                                      : ''}
                                  </span>
                                )}
                                {nestedContext.knowledgeBaseIds?.length > 0 && (
                                  <span className="text-xs text-muted flex items-center gap-1">
                                    <Icon
                                      icon="lucide:database"
                                      width={11}
                                      height={11}
                                    />
                                    {nestedContext.knowledgeBaseIds.length} KB
                                    {nestedContext.knowledgeBaseIds.length !== 1
                                      ? 's'
                                      : ''}
                                  </span>
                                )}
                                {nestedContext.instructions && (
                                  <span className="text-xs text-muted flex items-center gap-1">
                                    <Icon
                                      icon="lucide:file-text"
                                      width={11}
                                      height={11}
                                    />
                                    Instructions
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {canDelete && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteNestedContext(nestedContext.id, context.id)
                              }}
                              className="text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
                            >
                              <Icon
                                icon="lucide:trash-2"
                                width={14}
                                height={14}
                              />
                            </button>
                          )}
                        </div>
                      )
                    })}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleNestedList(context.id)
                      }}
                      className="w-full py-2.5 pl-20 pr-4 flex items-center gap-2 text-xs text-muted hover:text-white hover:bg-white/[0.03] transition-colors"
                    >
                      <Icon
                        icon={expandedNestedLists.has(context.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                        width={14}
                        height={14}
                      />
                      {expandedNestedLists.has(context.id)
                        ? 'Hide nested boxes'
                        : `Show ${contextNestedContexts.length} nested box${contextNestedContexts.length !== 1 ? 'es' : ''}`
                      }
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && contexts.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-amber-400/15 flex items-center justify-center mx-auto mb-4">
            <Icon
              icon="lucide:folder-tree"
              width={32}
              height={32}
              className="text-amber-400"
            />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No accessible contexts
          </h3>
          <p className="text-muted mb-6 max-w-md mx-auto">
            You don&apos;t have any contexts yet. Create one to get started, or redeem an
            invitation code to access a shared context.
          </p>
          <button
            onClick={() => setShowChoiceModal(true)}
            className="bg-accent hover:bg-accent-dark text-white font-semibold px-6 py-3 rounded-full transition-colors"
          >
            + Create New Box
          </button>
        </div>
      )}

      {showChoiceModal && (
        <CreateContextChoiceModal
          onClose={() => setShowChoiceModal(false)}
          onChooseContext={() => {
            setShowChoiceModal(false)
            setShowCreateContext(true)
          }}
          onChooseNestedContext={(contextId, contextName) => {
            setShowChoiceModal(false)
            setShowCreateNestedContext({ contextId, contextName })
          }}
          contexts={contexts}
        />
      )}
      {showCreateContext && user?.wallet && (
        <CreateContextModal
          onClose={() => setShowCreateContext(false)}
          onCreate={(context) => {
            // New contexts are owned by the current user, so they have full permissions
            setContexts([...contexts, { 
              ...context, 
              nestedContexts: [],
              permissions: {
                isOwner: true,
                canEdit: true,
                canDelete: true,
              }
            }])
            setShowCreateContext(false)
          }}
          wallet={user.wallet}
        />
      )}
      {showCreateNestedContext && user?.wallet && (
        <CreateNestedContextModal
          onClose={() => setShowCreateNestedContext(null)}
          onCreate={(nestedContext) => {
            setContexts((prev) =>
              prev.map((c) =>
                c.id === showCreateNestedContext.contextId
                  ? { ...c, nestedContexts: [...c.nestedContexts, nestedContext] }
                  : c
              )
            )
            setShowCreateNestedContext(null)
          }}
          contextId={showCreateNestedContext.contextId}
          contextName={showCreateNestedContext.contextName}
          wallet={user.wallet}
        />
      )}
    </div>
  )
}