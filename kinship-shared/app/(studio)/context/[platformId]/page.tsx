'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { useAuth } from '@/lib/auth-context'
import {
  updateContext,
  getContextPermissions,
  type Context,
  type NestedContext,
  type VisibilityLevel,
  type UpdateContextParams,
  type ContextPermissions,
} from '@/lib/context-api'
import {
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
  type Role,
} from '@/lib/roles-api'

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

// ─────────────────────────────────────────────────────────────────────────────
// Worker Display Types (for available workers selection)
// ─────────────────────────────────────────────────────────────────────────────

interface WorkerDisplay {
  id: string
  name: string
  toolIds: string[]
  parentName?: string
  sourceContext?: string
  contextType?: 'context' | 'nested'
}

interface WorkerAgent {
  id: string
  name: string
  description: string | null
  tools: string[]
  parentId: string | null
  parentName?: string
  sourceContext?: string
  contextType?: 'context' | 'nested'
}

function workerToDisplay(worker: WorkerAgent): WorkerDisplay {
  return {
    id: worker.id,
    name: worker.name,
    toolIds: worker.tools,
    parentName: worker.parentName,
    sourceContext: worker.sourceContext,
    contextType: worker.contextType,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API Configuration
// ─────────────────────────────────────────────────────────────────────────────

const AGENTS_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://192.168.1.30:8000'
const ASSETS_API_URL = process.env.NEXT_PUBLIC_ASSETS_API_URL || 'http://192.168.1.30:4000/api/v1'
// Context API served by kinship-agent
const CONTEXT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL 
  ? `${process.env.NEXT_PUBLIC_AGENT_API_URL}/api/v1`
  : 'http://192.168.1.30:8000/api/v1'

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

async function fetchWorkersForPresence(presenceId: string): Promise<WorkerAgent[]> {
  try {
    const response = await fetch(`${AGENTS_API_URL}/api/agents/${presenceId}/workers`)
    if (!response.ok) return []
    const data = await response.json()
    // API returns { agents: [...], total: N } - use 'agents' not 'workers'
    return (data.agents || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      description: w.description || null,
      tools: w.tools || [],
      parentId: w.parentId || null,
    }))
  } catch {
    return []
  }
}

