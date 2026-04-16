'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, Spinner, EmptyState } from '@/components/UI'
import { useAuth } from '@/lib/auth-context'
import { createCode, fetchPermittedContexts } from '@/lib/codes-api'
import type { AccessType, CodeRole, PermittedContext } from '@/lib/types'
import {
  Sparkles,
  Users,
  ChevronDown,
  ChevronUp,
  Info,
  Mail,
  Smartphone,
  MessageCircle,
  AtSign,
  Lock,
  Check,
  Send,
  User,
  FileText,
  Shield,
  Clock,
  ClipboardList,
  DollarSign,
  Gamepad2,
  Percent,
  AlertCircle,
} from 'lucide-react'

// Invitation method type
type InvitationMethod = 'email' | 'sms' | 'telegram' | 'bluesky'

// Invitation method options
const INVITATION_METHODS: {
  value: InvitationMethod
  label: string
  icon: typeof Mail
  enabled: boolean
  color: string
}[] = [
  {
    value: 'email',
    label: 'Email',
    icon: Mail,
    enabled: true,
    color: 'text-emerald-400',
  },
  {
    value: 'sms',
    label: 'SMS',
    icon: Smartphone,
    enabled: false,
    color: 'text-blue-400',
  },
  {
    value: 'telegram',
    label: 'Telegram',
    icon: MessageCircle,
    enabled: false,
    color: 'text-sky-400',
  },
  {
    value: 'bluesky',
    label: 'Bluesky',
    icon: AtSign,
    enabled: false,
    color: 'text-blue-500',
  },
]

// Mock data for gatherings dropdown - will be replaced with API calls
const MOCK_GATHERINGS = [
  { id: 'gth_1', name: 'Spring Workshop' },
  { id: 'gth_2', name: 'Summer Camp' },
  { id: 'gth_3', name: 'Leadership Circle' },
  { id: 'gth_4', name: 'Cosmic Gathering' },
  { id: 'gth_5', name: 'Universe Talk' },
  { id: 'gth_6', name: 'Meditation Retreat' },
  { id: 'gth_7', name: 'Mindfulness Circle' },
]

// Access type options with descriptions - Display "Presence" for ecosystem, keep gathering
// Using 'ecosystem' internally but displaying as "Presence" in UI
const ACCESS_TYPE_OPTIONS: {
  value: 'ecosystem' | 'gathering'
  label: string
  description: string
  icon: typeof Sparkles
  color: string
}[] = [
  {
    value: 'ecosystem',
    label: 'Box',
    description: 'Full access to your entire box',
    icon: Sparkles,
    color: 'text-violet-400',
  },
  {
    value: 'gathering',
    label: 'Gathering',
    description: 'Access to a specific gathering only',
    icon: Gamepad2,
    color: 'text-emerald-400',
  },
]

const ROLE_OPTIONS: { value: CodeRole; label: string; description: string }[] = [
  {
    value: 'member',
    label: 'Member',
    description: 'Full access, can invite others to their accessible areas',
  },
  {
    value: 'guest',
    label: 'Guest',
    description: 'View-only access, cannot invite others',
  },
]

// Expiry presets - default is 48 hours as per client requirement
const EXPIRY_PRESETS = [
  { label: '24 hours', hours: 24 },
  { label: '48 hours', hours: 48 },
  { label: '7 days', hours: 168 },
  { label: '30 days', hours: 720 },
  { label: 'Custom', hours: null },
]

// ─────────────────────────────────────────────────────────────────────────────
// Custom Dropdown Component (matching Presence Selector design)
// ─────────────────────────────────────────────────────────────────────────────

interface DropdownOption {
  id: string
  name: string
}

interface CustomDropdownProps {
  label: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  placeholder: string
  disabledPlaceholder?: string
  disabled?: boolean
  emptyMessage?: string
  error?: string
}

