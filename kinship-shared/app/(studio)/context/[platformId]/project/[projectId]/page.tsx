'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { useAuth } from '@/lib/auth-context'
import {
  updateNestedContext,
  type NestedContext,
  type VisibilityLevel,
  type UpdateNestedContextParams,
} from '@/lib/context-api'

// ─────────────────────────────────────────────────────────────────────────────
// Validation Constants & Functions (matching creation modal)
// ─────────────────────────────────────────────────────────────────────────────

const HANDLE_RE = /^[a-zA-Z0-9_.]*$/
const HANDLE_MAX = 25
const NAME_MAX = 25
const DESCRIPTION_MAX = 255

// Context type options
const CONTEXT_TYPES = [
  'Association', 'Chapter', 'Committee', 'Team', 'Social Group', 'Network',
  'Clinic', 'Cohort', 'Class', 'Working Group', 'Conference', 'Event',
  'Meeting', 'Course', 'Community', 'Project', 'Platform', 'Campaign',
  'Coalition', 'Library', 'Game', 'Gathering', 'Workshop', 'Other'
] as const

function validateName(name: string): string | null {
  if (!name.trim()) return 'Name is required'
  if (name.length > NAME_MAX) return `Max ${NAME_MAX} characters`
  return null
}

function validateHandle(h: string): string | null {
  if (!h.trim()) return 'Handle is required'
  if (!HANDLE_RE.test(h)) return 'Only letters, numbers, underscores, and periods'
  if (h.length > HANDLE_MAX) return `Max ${HANDLE_MAX} characters`
  return null
}

function validateDescription(desc: string): string | null {
  if (desc.length > DESCRIPTION_MAX) return `Max ${DESCRIPTION_MAX} characters`
  return null
}

function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, HANDLE_MAX)
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Presence {
  id: string
  name: string
  handle: string | null
  type: string
  status: string
  description: string | null
}

interface KnowledgeBase {
  id: string
  name: string
  namespace: string
  description: string | null
  contentType: string | null
  itemCount: number
}

interface SystemPrompt {
  id: string
  name: string
  content: string
  connectedKBId: string | null
  connectedKBName: string | null
  status: string
}

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

const AGENTS_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://192.168.1.30:8000'
const CONTEXT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://192.168.1.30:8000'
const ASSETS_API_URL = process.env.NEXT_PUBLIC_ASSETS_API_URL || 'http://192.168.1.30:4000/api/v1'

async function fetchPresences(wallet: string): Promise<Presence[]> {
  try {
    const response = await fetch(
      `${AGENTS_API_URL}/api/agents?wallet=${encodeURIComponent(wallet)}&includeWorkers=false`
    )
    if (!response.ok) throw new Error('Failed to fetch presences')
    const data = await response.json()
    return (data.agents || []).filter((agent: any) => agent.type === 'PRESENCE')
  } catch {
    return []
  }
}

async function fetchKnowledgeBases(wallet: string): Promise<KnowledgeBase[]> {
  try {
    const response = await fetch(
      `${AGENTS_API_URL}/api/knowledge?wallet=${encodeURIComponent(wallet)}`
    )
    if (!response.ok) throw new Error('Failed to fetch knowledge bases')
    const data = await response.json()
    return data.knowledgeBases || []
  } catch {
    return []
  }
}

async function fetchSystemPrompts(wallet: string): Promise<SystemPrompt[]> {
  try {
    const response = await fetch(
      `${AGENTS_API_URL}/api/prompts?wallet=${encodeURIComponent(wallet)}`
    )
    if (!response.ok) throw new Error('Failed to fetch system prompts')
    const data = await response.json()
    return (data.prompts || []).filter((p: any) => p.status === 'active')
  } catch {
    return []
  }
}