async function fetchWorkersForPresences(
  presenceIds: string[],
  presences: Presence[],
  sourceContext: string,
  contextType: 'context' | 'nested'
): Promise<WorkerAgent[]> {
  const allWorkers: WorkerAgent[] = []
  for (const presenceId of presenceIds) {
    const workers = await fetchWorkersForPresence(presenceId)
    const presence = presences.find((p) => p.id === presenceId)
    const parentName = presence?.name || presence?.handle || presenceId.slice(0, 8)
    workers.forEach((w) => {
      allWorkers.push({
        ...w,
        parentName,
        sourceContext,
        contextType,
      })
    })
  }
  return allWorkers
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
  options: { id: string; name: string }[]
  colorClass?: string
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    accent: { bg: 'bg-accent/10', text: 'text-accent', border: 'border-accent/20' },
    blue: { bg: 'bg-blue-400/10', text: 'text-blue-400', border: 'border-blue-400/20' },
    purple: { bg: 'bg-purple-400/10', text: 'text-purple-400', border: 'border-purple-400/20' },
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
  colorClass = 'amber',
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
        <Icon icon={icon} width={14} height={14} className={colors[colorClass] || colors.amber} />
        <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-white">{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ContextDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  
  const contextId = typeof params?.platformId === 'string' 
    ? params.platformId 
    : Array.isArray(params?.platformId) 
      ? params.platformId[0] 
      : null

  // Data states
  const [context, setContext] = useState<Context | null>(null)
  const [nestedContexts, setNestedContexts] = useState<NestedContext[]>([])
  const [presences, setPresences] = useState<Presence[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [auxiliaryLoading, setAuxiliaryLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Permissions state - fetched from API
  const [permissions, setPermissions] = useState<ContextPermissions>({
    isOwner: false,
    canEdit: false,
    canDelete: false,
  })

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

  // Validation touched states
  const [nameTouched, setNameTouched] = useState(false)
  const [handleTouched, setHandleTouched] = useState(false)
  const [descriptionTouched, setDescriptionTouched] = useState(false)

  // Roles state (user-created roles from selected Worker Agents)
  const [roles, setRoles] = useState<Role[]>([])
  const [availableWorkers, setAvailableWorkers] = useState<WorkerDisplay[]>([]) // Workers available to add as roles
  const [workersLoading, setWorkersLoading] = useState(false)
  const [rolesLoading, setRolesLoading] = useState(false)
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [roleFormOpen, setRoleFormOpen] = useState(false)
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]) // For selecting workers to add (multi-select)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]) // Permissions for the role being created/edited

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

  // ── Roles Management ──
  
  // Group workers by context type (context = top-level, nested = nested context)
  // All workers are always available - same worker can be used for multiple roles
  const contextWorkers = availableWorkers.filter((w) => w.contextType === 'context')
  const nestedWorkers = availableWorkers.filter((w) => w.contextType === 'nested')
  
  // Get unique nested context names for grouping
  const nestedContextNames = [...new Set(nestedWorkers.map((w) => w.sourceContext).filter(Boolean))] as string[]

  // Toggle worker selection (multi-select)
  function handleSelectWorker(workerId: string) {
    setSelectedWorkerIds((prev) => 
      prev.includes(workerId) 
        ? prev.filter((id) => id !== workerId)
        : [...prev, workerId]
    )
  }

  async function handleAddWorkerAsRole() {
    if (selectedWorkerIds.length === 0 || !newRoleName.trim() || !contextId || !user?.wallet) return
    
    setRoleSaving(true)
    setRoleError(null)
    
    try {
      const newRole = await createRole({
        contextId,
        workerIds: selectedWorkerIds,
        name: newRoleName.trim(),
        permissions: selectedPermissions,
        wallet: user.wallet,
        createdBy: user.wallet,
      })
      
      if (newRole) {
        setRoles((prev) => [...prev, newRole])
      }
      
      setSelectedWorkerIds([])
      setSelectedPermissions([])
      setNewRoleName('')
      setRoleFormOpen(false)
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Failed to create role')
    } finally {
      setRoleSaving(false)
    }
  }

  async function handleDeleteRole(roleId: string) {
    setRoleError(null)
    
    const success = await deleteRole(roleId)
    if (success) {
      setRoles((prev) => prev.filter((r) => r.id !== roleId))
      if (editingRoleId === roleId) {
        setEditingRoleId(null)
        setNewRoleName('')
        setSelectedWorkerIds([])
        setRoleFormOpen(false)
      }
      if (expandedRoleId === roleId) setExpandedRoleId(null)
    } else {
      setRoleError('Failed to delete role')
    }
  }

  function handleEditRole(roleId: string) {
    const role = roles.find((r) => r.id === roleId)
    if (!role) return
    setEditingRoleId(roleId)
    setNewRoleName(role.name)
    setSelectedWorkerIds(role.workerIds) // Pre-select the workers used for this role
    setSelectedPermissions(role.permissions || []) // Pre-select the permissions
    setRoleFormOpen(true)
  }

  async function handleUpdateRole() {
    if (!editingRoleId || !newRoleName.trim() || selectedWorkerIds.length === 0) return
    
    setRoleSaving(true)
    setRoleError(null)
    
    try {
      const updatedRole = await updateRole(editingRoleId, {
        name: newRoleName.trim(),
        workerIds: selectedWorkerIds,
        permissions: selectedPermissions,
      })
      
      if (updatedRole) {
        setRoles((prev) =>
          prev.map((r) => r.id === editingRoleId ? updatedRole : r)
        )
      }
      
      setEditingRoleId(null)
      setNewRoleName('')
      setSelectedWorkerIds([])
      setSelectedPermissions([])
      setRoleFormOpen(false)
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setRoleSaving(false)
    }
  }

  function handleCancelRoleEdit() {
    setEditingRoleId(null)
    setNewRoleName('')
    setSelectedWorkerIds([])
    setSelectedPermissions([])
    setRoleFormOpen(false)
    setRoleError(null)
  }

  const loadData = useCallback(async () => {
    if (!contextId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      
      // Fetch context from kinship-agent
      const contextResponse = await fetch(
        `${CONTEXT_API_URL}/context/${contextId}`,
        { signal: controller.signal }
      )
      clearTimeout(timeout)
      
      if (!contextResponse.ok) {
        throw new Error(`Failed to load context: ${contextResponse.status}`)
      }
      
      const contextRaw = await contextResponse.json()
      const contextData: Context = {
        id: contextRaw.id,
        name: contextRaw.name,
        slug: contextRaw.slug,
        handle: contextRaw.handle,
        contextType: contextRaw.context_type || null,
        description: contextRaw.description || '',
        icon: contextRaw.icon || '',
        color: contextRaw.color || '',
        presenceIds: contextRaw.presence_ids || [],
        visibility: contextRaw.visibility || 'public',
        knowledgeBaseIds: contextRaw.knowledge_base_ids || [],
        instructionIds: contextRaw.instruction_ids || [],
        instructions: contextRaw.instructions || '',
        isActive: contextRaw.is_active,
        createdBy: contextRaw.created_by,
        createdAt: contextRaw.created_at,
        updatedAt: contextRaw.updated_at,
        assetsCount: contextRaw.assets_count || 0,
        gamesCount: contextRaw.games_count || 0,
        nestedContextsCount: contextRaw.nested_contexts_count || 0,
      }
      
      setContext(contextData)
      
      // Fetch permissions for this context
      if (user?.wallet) {
        const perms = await getContextPermissions(user.wallet, contextId)
        if (perms) {
          setPermissions(perms)
        } else {
          // Fallback: check if user is the owner
          const isOwner = contextData.createdBy === user.wallet
          setPermissions({
            isOwner,
            canEdit: isOwner,
            canDelete: isOwner,
          })
        }
      }
      
      setEditName(contextData.name || '')
      setEditHandle(contextData.handle || '')
      // Initialize type - check if it's a predefined type or custom (case-insensitive)
      const savedType = contextData.contextType || ''
      const matchedType = CONTEXT_TYPES.find(t => t.toLowerCase() === savedType.toLowerCase())
      if (savedType && !matchedType) {
        setEditContextType('Other')
        setEditCustomType(savedType)
      } else {
        setEditContextType(matchedType || '')
        setEditCustomType('')
      }
      setEditDescription(contextData.description || '')
      setEditPresenceIds(contextData.presenceIds || [])
      setEditKnowledgeBaseIds(contextData.knowledgeBaseIds || [])
      setEditInstructionIds(contextData.instructionIds || [])
      setNameTouched(false)
      setHandleTouched(!!contextData.handle)
      setDescriptionTouched(false)
      
      setLoading(false)
      
      // Load nested contexts
      let loadedNestedContexts: NestedContext[] = []
      try {
        const nestedRes = await fetch(`${CONTEXT_API_URL}/context/${contextId}/nested`)
        if (nestedRes.ok) {
          const nestedData = await nestedRes.json()
          loadedNestedContexts = (nestedData || []).map((nc: any) => ({
            id: nc.id,
            contextId: nc.context_id,
            name: nc.name,
            slug: nc.slug,
            handle: nc.handle,
            description: nc.description || '',
            icon: nc.icon || '',
            color: nc.color || '',
            presenceIds: nc.presence_ids || [],
            visibility: nc.visibility || 'public',
            knowledgeBaseIds: nc.knowledge_base_ids || [],
            gatheringIds: nc.gathering_ids || [],
            instructionIds: nc.instruction_ids || [],
            instructions: nc.instructions || '',
            isActive: nc.is_active,
            createdBy: nc.created_by,
            createdAt: nc.created_at,
            updatedAt: nc.updated_at,
            assetsCount: nc.assets_count || 0,
            gamesCount: nc.games_count || 0,
          }))
          setNestedContexts(loadedNestedContexts)
        }
      } catch (err) {
        console.error('Error loading nested contexts:', err)
        setNestedContexts([])
      }
      
      // Load auxiliary data (presences, KBs, prompts)
      if (user?.wallet) {
        setAuxiliaryLoading(true)
        try {
          const [presenceData, kbData, promptData] = await Promise.all([
            fetchPresences(user.wallet),
            fetchKnowledgeBases(user.wallet),
            fetchSystemPrompts(user.wallet),
          ])
          
          setPresences(presenceData)
          setKnowledgeBases(kbData)
          setSystemPrompts(promptData)
          setAuxiliaryLoading(false)
          
          // Fetch roles from API
          setRolesLoading(true)
          try {
            const rolesData = await fetchRoles(contextId)
            setRoles(rolesData)
          } catch (err) {
            console.error('Error loading roles:', err)
          } finally {
            setRolesLoading(false)
          }
          
          // Now fetch workers from all presences (context + nested contexts)
          setWorkersLoading(true)
          try {
            let allWorkers: WorkerAgent[] = []
            
            // Fetch workers for context presences
            if (contextData.presenceIds && contextData.presenceIds.length > 0) {
              console.log('Fetching workers for context presences:', contextData.presenceIds)
              const contextWorkersData = await fetchWorkersForPresences(
                contextData.presenceIds,
                presenceData,
                contextData.name || 'Box',
                'context'
              )
              console.log('Context workers found:', contextWorkersData.length)
              allWorkers = [...allWorkers, ...contextWorkersData]
            }
            
            // Fetch workers for each nested context's presences
            for (const nc of loadedNestedContexts) {
              if (nc.presenceIds && nc.presenceIds.length > 0) {
                console.log('Fetching workers for nested context presences:', nc.name, nc.presenceIds)
                const ncWorkers = await fetchWorkersForPresences(
                  nc.presenceIds,
                  presenceData,
                  nc.name || 'Nested Box',
                  'nested'
                )
                console.log('Nested context workers found:', ncWorkers.length)
                allWorkers = [...allWorkers, ...ncWorkers]
              }
            }
            
            console.log('Total workers found:', allWorkers.length)
            setAvailableWorkers(allWorkers.map(workerToDisplay))
          } catch (err) {
            console.error('Error loading workers:', err)
          } finally {
            setWorkersLoading(false)
          }
        } catch (err) {
          console.error('Error loading auxiliary data:', err)
          setAuxiliaryLoading(false)
        }
      }
      
    } catch (err) {
      console.error('Error loading context:', err)
      setError(err instanceof Error ? err.message : 'Failed to load box')
      setLoading(false)
    }
  }, [contextId, user?.wallet])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!contextId) {
      const timeout = setTimeout(() => {
        if (!contextId) {
          setError('No box ID provided')
          setLoading(false)
        }
      }, 2000)
      return () => clearTimeout(timeout)
    }
  }, [contextId])

  const handleSave = async () => {
    if (!context) return
    
    setNameTouched(true)
    setHandleTouched(true)
    setDescriptionTouched(true)
    
    // Compute final context type
    const finalContextType = (editContextType === 'Other' ? editCustomType.trim() : editContextType).toLowerCase()
    
    if (!isFormValid) return
    
    setSaving(true)
    setSaveError(null)
    try {
      const params: UpdateContextParams = {
        name: editName.trim(),
        handle: editHandle.trim(),
        contextType: finalContextType || undefined,
        description: editDescription.trim(),
        presenceIds: editPresenceIds,
        knowledgeBaseIds: editKnowledgeBaseIds,
        instructionIds: editInstructionIds,
      }
      const updated = await updateContext(context.id, params)
      setContext(updated)
      setIsEditing(false)
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (context) {
      setEditName(context.name || '')
      setEditHandle(context.handle || '')
      // Reset type - check if it's a predefined type or custom (case-insensitive)
      const savedType = context.contextType || ''
      const matchedType = CONTEXT_TYPES.find(t => t.toLowerCase() === savedType.toLowerCase())
      if (savedType && !matchedType) {
        setEditContextType('Other')
        setEditCustomType(savedType)
      } else {
        setEditContextType(matchedType || '')
        setEditCustomType('')
      }
      setEditDescription(context.description || '')
      setEditPresenceIds(context.presenceIds || [])
      setEditKnowledgeBaseIds(context.knowledgeBaseIds || [])
      setEditInstructionIds(context.instructionIds || [])
      setNameTouched(false)
      setHandleTouched(!!context.handle)
      setDescriptionTouched(false)
    }
    setIsEditing(false)
    setSaveError(null)
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-20">
          <Icon icon="lucide:loader-2" width={40} height={40} className="mx-auto mb-4 text-accent animate-spin" />
          <p className="text-muted">Loading box details…</p>
        </div>
      </div>
    )
  }

  if (error || !context) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-red-400/15 flex items-center justify-center mx-auto mb-4">
            <Icon icon="lucide:alert-circle" width={32} height={32} className="text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Failed to load box</h3>
          <p className="text-muted mb-6">{error || 'Box not found'}</p>
          <button onClick={() => router.push('/context')} className="inline-flex items-center gap-2 text-accent hover:underline">
            <Icon icon="lucide:arrow-left" width={16} height={16} />
            Back to Box
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <button
            onClick={() => router.push('/context')}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <Icon icon="lucide:arrow-left" width={20} height={20} className="text-white" />
          </button>
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 flex items-center justify-center flex-shrink-0 border border-amber-400/20">
              <Icon icon="lucide:building-2" width={28} height={28} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">{context.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {context.handle && <span className="text-sm text-muted">@{context.handle}</span>}
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-400">Box</span>
                <VisibilityBadge visibility={context.visibility} />
                {/* Permission badge */}
                {permissions.isOwner ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1">
                    <Icon icon="lucide:user" width={10} height={10} />
                    Owner
                  </span>
                ) : permissions.canEdit ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                    <Icon icon="lucide:edit" width={10} height={10} />
                    Editor
                  </span>
                ) : (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 flex items-center gap-1">
                    <Icon icon="lucide:eye" width={10} height={10} />
                    Viewer
                  </span>
                )}
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
          ) : permissions.canEdit ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors flex items-center gap-2 border border-card-border"
            >
              <Icon icon="lucide:pencil" width={16} height={16} />
              Edit Box
            </button>
          ) : null}
        </div>
      </div>

      {saveError && (
        <div className="mb-6 p-4 rounded-xl bg-red-400/10 border border-red-400/20 text-red-400 flex items-center gap-3">
          <Icon icon="lucide:alert-circle" width={20} height={20} />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid gap-6">
        {/* Box Details Card */}
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-card-border bg-white/[0.02]">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Icon icon="lucide:info" width={18} height={18} className="text-amber-400" />
              Box Details
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
                      <label className="text-sm font-medium text-foreground">Box Name <span className="text-accent">*</span></label>
                      <span className={`text-xs tabular-nums ${nameError ? 'text-red-400' : 'text-muted'}`}>{editName.length}/{NAME_MAX}</span>
                    </div>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => onNameChange(e.target.value)}
                      onBlur={() => setNameTouched(true)}
                      placeholder="e.g. Kinship Health, Acme Corp..."
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
                        placeholder="kinship_health"
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
                      placeholder="What is this box for?"
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

                {/* Roles Section */}
                <div className="space-y-4">
                  <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Roles</div>
                  <div className="bg-white/[0.02] border border-card-border rounded-xl p-4">
                    <p className="text-xs text-muted mb-4">
                      Define roles by selecting Worker Agents. Each role groups workers for specific responsibilities.
                      {roles.length > 0 && (
                        <span className="ml-1 text-accent/70 font-medium">
                          {roles.length} role{roles.length !== 1 ? 's' : ''} created.
                        </span>
                      )}
                    </p>

                    {/* Existing roles list */}
                    {rolesLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Icon icon="lucide:loader-2" width={20} height={20} className="text-muted animate-spin" />
                        <span className="text-sm text-muted ml-2">Loading roles...</span>
                      </div>
                    ) : roles.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        {roles.map((role) => {
                          const isExpanded = expandedRoleId === role.id
                          return (
                            <div
                              key={role.id}
                              className="bg-white/[0.025] border border-card-border rounded-xl overflow-hidden transition-colors hover:border-white/[0.12]"
                            >
                              <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                                <button
                                  onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                                >
                                  <div className="w-7 h-7 rounded-lg bg-accent/12 flex items-center justify-center shrink-0">
                                    <Icon icon="lucide:waypoints" width={13} height={13} className="text-accent" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-white truncate">{role.name}</span>
                                      {role.permissions && role.permissions.length > 0 && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-400 border border-emerald-400/20">
                                          <Icon icon="lucide:shield-check" width={9} height={9} />
                                          {role.permissions.length}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[11px] text-muted/60">
                                        {role.workers.length} worker{role.workers.length !== 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  </div>
                                  <Icon icon={isExpanded ? "lucide:chevron-up" : "lucide:chevron-down"} width={13} height={13} className="text-muted/50 shrink-0" />
                                </button>
                                {permissions.canEdit && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button onClick={() => handleEditRole(role.id)} title="Edit role" className="text-muted/50 hover:text-accent transition-colors p-1.5 rounded-lg hover:bg-white/[0.04]">
                                      <Icon icon="lucide:pencil" width={12} height={12} />
                                    </button>
                                    <button onClick={() => handleDeleteRole(role.id)} title="Delete role" className="text-muted/50 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/[0.06]">
                                      <Icon icon="lucide:trash-2" width={12} height={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {isExpanded && (
                                <div className="px-3.5 pb-3 pt-0">
                                  <div className="border-t border-card-border pt-2.5 space-y-3">
                                    {/* Workers */}
                                    <div>
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/50 block mb-1.5">Workers</span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {role.workers.map((worker) => (
                                          <span key={worker.id} className="inline-flex items-center gap-1 text-[11px] font-medium bg-blue-400/8 text-blue-400/80 border border-blue-400/15 px-2 py-1 rounded-lg">
                                            <Icon icon="lucide:bot" width={10} height={10} />
                                            {worker.name}
                                          </span>
                                        ))}
                                        {role.workers.length === 0 && (
                                          <span className="text-[11px] text-muted/50 italic">No workers</span>
                                        )}
                                      </div>
                                    </div>
                                    {/* Permissions */}
                                    <div>
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/50 block mb-1.5">Permissions</span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {role.permissions && role.permissions.length > 0 ? (
                                          role.permissions.map((perm) => (
                                            <span key={perm} className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 px-2 py-1 rounded-lg capitalize">
                                              <Icon icon={perm === 'invite' ? 'lucide:user-plus' : 'lucide:shield'} width={10} height={10} />
                                              {perm}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="text-[11px] text-muted/50 italic">No permissions</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}

                    {/* Empty state */}
                    {!rolesLoading && roles.length === 0 && !roleFormOpen && (
                      <div className="text-center py-5 border border-dashed border-card-border rounded-xl mb-4">
                        <Icon icon="lucide:layers" width={22} height={22} className="text-muted/30 mx-auto mb-2" />
                        <p className="text-xs text-muted/50">
                          {permissions.canEdit ? 'No roles yet. Create one to get started.' : 'No roles defined for this box.'}
                        </p>
                      </div>
                    )}

                    {/* Add role trigger - only show if user can edit */}
                    {!roleFormOpen && permissions.canEdit && (
                      <button
                        onClick={() => { setRoleFormOpen(true); setEditingRoleId(null); setNewRoleName(''); setSelectedWorkerIds([]); setSelectedPermissions([]) }}
                        className="w-full bg-accent/8 hover:bg-accent/15 border border-accent/20 hover:border-accent/35 text-accent font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Icon icon="lucide:plus" width={14} height={14} />
                        Add New Role
                      </button>
                    )}

                    {/* Role builder form */}
                    {roleFormOpen && (
                      <div className="border border-accent/20 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-3.5 py-2.5 bg-accent/[0.04] border-b border-accent/15">
                          <span className="text-xs font-semibold text-accent flex items-center gap-1.5">
                            <Icon icon="lucide:waypoints" width={12} height={12} />
                            {editingRoleId ? 'Edit Role' : 'Add Role'}
                          </span>
                          <button onClick={handleCancelRoleEdit} className="text-muted/50 hover:text-white transition-colors p-0.5 rounded">
                            <Icon icon="lucide:x" width={13} height={13} />
                          </button>
                        </div>
                        <div className="p-3.5 space-y-3.5">
                          {/* Role Name - shown first */}
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted/60 mb-1.5 block">Role Name</label>
                            <input
                              type="text"
                              value={newRoleName}
                              onChange={(e) => setNewRoleName(e.target.value)}
                              placeholder="Enter role name..."
                              autoFocus
                              className="w-full bg-input border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
                            />
                          </div>

                          {/* Select Worker Agent - shown after name */}
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted/60 mb-1.5 block">
                              Select Worker Agents
                              {selectedWorkerIds.length > 0 && (
                                <span className="ml-2 text-accent/70 normal-case font-normal">
                                  ({selectedWorkerIds.length} selected)
                                </span>
                              )}
                            </label>
                            {workersLoading ? (
                              <div className="flex items-center justify-center py-6">
                                <Icon icon="lucide:loader-2" width={20} height={20} className="text-muted animate-spin" />
                                <span className="text-sm text-muted ml-2">Loading available workers...</span>
                              </div>
                            ) : availableWorkers.length > 0 ? (
                              <div className="max-h-[280px] overflow-y-auto pr-0.5 overscroll-contain space-y-3" style={{ scrollbarWidth: 'thin' }}>
                                {/* Box Workers (Top-level Box) */}
                                {contextWorkers.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-2 px-1">
                                      <Icon icon="lucide:layout-grid" width={12} height={12} className="text-blue-400" />
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80">Top-level Box</span>
                                      <span className="text-[10px] text-muted/50">({contextWorkers.length})</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {contextWorkers.map((worker) => {
                                        const isSelected = selectedWorkerIds.includes(worker.id)
                                        return (
                                          <button
                                            key={worker.id}
                                            onClick={() => handleSelectWorker(worker.id)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${isSelected ? 'bg-accent/15 border border-accent/30' : 'bg-white/[0.025] border border-card-border hover:bg-white/[0.05] hover:border-white/[0.12]'}`}
                                          >
                                            <div className="flex items-center gap-2.5">
                                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-accent/20' : 'bg-blue-400/10'}`}>
                                                <Icon icon="lucide:waypoints" width={12} height={12} className={isSelected ? 'text-accent' : 'text-blue-400'} />
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                {worker.parentName && (
                                                  <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="text-[10px] font-medium text-muted/70 uppercase tracking-wider">Presence Name</span>
                                                    <span className="text-[10px] text-muted/40">—</span>
                                                    <span className="text-[11px] font-medium text-blue-400/80">{worker.parentName}</span>
                                                  </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                  <span className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-foreground/80'}`}>{worker.name}</span>
                                                </div>
                                              </div>
                                              {isSelected && (
                                                <Icon icon="lucide:check" width={16} height={16} className="text-accent shrink-0" />
                                              )}
                                            </div>
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Nested Workers (Nested Box) - grouped by nested box */}
                                {nestedContextNames.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-2 px-1">
                                      <Icon icon="lucide:folder-tree" width={12} height={12} className="text-purple-400" />
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/80">Nested Box</span>
                                      <span className="text-[10px] text-muted/50">({nestedWorkers.length})</span>
                                    </div>
                                    <div className="space-y-2">
                                      {nestedContextNames.map((nestedName) => {
                                        const workersForNested = nestedWorkers.filter((w) => w.sourceContext === nestedName)
                                        return (
                                          <div key={nestedName}>
                                            <div className="flex items-center gap-1.5 mb-1 px-2">
                                              <Icon icon="lucide:folder" width={10} height={10} className="text-purple-400/60" />
                                              <span className="text-[10px] font-medium text-purple-400/70">{nestedName}</span>
                                            </div>
                                            <div className="space-y-1.5">
                                              {workersForNested.map((worker) => {
                                                const isSelected = selectedWorkerIds.includes(worker.id)
                                                return (
                                                  <button
                                                    key={worker.id}
                                                    onClick={() => handleSelectWorker(worker.id)}
                                                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${isSelected ? 'bg-accent/15 border border-accent/30' : 'bg-white/[0.025] border border-card-border hover:bg-white/[0.05] hover:border-white/[0.12]'}`}
                                                  >
                                                    <div className="flex items-center gap-2.5">
                                                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-accent/20' : 'bg-purple-400/10'}`}>
                                                        <Icon icon="lucide:waypoints" width={12} height={12} className={isSelected ? 'text-accent' : 'text-purple-400'} />
                                                      </div>
                                                      <div className="min-w-0 flex-1">
                                                        {worker.parentName && (
                                                          <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="text-[10px] font-medium text-muted/70 uppercase tracking-wider">Presence Name</span>
                                                            <span className="text-[10px] text-muted/40">—</span>
                                                            <span className="text-[11px] font-medium text-purple-400/80">{worker.parentName}</span>
                                                          </div>
                                                        )}
                                                        <div className="flex items-center gap-2">
                                                          <span className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-foreground/80'}`}>{worker.name}</span>
                                                        </div>
                                                      </div>
                                                      {isSelected && (
                                                        <Icon icon="lucide:check" width={16} height={16} className="text-accent shrink-0" />
                                                      )}
                                                    </div>
                                                  </button>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-6 border border-dashed border-card-border rounded-xl">
                                <Icon icon="lucide:users" width={22} height={22} className="text-muted/30 mx-auto mb-2" />
                                <p className="text-xs text-muted/50">No worker agents available.</p>
                                <p className="text-xs text-muted/40 mt-1">Assign presences to this box to see their workers.</p>
                              </div>
                            )}
                          </div>

                          {/* Permissions Section */}
                          <div>
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted/60 mb-2 block">
                              Permissions
                            </label>
                            <div className="space-y-2">
                              {/* Invite Permission */}
                              <label className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-card-border hover:border-emerald-400/30 transition-colors cursor-pointer group">
                                <div className="relative flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedPermissions.includes('invite')}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedPermissions(prev => [...prev, 'invite'])
                                      } else {
                                        setSelectedPermissions(prev => prev.filter(p => p !== 'invite'))
                                      }
                                    }}
                                    className="peer sr-only"
                                  />
                                  <div className="w-5 h-5 rounded border-2 border-white/20 bg-white/5 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                                    {selectedPermissions.includes('invite') && (
                                      <Icon icon="lucide:check" width={12} height={12} className="text-white" />
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-white">Invite</span>
                                    <Icon icon="lucide:user-plus" width={14} height={14} className="text-emerald-400" />
                                  </div>
                                  <p className="text-[11px] text-muted/60 mt-0.5">
                                    Can invite others to join this context
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>

                          {/* Error display */}
                          {roleError && (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                              <Icon icon="lucide:alert-circle" width={14} height={14} className="text-red-400 shrink-0" />
                              <span className="text-xs text-red-400">{roleError}</span>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="pt-1.5 border-t border-card-border">
                            <div className="flex gap-2">
                              {editingRoleId ? (
                                <button 
                                  onClick={handleUpdateRole} 
                                  disabled={selectedWorkerIds.length === 0 || !newRoleName.trim() || roleSaving} 
                                  className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                >
                                  {roleSaving ? (
                                    <Icon icon="lucide:loader-2" width={14} height={14} className="animate-spin" />
                                  ) : (
                                    <Icon icon="lucide:check" width={14} height={14} />
                                  )}
                                  {roleSaving ? 'Updating...' : 'Update Role'}
                                </button>
                              ) : (
                                <button 
                                  onClick={handleAddWorkerAsRole} 
                                  disabled={selectedWorkerIds.length === 0 || !newRoleName.trim() || roleSaving} 
                                  className="flex-1 bg-accent hover:bg-accent/90 text-white font-semibold py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                >
                                  {roleSaving ? (
                                    <Icon icon="lucide:loader-2" width={14} height={14} className="animate-spin" />
                                  ) : (
                                    <Icon icon="lucide:plus" width={14} height={14} />
                                  )}
                                  {roleSaving ? 'Creating...' : 'Add Role'}
                                </button>
                              )}
                              <button onClick={handleCancelRoleEdit} disabled={roleSaving} className="border border-card-border text-foreground/60 hover:text-foreground hover:border-white/20 font-medium px-4 py-2 rounded-xl transition-colors text-sm disabled:opacity-40">Cancel</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-card-border/50">
                <DisplayField label="Name" icon="lucide:text-cursor-input"><p className="text-lg">{context.name}</p></DisplayField>
                <DisplayField label="Handle" icon="lucide:at-sign">
                  {context.handle ? <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white/5 text-white font-mono text-sm">@{context.handle}</span> : <span className="text-muted/50 italic">Not set</span>}
                </DisplayField>
                <DisplayField label="Type" icon="lucide:tag">
                  {context.contextType ? <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-accent/10 text-accent text-sm border border-accent/20">{context.contextType}</span> : <span className="text-muted/50 italic">Not set</span>}
                </DisplayField>
                <DisplayField label="Description" icon="lucide:file-text">
                  {context.description ? <p className="text-muted whitespace-pre-wrap">{context.description}</p> : <span className="text-muted/50 italic">No description</span>}
                </DisplayField>
                <DisplayField label="Presences" icon="lucide:bot">
                  {(context.presenceIds || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(context.presenceIds || []).map((id) => {
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
                  {(context.knowledgeBaseIds || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(context.knowledgeBaseIds || []).map((id) => {
                        const kb = knowledgeBases.find((k) => k.id === id)
                        return <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-400/10 text-blue-400 text-sm border border-blue-400/20"><Icon icon="lucide:database" width={12} height={12} />{kb?.name || id.slice(0, 8) + '...'}</span>
                      })}
                    </div>
                  ) : <span className="text-muted/50 italic">No knowledge bases connected</span>}
                </DisplayField>
                <DisplayField label="System Prompts" icon="lucide:message-square-code" colorClass="purple">
                  {(context.instructionIds || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(context.instructionIds || []).map((id) => {
                        const prompt = systemPrompts.find((p) => p.id === id)
                        return <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-400/10 text-purple-400 text-sm border border-purple-400/20"><Icon icon="lucide:message-square-code" width={12} height={12} />{prompt?.name || id.slice(0, 8) + '...'}</span>
                      })}
                    </div>
                  ) : <span className="text-muted/50 italic">No system prompts assigned</span>}
                </DisplayField>
                <DisplayField label="Roles" icon="lucide:waypoints" colorClass="amber">
                  {rolesLoading ? (
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:loader-2" width={14} height={14} className="text-muted animate-spin" />
                      <span className="text-muted/50 text-sm">Loading roles...</span>
                    </div>
                  ) : roles.length > 0 ? (
                    <div className="space-y-2">
                      {roles.map((role) => (
                        <div key={role.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-card-border/50">
                          <div className="w-8 h-8 rounded-lg bg-amber-400/15 flex items-center justify-center flex-shrink-0">
                            <Icon icon="lucide:waypoints" width={14} height={14} className="text-amber-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-white font-medium">{role.name}</h4>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400/70">
                                {role.workers.length} worker{role.workers.length !== 1 ? 's' : ''}
                              </span>
                              {role.permissions && role.permissions.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-400 border border-emerald-400/20">
                                  <Icon icon="lucide:shield-check" width={9} height={9} />
                                  {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            {role.workers.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {role.workers.map((worker) => (
                                  <span key={worker.id} className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-blue-400/8 text-blue-400/80 border border-blue-400/15 px-2 py-1 rounded-lg">
                                    <Icon icon="lucide:bot" width={10} height={10} />
                                    {worker.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {role.permissions && role.permissions.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {role.permissions.map((perm) => (
                                  <span key={perm} className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 px-2 py-1 rounded-lg capitalize">
                                    <Icon icon={perm === 'invite' ? 'lucide:user-plus' : 'lucide:shield'} width={10} height={10} />
                                    {perm}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <span className="text-muted/50 italic">No roles defined</span>}
                </DisplayField>
              </div>
            )}
          </div>
        </div>

        {/* Nested Boxes Card */}
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-card-border bg-white/[0.02] flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Icon icon="lucide:folder" width={18} height={18} className="text-purple-400" />
              Nested Boxes<span className="text-sm font-normal text-muted ml-1">({nestedContexts.length})</span>
            </h2>
          </div>
          
          <div className="p-4">
            {nestedContexts.length > 0 ? (
              <div className="space-y-2">
                {nestedContexts.map((nestedContext) => (
                  <div
                    key={nestedContext.id}
                    onClick={() => router.push(`/context/${contextId}/project/${nestedContext.id}`)}
                    className="p-4 bg-background/50 rounded-xl border border-card-border/50 cursor-pointer hover:bg-white/[0.03] hover:border-purple-400/30 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-purple-400/15 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-400/25 transition-colors">
                        <Icon icon="lucide:folder" width={22} height={22} className="text-purple-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-white font-medium group-hover:text-purple-400 transition-colors">{nestedContext.name}</h4>
                          <VisibilityBadge visibility={nestedContext.visibility} />
                        </div>
                        {nestedContext.handle && <p className="text-xs text-muted/70">@{nestedContext.handle}</p>}
                        {nestedContext.description && <p className="text-sm text-muted mt-1 line-clamp-1">{nestedContext.description}</p>}
                      </div>
                      <Icon icon="lucide:chevron-right" width={20} height={20} className="text-muted group-hover:text-purple-400 flex-shrink-0 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-xl bg-purple-400/10 flex items-center justify-center mx-auto mb-3">
                  <Icon icon="lucide:folder-plus" width={24} height={24} className="text-purple-400/50" />
                </div>
                <p className="text-muted/50">No nested boxes in this box yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}