function CustomDropdown({
  label,
  required = false,
  value,
  onChange,
  options,
  placeholder,
  disabledPlaceholder,
  disabled = false,
  emptyMessage,
  error,
}: CustomDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === value)

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
      <label className="block text-sm font-medium text-white/70 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={`w-full bg-input border rounded-xl px-4 py-3 text-left focus:outline-none flex items-center justify-between gap-2 transition-colors ${
            error
              ? 'border-red-500/50 focus:border-red-500'
              : 'border-card-border focus:border-accent/50'
          } ${
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer hover:border-white/30'
          }`}
        >
          <span className={selected ? 'text-foreground' : 'text-muted'}>
            {disabled
              ? disabledPlaceholder || placeholder
              : selected
              ? selected.name
              : placeholder}
          </span>
          {open ? (
            <ChevronUp size={16} className="text-muted flex-shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-muted flex-shrink-0" />
          )}
        </button>

        {open && !disabled && (
          <div className="absolute z-[100] w-full mt-1 bg-sidebar border border-card-border rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="max-h-48 overflow-y-auto bg-sidebar">
              {/* Default empty option */}
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  !value
                    ? 'bg-accent/15 text-accent'
                    : 'bg-sidebar text-muted hover:bg-white/10 hover:text-foreground'
                }`}
              >
                {placeholder}
              </button>

              {/* Options */}
              {options.map((option) => {
                const isSelected = value === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id)
                      setOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-accent/15 text-accent'
                        : 'bg-sidebar text-foreground hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{option.name}</span>
                    {isSelected && (
                      <Check size={14} className="text-accent flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      {error && (
        <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
          <Info size={12} />
          {error}
        </p>
      )}
      {emptyMessage && options.length === 0 && !disabled && !error && (
        <p className="text-amber-400 text-xs mt-1 flex items-center gap-1">
          <Info size={12} />
          {emptyMessage}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CreateCodePage() {
  const router = useRouter()
  const { user } = useAuth()

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [invitationMethod, setInvitationMethod] = useState<InvitationMethod>('email')
  const [personalMessage, setPersonalMessage] = useState('')
  const [accessType, setAccessType] = useState<'ecosystem' | 'gathering'>('ecosystem')
  const [presenceId, setPresenceId] = useState('')
  const [presenceRole, setPresenceRole] = useState('')
  const [gatheringId, setGatheringId] = useState('')
  const [role, setRole] = useState<CodeRole>('member')
  const [expiryPreset, setExpiryPreset] = useState<number | null>(48) // Default 48 hours
  const [customExpiry, setCustomExpiry] = useState('')
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState('')

  // UI state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingContexts, setLoadingContexts] = useState(false)
  
  // Validation errors
  const [validationErrors, setValidationErrors] = useState<{
    context?: string
    role?: string
    gathering?: string
    expiry?: string
  }>({})
  const [touched, setTouched] = useState(false)

  // Available options - contexts and roles fetched from API, gatherings still mock
  const [contexts, setContexts] = useState<{ id: string; name: string }[]>([])
  const [permittedContextsData, setPermittedContextsData] = useState<PermittedContext[]>([])
  const [contextRoles, setContextRoles] = useState<{ id: string; name: string; permissions: string[] }[]>([])
  const [gatherings] = useState(MOCK_GATHERINGS)
  const [hasNoPermission, setHasNoPermission] = useState(false)
  
  // Track if user is owner of the selected context
  // If backend returns roles without invite permission, user must be the owner
  const [isContextOwner, setIsContextOwner] = useState(false)
  
  // Check if selected role has invite permission
  const selectedRoleData = contextRoles.find(r => r.id === presenceRole)
  const selectedRoleHasInvite = selectedRoleData?.permissions?.includes('invite') ?? false

  // Fetch permitted contexts from API when user wallet is available
  useEffect(() => {
    async function fetchContextsData() {
      if (!user?.wallet) return
      
      setLoadingContexts(true)
      try {
        const result = await fetchPermittedContexts(user.wallet)
        // Store full permitted contexts data (includes roles with invite permission)
        setPermittedContextsData(result.contexts)
        // Transform PermittedContext[] to { id, name }[] for the dropdown
        setContexts(result.contexts.map((ctx) => ({ id: ctx.id, name: ctx.name })))
        setHasNoPermission(result.contexts.length === 0)
      } catch (err) {
        console.error('Failed to fetch permitted contexts:', err)
        setContexts([])
        setPermittedContextsData([])
        setHasNoPermission(true)
      } finally {
        setLoadingContexts(false)
      }
    }
    
    fetchContextsData()
  }, [user?.wallet])

  // Get roles from permitted contexts data when context is selected
  // For owned contexts, backend returns ALL roles
  // For non-owned contexts, backend returns only roles with invite permission
  useEffect(() => {
    if (!presenceId) {
      setContextRoles([])
      setIsContextOwner(false)
      return
    }
    
    // Find the selected context in permitted contexts data
    const selectedContext = permittedContextsData.find((ctx) => ctx.id === presenceId)
    if (selectedContext && selectedContext.roles) {
      // Store full role data including permissions
      const roles = selectedContext.roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions || [],
      }))
      setContextRoles(roles)
      
      // If any role lacks invite permission, user must be the owner
      // (because non-owners only see roles with invite permission)
      const hasNonInviteRoles = roles.some(r => !r.permissions.includes('invite'))
      setIsContextOwner(hasNonInviteRoles)
    } else {
      setContextRoles([])
      setIsContextOwner(false)
    }
  }, [presenceId, permittedContextsData])

  // Reset selections when access type changes
  useEffect(() => {
    if (accessType === 'ecosystem') {
      setGatheringId('')
    } else {
      setPresenceId('')
      setPresenceRole('')
    }
  }, [accessType])

  // Reset presence role when presence changes
  useEffect(() => {
    setPresenceRole('')
  }, [presenceId])

  // Validation
  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const validateForm = (): { isValid: boolean; errors: typeof validationErrors } => {
    const errors: typeof validationErrors = {}

    // Context is always required
    if (!presenceId) {
      errors.context = 'Please select a context'
    }

    // Role is required when context access type
    if (accessType === 'ecosystem' && !presenceRole) {
      errors.role = 'Please select a role'
    }

    // Gathering is required when access type is gathering
    if (accessType === 'gathering' && !gatheringId) {
      errors.gathering = 'Please select a gathering'
    }

    // Expiry must be set
    if (expiryPreset === null && !customExpiry) {
      errors.expiry = 'Please select an expiry date'
    }

    return {
      isValid: Object.keys(errors).length === 0 && !!user?.wallet,
      errors,
    }
  }

  const canSubmit = (): boolean => {
    const { isValid } = validateForm()
    return isValid
  }

  // Clear validation errors when fields change
  useEffect(() => {
    if (touched) {
      setValidationErrors((prev) => ({ ...prev, context: undefined }))
    }
  }, [presenceId, touched])

  useEffect(() => {
    if (touched) {
      setValidationErrors((prev) => ({ ...prev, role: undefined }))
    }
  }, [presenceRole, touched])

  useEffect(() => {
    if (touched) {
      setValidationErrors((prev) => ({ ...prev, gathering: undefined }))
    }
  }, [gatheringId, touched])

  useEffect(() => {
    if (touched) {
      setValidationErrors((prev) => ({ ...prev, expiry: undefined }))
    }
  }, [expiryPreset, customExpiry, touched])

  const getExpiryDate = (): string => {
    const date = new Date()
    if (expiryPreset !== null) {
      date.setTime(date.getTime() + expiryPreset * 60 * 60 * 1000)
    } else if (customExpiry) {
      return new Date(customExpiry).toISOString()
    }
    return date.toISOString()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setTouched(true)

    const { isValid, errors } = validateForm()
    setValidationErrors(errors)

    if (!isValid) {
      setError('Please fill in all required fields')
      return
    }

    setSaving(true)

    try {
      const code = await createCode({
        accessType,
        contextId: presenceId,
        gatheringId: accessType === 'gathering' ? gatheringId : undefined,
        scopeId: presenceRole || undefined,
        role,
        expiresAt: getExpiryDate(),
        price: price ? parseFloat(price) : undefined,
        discount: discount ? parseFloat(discount) : undefined,
        creatorWallet: user!.wallet,
      })

      console.log('Created code:', code)

      // Redirect to code detail page
      router.push(`/codes/${code.id}`)
    } catch (err) {
      console.error('Failed to create code:', err)
      setError(err instanceof Error ? err.message : 'Failed to create code')
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Create Code"
        subtitle="Create and send an access code to invite someone"
        breadcrumbs={[{ label: 'Codes', href: '/codes' }, { label: 'Create' }]}
        action={
          !hasNoPermission && (
            <div className="flex gap-3">
              <Link
                href="/codes"
                className="btn bg-white/[0.1] hover:bg-white/[0.15] text-white border-0 rounded-xl px-5 py-2.5"
              >
                Cancel
              </Link>
              <button
                onClick={handleSubmit}
                disabled={saving || !canSubmit()}
                className="btn bg-accent hover:bg-accent-dark text-white border-0 rounded-xl font-bold px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Spinner size="sm" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Create Code</span>
                  </>
                )}
              </button>
            </div>
          )
        }
      />

      {/* Loading State */}
      {loadingContexts && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* No Permission State */}
      {!loadingContexts && hasNoPermission && (
        <Card className="p-8">
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
              <Shield size={32} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Permission Required</h2>
            <p className="text-muted mb-6">
              You don't have invite permission for any context. Contact an administrator to get the required permissions to create invitation codes.
            </p>
            <Link
              href="/codes"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/[0.1] hover:bg-white/[0.15] text-white rounded-xl transition-colors"
            >
              Back to Codes
            </Link>
          </div>
        </Card>
      )}

      {/* Form - only show if has permission */}
      {!loadingContexts && !hasNoPermission && (
        <>
          {/* Error Banner */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-400 hover:text-red-300"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Access Type Selection */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Shield size={18} className="text-accent" />
              Access Type
            </h3>
            <p className="text-muted text-sm mb-4">
              Select what level of access this invitation should grant
            </p>

            <div className="grid grid-cols-2 gap-3">
              {ACCESS_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon
                const isSelected = accessType === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAccessType(option.value)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-accent bg-accent/10'
                        : 'border-card-border hover:border-white/20 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-accent/20' : 'bg-white/10'
                        }`}
                      >
                        <Icon
                          size={20}
                          className={isSelected ? 'text-accent' : option.color}
                        />
                      </div>
                      <span
                        className={`font-semibold ${
                          isSelected ? 'text-accent' : 'text-white'
                        }`}
                      >
                        {option.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted pl-[52px]">
                      {option.description}
                    </p>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Gathering Selection - Only shown when gathering access type is selected */}
          {accessType === 'gathering' && (
            <Card className="p-6 overflow-visible">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Users size={18} className="text-accent" />
                Select Gathering
              </h3>

              <CustomDropdown
                label="Gathering"
                required
                value={gatheringId}
                onChange={setGatheringId}
                options={gatherings}
                placeholder="Select a gathering..."
                emptyMessage="No gatherings available"
                error={validationErrors.gathering}
              />

              {/* Access Scope Preview */}
              {gatheringId && (
                <div className="mt-4 p-3 bg-sidebar rounded-xl border border-card-border">
                  <p className="text-xs text-muted mb-1">Access will be granted to:</p>
                  <p className="text-sm text-white font-medium">
                    {gatherings.find((g) => g.id === gatheringId)?.name}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Presence Selection - Only shown when presence (ecosystem) access type is selected */}
          {accessType === 'ecosystem' && (
            <Card className="p-6 overflow-visible">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Sparkles size={18} className="text-accent" />
                Select Box
              </h3>

              {loadingContexts ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner />
                  <span className="ml-2 text-muted text-sm">Loading boxes...</span>
                </div> 
              ) : (
                <CustomDropdown
                  label="Box"
                  required
                  value={presenceId}
                  onChange={setPresenceId}
                  options={contexts}
                  placeholder="Select a box..."
                  emptyMessage="No boxes available"
                  error={validationErrors.context}
                />
              )}

              {/* Role Selection - Only shown when context is selected */}
              {presenceId && (
                <div className="mt-4">
                  <CustomDropdown
                    label="Role"
                    required
                    value={presenceRole}
                    onChange={setPresenceRole}
                    options={contextRoles.map(r => ({ id: r.id, name: r.name }))}
                    placeholder="Select a role..."
                    emptyMessage="No roles available for this context"
                    error={validationErrors.role}
                  />
                  
                  {/* Info message for roles without invite permission */}
                  {presenceRole && !selectedRoleHasInvite && (
                    <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-2">
                      <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="text-blue-400 font-medium">Role without invite permission</p>
                        <p className="text-blue-300/70 text-xs mt-0.5">
                          Users who redeem this code will not be able to send invitations to others.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Access Scope Preview */}
              {presenceId && presenceRole && (
                <div className="mt-4 p-3 bg-sidebar rounded-xl border border-card-border">
                  <p className="text-xs text-muted mb-1">Access Scope</p>
                  <p className="text-sm text-white font-medium">
                    {contexts.find((c) => c.id === presenceId)?.name}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Full access to all gatherings and content within this context as {contextRoles.find((r) => r.id === presenceRole)?.name}
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Role & Code Expiry Row */}
          {/* <div className="grid grid-cols-2 gap-6"> */}
           <div className="grid grid-cols-1 gap-6">
            {/* Role Selection */}
            {/* <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Shield size={16} className="text-accent" />
                Role
              </h3>
              <p className="text-white/40 text-xs mb-3">
                Define the recipient&apos;s permissions
              </p>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      role === option.value
                        ? option.value === 'member'
                          ? 'border-accent bg-accent/10'
                          : 'border-white/30 bg-white/[0.08]'
                        : 'border-card-border hover:border-white/20 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`font-medium text-sm ${
                          role === option.value ? 'text-white' : 'text-white/80'
                        }`}
                      >
                        {option.label}
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          role === option.value
                            ? 'border-accent bg-accent'
                            : 'border-white/30'
                        }`}
                      >
                        {role === option.value && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted">{option.description}</p>
                  </button>
                ))}
              </div>
            </Card> */}

            {/* Expiry Selection */}
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Clock size={16} className="text-accent" />
                Code Expiry
              </h3>
              <p className="text-white/40 text-xs mb-3">
                When should this invitation code expire?
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {EXPIRY_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setExpiryPreset(preset.hours)
                      if (preset.hours !== null) setCustomExpiry('')
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      expiryPreset === preset.hours
                        ? 'bg-accent text-white'
                        : 'bg-input text-white/70 hover:text-white hover:bg-white/[0.1] border border-card-border'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {expiryPreset === null && (
                <input
                  type="datetime-local"
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className={`w-full bg-input border rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-colors ${
                    validationErrors.expiry && !customExpiry
                      ? 'border-red-500/50 focus:border-red-500'
                      : 'border-card-border focus:border-accent/50'
                  }`}
                />
              )}
              {validationErrors.expiry && expiryPreset === null && !customExpiry && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <Info size={12} />
                  {validationErrors.expiry}
                </p>
              )}
              {expiryPreset !== null && (
                <p className="text-xs text-muted">
                  Code will expire on{' '}
                  <span className="text-white">
                    {new Date(
                      Date.now() + expiryPreset * 60 * 60 * 1000
                    ).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </p>
              )}
            </Card>
          </div>

          {/* Price & Discount Row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Price */}
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <DollarSign size={16} className="text-accent" />
                Price
              </h3>
              <p className="text-white/40 text-xs mb-3">
                Set the price for this invitation (optional)
              </p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-input border border-card-border rounded-xl pl-8 pr-4 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors placeholder:text-muted"
                />
              </div>
              {price && parseFloat(price) > 0 && (
                <p className="text-xs text-muted mt-2">
                  Recipient will be charged <span className="text-white">${parseFloat(price).toFixed(2)}</span>
                </p>
              )}
            </Card>

            {/* Discount */}
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Percent size={16} className="text-accent" />
                Discount
              </h3>
              <p className="text-white/40 text-xs mb-3">
                Apply a discount to this code (optional)
              </p>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-input border border-card-border rounded-xl pl-4 pr-8 py-3 text-white text-sm focus:outline-none focus:border-accent/50 transition-colors placeholder:text-muted"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">%</span>
              </div>
              {discount && parseFloat(discount) > 0 && (
                <p className="text-xs text-muted mt-2">
                  Recipient will receive <span className="text-white">{parseFloat(discount).toFixed(0)}% off</span>
                </p>
              )}
            </Card>
          </div>
        </div>
      </form>
      </>
      )}
    </>
  )
}