async function fetchGames(platformId?: string): Promise<Game[]> {
  try {
    const url = platformId
      ? `${ASSETS_API_URL}/games?platform_id=${encodeURIComponent(platformId)}`
      : `${ASSETS_API_URL}/games`
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch games')
    const data = await response.json()
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
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Visibility Badge Component
// ─────────────────────────────────────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility: VisibilityLevel }) {
  const config = {
    public: { icon: 'lucide:globe', label: 'Public', color: 'text-green-400', bg: 'bg-green-400/15' },
    private: { icon: 'lucide:lock', label: 'Private', color: 'text-amber-400', bg: 'bg-amber-400/15' },
    secret: { icon: 'lucide:eye-off', label: 'Secret', color: 'text-red-400', bg: 'bg-red-400/15' },
  }
  const { icon, label, color, bg } = config[visibility] || config.public
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${bg} ${color} flex-shrink-0`}>
      <Icon icon={icon} width={10} height={10} />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Presence Selector Component (matching creation page style)
// ─────────────────────────────────────────────────────────────────────────────

function PresenceSelector({
  value,
  onChange,
  presences,
  loading,
}: {
  value: string
  onChange: (value: string) => void
  presences: Presence[]
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = presences.find((p) => p.id === value)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">Presence</label>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          disabled={loading}
          onClick={() => setOpen((o) => !o)}
          className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-left focus:outline-none focus:border-accent/50 cursor-pointer disabled:opacity-50 flex items-center justify-between gap-2 transition-colors hover:border-white/30"
        >
          <span className={selected ? 'text-foreground' : 'text-muted'}>
            {loading
              ? 'Loading presences...'
              : selected
                ? `${selected.name}${selected.handle ? ` (@${selected.handle})` : ''}`
                : 'Select a presence agent...'}
          </span>
          <Icon
            icon={loading ? 'lucide:loader-2' : open ? 'lucide:chevron-up' : 'lucide:chevron-down'}
            width={16}
            height={16}
            className={`text-muted flex-shrink-0 ${loading ? 'animate-spin' : ''}`}
          />
        </button>

        {open && !loading && (
          <div className="absolute z-50 w-full mt-1 bg-card border border-card-border rounded-xl shadow-2xl overflow-hidden">
            <div className="max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  !value
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted hover:bg-white/[0.06] hover:text-foreground'
                }`}
              >
                No presence assigned
              </button>
              {presences.map((presence) => {
                const isSelected = value === presence.id
                return (
                  <button
                    key={presence.id}
                    type="button"
                    onClick={() => { onChange(presence.id); setOpen(false) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-accent/15 text-accent'
                        : 'text-foreground hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span>
                      {presence.name}
                      {presence.handle && (
                        <span className={`ml-1 text-xs ${isSelected ? 'text-accent/70' : 'text-muted'}`}>
                          @{presence.handle}
                        </span>
                      )}
                    </span>
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
      {presences.length === 0 && !loading && (
        <p className="text-xs text-muted/60 mt-1">
          No presence agents found. Create one in the Agents page.
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Select Component
// ─────────────────────────────────────────────────────────────────────────────

function MultiSelectField({
  label,
  icon,
  values,
  onChange,
  options,
  colorClass = 'accent',
}: {
  label: string
  icon: string
  values: string[]
  onChange: (values: string[]) => void
  options: { id: string; name: string; icon?: string }[]
  colorClass?: string
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    accent: { bg: 'bg-accent/10', text: 'text-accent', border: 'border-accent/20' },
    blue: { bg: 'bg-blue-400/10', text: 'text-blue-400', border: 'border-blue-400/20' },
    purple: { bg: 'bg-purple-400/10', text: 'text-purple-400', border: 'border-purple-400/20' },
    green: { bg: 'bg-green-400/10', text: 'text-green-400', border: 'border-green-400/20' },
  }
  const colors = colorMap[colorClass] || colorMap.accent

  const toggleOption = (id: string) => {
    if (values.includes(id)) {
      onChange(values.filter((v) => v !== id))
    } else {
      onChange([...values, id])
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-2">
        <Icon icon={icon} width={14} height={14} className={colors.text} />
        {label}
      </label>
      
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {values.map((id) => {
            const opt = options.find((o) => o.id === id)
            if (!opt) return null
            return (
              <span
                key={id}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${colors.bg} ${colors.text} text-sm border ${colors.border}`}
              >
                {opt.icon && <span>{opt.icon}</span>}
                {opt.name}
                <button
                  type="button"
                  onClick={() => toggleOption(id)}
                  className="hover:opacity-70 transition-opacity"
                >
                  <Icon icon="lucide:x" width={12} height={12} />
                </button>
              </span>
            )
          })}
        </div>
      )}
      
      <div className="flex flex-wrap gap-2">
        {options
          .filter((o) => !values.includes(o.id))
          .map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleOption(opt.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-muted hover:bg-white/10 hover:text-white text-sm transition-colors border border-card-border"
            >
              <Icon icon="lucide:plus" width={12} height={12} />
              {opt.icon && <span>{opt.icon}</span>}
              {opt.name}
            </button>
          ))}
        {options.length === 0 && (
          <span className="text-muted/50 italic text-sm">No options available</span>
        )}
        {options.length > 0 && options.filter((o) => !values.includes(o.id)).length === 0 && (
          <span className="text-muted/50 italic text-sm">All selected</span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Selector Component
// ─────────────────────────────────────────────────────────────────────────────

function TypeSelector({
  value,
  customValue,
  onChange,
  onCustomChange,
}: {
  value: string
  customValue: string
  onChange: (val: string) => void
  onCustomChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayValue = value || 'Select type...'

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        Type <span className="text-accent">*</span>
      </label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full bg-input border rounded-xl px-4 py-3 text-left flex items-center justify-between transition-colors ${
            value ? 'text-foreground' : 'text-muted'
          } border-card-border focus:border-accent/50`}
        >
          <span className="truncate">{displayValue}</span>
          <Icon
            icon={open ? 'lucide:chevron-up' : 'lucide:chevron-down'}
            width={16}
            height={16}
            className="text-muted flex-shrink-0 ml-2"
          />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-card border border-card-border rounded-xl shadow-xl max-h-60 overflow-y-auto">
            {CONTEXT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onChange(type)
                  setOpen(false)
                }}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 flex items-center justify-between transition-colors ${
                  value === type ? 'text-accent bg-accent/5' : 'text-foreground'
                }`}
              >
                {type}
                {value === type && (
                  <Icon icon="lucide:check" width={14} height={14} className="text-accent" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {value === 'Other' && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Custom Type <span className="text-accent">*</span>
          </label>
          <input
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value.slice(0, 50))}
            placeholder="Enter custom type..."
            maxLength={50}
            className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
          />
          <p className="text-xs text-muted mt-1">{customValue.length}/50</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Display Field Component (for view mode)
// ─────────────────────────────────────────────────────────────────────────────

function DisplayField({ 
  label, 
  icon, 
  children,
  colorClass = 'purple',
}: { 
  label: string
  icon: string
  children: React.ReactNode
  colorClass?: string
}) {
  const colors: Record<string, string> = {
    amber: 'text-amber-400',
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
  }
  
  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon icon={icon} width={14} height={14} className={colors[colorClass] || colors.purple} />
        <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-white">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function NestedContextDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  
  const contextId = typeof params?.platformId === 'string' 
    ? params.platformId 
    : Array.isArray(params?.platformId) 
      ? params.platformId[0] 
      : null
  const nestedContextId = typeof params?.projectId === 'string' 
    ? params.projectId 
    : Array.isArray(params?.projectId) 
      ? params.projectId[0] 
      : null

  // Data states
  const [nestedContext, setNestedContext] = useState<NestedContext | null>(null)
  const [presences, setPresences] = useState<Presence[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [auxiliaryLoading, setAuxiliaryLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode states
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Form states
  const [editName, setEditName] = useState('')
  const [editHandle, setEditHandle] = useState('')
  const [editContextType, setEditContextType] = useState('')
  const [editCustomType, setEditCustomType] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPresenceIds, setEditPresenceIds] = useState<string[]>([])
  const [editKnowledgeBaseIds, setEditKnowledgeBaseIds] = useState<string[]>([])
  const [editInstructionIds, setEditInstructionIds] = useState<string[]>([])
  const [editGatheringIds, setEditGatheringIds] = useState<string[]>([])

  // Validation touched states
  const [nameTouched, setNameTouched] = useState(false)
  const [handleTouched, setHandleTouched] = useState(false)
  const [descriptionTouched, setDescriptionTouched] = useState(false)

  // Compute validation errors
  const nameError = nameTouched ? validateName(editName) : null
  const handleError = handleTouched ? validateHandle(editHandle) : null
  const descriptionError = descriptionTouched ? validateDescription(editDescription) : null

  // Check if form is valid
  const isFormValid = 
    editName.trim() &&
    editHandle.trim() &&
    !validateName(editName) &&
    !validateHandle(editHandle) &&
    !validateDescription(editDescription)

  // Handle name change with auto-generate handle
  const onNameChange = (val: string) => {
    setEditName(val)
    setNameTouched(true)
    if (!handleTouched) {
      setEditHandle(suggestHandle(val))
    }
  }

  // Handle handle change
  const onHandleChange = (val: string) => {
    const cleaned = val.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, HANDLE_MAX)
    setEditHandle(cleaned)
    setHandleTouched(true)
  }

  const loadData = useCallback(async () => {
    if (!nestedContextId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      
      // Fetch nested context from kinship-agent
      const nestedContextResponse = await fetch(
        `${CONTEXT_API_URL}/api/v1/nested-context/${nestedContextId}`,
        { signal: controller.signal }
      )
      clearTimeout(timeout)
      
      if (!nestedContextResponse.ok) {
        throw new Error(`Failed to load nested context: ${nestedContextResponse.status}`)
      }
      
      const nestedContextRaw = await nestedContextResponse.json()
      const nestedContextData: NestedContext = {
        id: nestedContextRaw.id,
        contextId: nestedContextRaw.context_id,
        name: nestedContextRaw.name,
        slug: nestedContextRaw.slug,
        handle: nestedContextRaw.handle,
        contextType: nestedContextRaw.context_type || null,
        description: nestedContextRaw.description || '',
        icon: nestedContextRaw.icon || '',
        color: nestedContextRaw.color || '',
        presenceIds: nestedContextRaw.presence_ids || [],
        visibility: nestedContextRaw.visibility || 'public',
        knowledgeBaseIds: nestedContextRaw.knowledge_base_ids || [],
        gatheringIds: nestedContextRaw.gathering_ids || [],
        instructionIds: nestedContextRaw.instruction_ids || [],
        instructions: nestedContextRaw.instructions || '',
        isActive: nestedContextRaw.is_active,
        createdBy: nestedContextRaw.created_by,
        createdAt: nestedContextRaw.created_at,
        updatedAt: nestedContextRaw.updated_at,
        assetsCount: nestedContextRaw.assets_count || 0,
        gamesCount: nestedContextRaw.games_count || 0,
      }
      
      setNestedContext(nestedContextData)
      setEditName(nestedContextData.name || '')
      setEditHandle(nestedContextData.handle || '')
      // Initialize type - check if it's a predefined type or custom (case-insensitive)
      const savedType = nestedContextData.contextType || ''
      const matchedType = CONTEXT_TYPES.find(t => t.toLowerCase() === savedType.toLowerCase())
      if (savedType && !matchedType) {
        setEditContextType('Other')
        setEditCustomType(savedType)
      } else {
        setEditContextType(matchedType || '')
        setEditCustomType('')
      }
      setEditDescription(nestedContextData.description || '')
      setEditPresenceIds(nestedContextData.presenceIds || [])
      setEditKnowledgeBaseIds(nestedContextData.knowledgeBaseIds || [])
      setEditInstructionIds(nestedContextData.instructionIds || [])
      setEditGatheringIds(nestedContextData.gatheringIds || [])
      setNameTouched(false)
      setHandleTouched(!!nestedContextData.handle)
      setDescriptionTouched(false)
      
      setLoading(false)
      
      // Load auxiliary data in background
      if (user?.wallet) {
        setAuxiliaryLoading(true)
        Promise.all([
          fetchPresences(user.wallet),
          fetchKnowledgeBases(user.wallet),
          fetchSystemPrompts(user.wallet),
          fetchGames(nestedContextData.contextId),
        ]).then(([presenceData, kbData, promptData, gamesData]) => {
          setPresences(presenceData)
          setKnowledgeBases(kbData)
          setSystemPrompts(promptData)
          setGames(gamesData)
          setAuxiliaryLoading(false)
        }).catch(() => setAuxiliaryLoading(false))
      }
      
    } catch (err) {
      console.error('Error loading nested context:', err)
      setError(err instanceof Error ? err.message : 'Failed to load nested context')
      setLoading(false)
    }
  }, [nestedContextId, user?.wallet])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!nestedContextId) {
      const timeout = setTimeout(() => {
        if (!nestedContextId) {
          setError('No nested context ID provided')
          setLoading(false)
        }
      }, 2000)
      return () => clearTimeout(timeout)
    }
  }, [nestedContextId])

  const handleSave = async () => {
    if (!nestedContext) return
    
    setNameTouched(true)
    setHandleTouched(true)
    setDescriptionTouched(true)
    
    // Compute final context type
    const finalContextType = (editContextType === 'Other' ? editCustomType.trim() : editContextType).toLowerCase()
    
    if (!isFormValid) return
    
    setSaving(true)
    setSaveError(null)
    try {
      const params: UpdateNestedContextParams = {
        name: editName.trim(),
        handle: editHandle.trim(),
        contextType: finalContextType || undefined,
        description: editDescription.trim(),
        presenceIds: editPresenceIds,
        knowledgeBaseIds: editKnowledgeBaseIds,
        instructionIds: editInstructionIds,
        gatheringIds: editGatheringIds,
      }
      const updated = await updateNestedContext(nestedContext.id, params)
      setNestedContext(updated)
      setIsEditing(false)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (nestedContext) {
      setEditName(nestedContext.name || '')
      setEditHandle(nestedContext.handle || '')
      // Reset type - check if it's a predefined type or custom (case-insensitive)
      const savedType = nestedContext.contextType || ''
      const matchedType = CONTEXT_TYPES.find(t => t.toLowerCase() === savedType.toLowerCase())
      if (savedType && !matchedType) {
        setEditContextType('Other')
        setEditCustomType(savedType)
      } else {
        setEditContextType(matchedType || '')
        setEditCustomType('')
      }
      setEditDescription(nestedContext.description || '')
      setEditPresenceIds(nestedContext.presenceIds || [])
      setEditKnowledgeBaseIds(nestedContext.knowledgeBaseIds || [])
      setEditInstructionIds(nestedContext.instructionIds || [])
      setEditGatheringIds(nestedContext.gatheringIds || [])
      setNameTouched(false)
      setHandleTouched(!!nestedContext.handle)
      setDescriptionTouched(false)
    }
    setIsEditing(false)
    setSaveError(null)
  }

  const getPresenceName = (id?: string | null) => presences.find((p) => p.id === id)?.name || null
  const getPresenceNames = (ids?: string[]) => (ids || []).map((id) => presences.find((p) => p.id === id)).filter(Boolean) as Presence[]
  const getGames = (ids?: string[]) => (ids || []).map((id) => games.find((g) => g.id === id)).filter(Boolean) as Game[]

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-20">
          <Icon icon="lucide:loader-2" width={40} height={40} className="mx-auto mb-4 text-accent animate-spin" />
          <p className="text-muted">Loading nested box details…</p>
        </div>
      </div>
    )
  }

  if (error || !nestedContext) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-red-400/15 flex items-center justify-center mx-auto mb-4">
            <Icon icon="lucide:alert-circle" width={32} height={32} className="text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Failed to load nested box</h3>
          <p className="text-muted mb-6">{error || 'Nested box not found'}</p>
          <button onClick={() => router.push(`/context/${contextId}`)} className="inline-flex items-center gap-2 text-accent hover:underline">
            <Icon icon="lucide:arrow-left" width={16} height={16} />
            Back to Box
          </button>
        </div>
      </div>
    )
  }

  const nestedContextGames = getGames(nestedContext.gatheringIds)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <button
            onClick={() => router.push(`/context/${contextId}`)}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <Icon icon="lucide:arrow-left" width={20} height={20} className="text-white" />
          </button>
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center flex-shrink-0 border border-purple-400/20">
              <Icon icon="lucide:folder" width={28} height={28} className="text-purple-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">{nestedContext.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {nestedContext.handle && <span className="text-sm text-muted">@{nestedContext.handle}</span>}
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-400/20 text-purple-400">Nested Box</span>
                <VisibilityBadge visibility={nestedContext.visibility} />
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <button onClick={handleCancel} disabled={saving} className="px-4 py-2.5 rounded-xl text-muted hover:text-white hover:bg-white/5 transition-colors font-medium">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isFormValid}
                className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <Icon icon="lucide:loader-2" width={16} height={16} className="animate-spin" />}
                Save Changes
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors flex items-center gap-2 border border-card-border"
            >
              <Icon icon="lucide:pencil" width={16} height={16} />
              Edit Nested Box
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="mb-6 p-4 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 flex items-center gap-3">
          <Icon icon="lucide:alert-circle" width={20} height={20} />
          <span>{saveError}</span>
        </div>
      )}

      {/* Nested Box Details Card */}
      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-card-border bg-white/[0.02]">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Icon icon="lucide:info" width={18} height={18} className="text-purple-400" />
            Nested Box Details
          </h2>
        </div>
        
        <div className="p-6">
          {isEditing ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Basic Information</div>
                
                {/* Name */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">Nested Box Name <span className="text-accent">*</span></label>
                    <span className={`text-xs tabular-nums ${nameError ? 'text-red-400' : 'text-muted'}`}>{editName.length}/{NAME_MAX}</span>
                  </div>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => onNameChange(e.target.value)}
                    onBlur={() => setNameTouched(true)}
                    placeholder="e.g. Mobile App, Marketing Campaign..."
                    maxLength={NAME_MAX}
                    className={`w-full bg-input border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${nameError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'}`}
                  />
                  {nameError && <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><Icon icon="lucide:alert-circle" width={12} height={12} />{nameError}</p>}
                </div>

                {/* Handle */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Handle <span className="text-accent">*</span><span className="text-muted font-normal ml-1">(unique · max {HANDLE_MAX})</span></label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-sm select-none">@</span>
                    <input
                      type="text"
                      value={editHandle}
                      onChange={(e) => onHandleChange(e.target.value)}
                      onBlur={() => setHandleTouched(true)}
                      placeholder="mobile_app"
                      maxLength={HANDLE_MAX}
                      className={`w-full bg-input border rounded-xl pl-8 pr-14 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${handleError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'}`}
                    />
                    <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums ${handleError ? 'text-red-400' : 'text-muted'}`}>{editHandle.length}/{HANDLE_MAX}</span>
                  </div>
                  {handleError && <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><Icon icon="lucide:alert-circle" width={12} height={12} />{handleError}</p>}
                </div>

                {/* Type */}
                <TypeSelector
                  value={editContextType}
                  customValue={editCustomType}
                  onChange={setEditContextType}
                  onCustomChange={setEditCustomType}
                />

                {/* Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <span className={`text-xs tabular-nums ${descriptionError ? 'text-red-400' : 'text-muted'}`}>{editDescription.length}/{DESCRIPTION_MAX}</span>
                  </div>
                  <textarea
                    value={editDescription}
                    onChange={(e) => { setEditDescription(e.target.value); setDescriptionTouched(true) }}
                    onBlur={() => setDescriptionTouched(true)}
                    placeholder="What is this nested box for?"
                    rows={3}
                    maxLength={DESCRIPTION_MAX}
                    className={`w-full bg-input border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none text-sm resize-none transition-colors ${descriptionError ? 'border-red-500/50' : 'border-card-border focus:border-accent/50'}`}
                  />
                  {descriptionError && <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1"><Icon icon="lucide:alert-circle" width={12} height={12} />{descriptionError}</p>}
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Agent Configuration</div>
                <MultiSelectField 
                  label="Presences" 
                  icon="lucide:bot" 
                  values={editPresenceIds} 
                  onChange={setEditPresenceIds} 
                  options={presences.map(p => ({ id: p.id, name: p.name + (p.handle ? ` (@${p.handle})` : '') }))} 
                  colorClass="accent" 
                />
              </div>

              <div className="space-y-4">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Knowledge & Behavior</div>
                <MultiSelectField label="Knowledge Bases" icon="lucide:database" values={editKnowledgeBaseIds} onChange={setEditKnowledgeBaseIds} options={knowledgeBases.map(kb => ({ id: kb.id, name: kb.name }))} colorClass="blue" />
                <MultiSelectField label="System Prompts" icon="lucide:message-square-code" values={editInstructionIds} onChange={setEditInstructionIds} options={systemPrompts.map(p => ({ id: p.id, name: p.name }))} colorClass="purple" />
              </div>

              <div className="space-y-4">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Gatherings</div>
                <MultiSelectField 
                  label="Games" 
                  icon="lucide:gamepad-2" 
                  values={editGatheringIds} 
                  onChange={setEditGatheringIds} 
                  options={games.map(g => ({ id: g.id, name: g.name, icon: g.icon }))} 
                  colorClass="green" 
                />
              </div>
            </div>
          ) : (
            <div className="divide-y divide-card-border/50">
              <DisplayField label="Name" icon="lucide:text-cursor-input"><p className="text-lg">{nestedContext.name}</p></DisplayField>
              <DisplayField label="Handle" icon="lucide:at-sign">
                {nestedContext.handle ? <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/5 text-white font-mono text-sm">@{nestedContext.handle}</span> : <span className="text-muted/50 italic">Not set</span>}
              </DisplayField>
              <DisplayField label="Type" icon="lucide:tag">
                {nestedContext.contextType ? <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-purple-400/10 text-purple-400 text-sm border border-purple-400/20">{nestedContext.contextType}</span> : <span className="text-muted/50 italic">Not set</span>}
              </DisplayField>
              <DisplayField label="Description" icon="lucide:file-text">
                {nestedContext.description ? <p className="text-muted whitespace-pre-wrap">{nestedContext.description}</p> : <span className="text-muted/50 italic">No description</span>}
              </DisplayField>
              <DisplayField label="Presences" icon="lucide:bot">
                {(nestedContext.presenceIds || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(nestedContext.presenceIds || []).map((id) => {
                      const presence = presences.find((p) => p.id === id)
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm border border-accent/20">
                          <Icon icon="lucide:bot" width={12} height={12} />
                          {presence?.name || id.slice(0, 8) + '...'}
                          {presence?.handle && <span className="text-accent/70 text-xs">@{presence.handle}</span>}
                        </span>
                      )
                    })}
                  </div>
                ) : <span className="text-muted/50 italic">No presences assigned</span>}
              </DisplayField>
              <DisplayField label="Knowledge Bases" icon="lucide:database" colorClass="blue">
                {(nestedContext.knowledgeBaseIds || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(nestedContext.knowledgeBaseIds || []).map((id) => {
                      const kb = knowledgeBases.find((k) => k.id === id)
                      return <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-400/10 text-blue-400 text-sm border border-blue-400/20"><Icon icon="lucide:database" width={12} height={12} />{kb?.name || id.slice(0, 8) + '...'}</span>
                    })}
                  </div>
                ) : <span className="text-muted/50 italic">No knowledge bases connected</span>}
              </DisplayField>
              <DisplayField label="System Prompts" icon="lucide:message-square-code">
                {(nestedContext.instructionIds || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(nestedContext.instructionIds || []).map((id) => {
                      const prompt = systemPrompts.find((p) => p.id === id)
                      return <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-400/10 text-purple-400 text-sm border border-purple-400/20"><Icon icon="lucide:message-square-code" width={12} height={12} />{prompt?.name || id.slice(0, 8) + '...'}</span>
                    })}
                  </div>
                ) : <span className="text-muted/50 italic">No system prompts assigned</span>}
              </DisplayField>
              <DisplayField label="Gatherings" icon="lucide:gamepad-2" colorClass="green">
                {nestedContextGames.length > 0 ? (
                  <div className="space-y-2">
                    {nestedContextGames.map((game) => (
                      <div key={game.id} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-card-border/50">
                        <div className="w-10 h-10 rounded-lg bg-green-400/15 flex items-center justify-center flex-shrink-0 text-xl">{game.icon}</div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <h4 className="text-white font-medium truncate">{game.name}</h4>
                          {game.description && <p className="text-xs text-muted truncate">{game.description}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted flex items-center gap-1"><Icon icon="lucide:map" width={10} height={10} />{game.scenesCount} scenes</span>
                            <span className="text-xs text-muted flex items-center gap-1"><Icon icon="lucide:scroll" width={10} height={10} />{game.questsCount} quests</span>
                            <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${game.status === 'published' ? 'bg-green-400/15 text-green-400' : game.status === 'archived' ? 'bg-red-400/15 text-red-400' : 'bg-amber-400/15 text-amber-400'}`}>{game.status}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <span className="text-muted/50 italic">No gatherings assigned</span>}
              </DisplayField>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}