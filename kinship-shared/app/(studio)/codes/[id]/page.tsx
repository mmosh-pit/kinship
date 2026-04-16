'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Card, Spinner, ConfirmDialog } from '@/components/UI'
import { useAuth } from '@/lib/auth-context'
import { getCode, toggleCode, sendInvite, fetchPermittedContexts, fetchCodeRedemptions } from '@/lib/codes-api'
import type { AccessCode, AccessType, CodeStatus, CodeRole, PermittedContext } from '@/lib/types'
import type { CodeRedemptionMember, CodeRedemptionsResponse } from '@/lib/codes-api'
import {
  ArrowLeft,
  Copy,
  Check,
  Send,
  Ban,
  KeyRound,
  Sparkles,
  Users,
  User,
  Mail,
  Calendar,
  Clock,
  Shield,
  UserCheck,
  ExternalLink,
  DollarSign,
  Gamepad2,
  Building2,
  UserCog,
  Lock,
  Smartphone,
  MessageCircle,
  AtSign,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Badge Components
// ─────────────────────────────────────────────────────────────────────────────

const ACCESS_TYPE_CONFIG: Record<
  AccessType,
  { icon: typeof Sparkles; label: string; color: string; bgColor: string }
> = {
  ecosystem: {
    icon: Sparkles,
    label: 'Presence',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/15',
  },
  gathering: {
    icon: Gamepad2,
    label: 'Gathering',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
  },
}

const STATUS_STYLES: Record<CodeStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  expired: 'bg-white/10 text-muted border-white/10',
  disabled: 'bg-red-500/15 text-red-400 border-red-500/20',
  redeemed: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
}

function StatusBadge({ status }: { status: CodeStatus }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

function AccessTypeBadge({ accessType }: { accessType: AccessType }) {
  const config = ACCESS_TYPE_CONFIG[accessType] || ACCESS_TYPE_CONFIG.ecosystem
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${config.bgColor} ${config.color}`}
    >
      <Icon size={12} />
      {config.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CodeDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const codeId = params.id as string

  // State for code data
  const [code, setCode] = useState<AccessCode | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Permission state
  const [canSendInvite, setCanSendInvite] = useState(false)
  const [permissionLoading, setPermissionLoading] = useState(true)
  
  // Redemptions state (Transaction History)
  const [redemptions, setRedemptions] = useState<CodeRedemptionMember[]>([])
  const [redemptionsLoading, setRedemptionsLoading] = useState(true)
  const [redemptionsTotal, setRedemptionsTotal] = useState(0)
  const [redemptionsError, setRedemptionsError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [disableConfirm, setDisableConfirm] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [resending, setResending] = useState(false)
  const [role, setRole] = useState<CodeRole>('member')

  // Fetch code from API
  useEffect(() => {
    async function loadCode() {
      try {
        setLoading(true)
        const data = await getCode(codeId)
        setCode(data)
      } catch (err) {
        console.error('Failed to load code:', err)
      } finally {
        setLoading(false)
      }
    }
    loadCode()
  }, [codeId])

  // Fetch redemptions (Transaction History)
  useEffect(() => {
    async function loadRedemptions() {
      try {
        setRedemptionsLoading(true)
        setRedemptionsError(null)
        const data = await fetchCodeRedemptions(codeId)
        setRedemptions(data.members)
        setRedemptionsTotal(data.total)
      } catch (err) {
        console.error('Failed to load redemptions:', err)
        setRedemptionsError(err instanceof Error ? err.message : 'Failed to load redemptions')
      } finally {
        setRedemptionsLoading(false)
      }
    }
    loadRedemptions()
  }, [codeId])

  // Check if user has permission to send invites
  useEffect(() => {
    async function checkPermission() {
      if (!code || !user?.wallet) {
        setPermissionLoading(false)
        setCanSendInvite(false)
        return
      }

      try {
        setPermissionLoading(true)
        
        // Debug logging
        console.log('[Permission Check] Code:', code.code)
        console.log('[Permission Check] Code Creator:', code.createdBy)
        console.log('[Permission Check] Context ID:', code.contextId)
        console.log('[Permission Check] User Wallet:', user.wallet)
        
        // Case 1: User is the code creator
        if (code.createdBy === user.wallet) {
          console.log('[Permission Check] User is code creator -> ALLOW')
          setCanSendInvite(true)
          setPermissionLoading(false)
          return
        }

        // Case 2: Check if user has invite permission via code redemption OR is context owner
        // fetchPermittedContexts returns contexts where:
        // - User is the context owner, OR
        // - User has redeemed a code with invite permission
        const permittedContexts = await fetchPermittedContexts(user.wallet)
        
        console.log('[Permission Check] Permitted contexts:', permittedContexts.contexts.map(c => ({ id: c.id, name: c.name })))
        
        // Verify code.contextId exists and is in the permitted list
        if (!code.contextId) {
          console.log('[Permission Check] No contextId on code -> DENY')
          setCanSendInvite(false)
          setPermissionLoading(false)
          return
        }
        
        const hasPermission = permittedContexts.contexts.some(
          (ctx) => ctx.id === code.contextId
        )
        
        console.log('[Permission Check] Has permission:', hasPermission)
        setCanSendInvite(hasPermission)
      } catch (err) {
        console.error('[Permission Check] Error:', err)
        setCanSendInvite(false)
      } finally {
        setPermissionLoading(false)
      }
    }
    checkPermission()
  }, [code, user?.wallet])

  // Editable fields for Send Invite section
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [personalMessage, setPersonalMessage] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const handleCopyCode = useCallback(() => {
    if (!code) return
    navigator.clipboard.writeText(code.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const handleSendInvite = useCallback(async () => {
    if (!code) return
    
    // Validate inputs
    if (!inviteName.trim()) {
      setInviteError('Please enter the recipient name')
      return
    }
    if (!inviteEmail.trim()) {
      setInviteError('Please enter the recipient email')
      return
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail)) {
      setInviteError('Please enter a valid email address')
      return
    }
    
    setResending(true)
    setInviteError(null)
    setInviteSuccess(null)
    
    try {
      const result = await sendInvite(
        code.id,
        inviteName.trim(),
        inviteEmail.trim(),
        personalMessage.trim() || undefined
      )
      
      console.log('Invite sent:', result)
      setInviteSuccess(`Invitation sent to ${inviteEmail}!`)
      
      // Clear form after success
      setInviteName('')
      setInviteEmail('')
      setPersonalMessage('')
    } catch (err) {
      console.error('Failed to send invite:', err)
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setResending(false)
    }
  }, [code, inviteName, inviteEmail, personalMessage])

  const handleDisableCode = useCallback(async () => {
    if (!code) return
    console.log('Disabling code:', code.id)
    setDisabling(true)
    try {
      const result = await toggleCode(code.id, false)
      console.log('Disable result:', result)
      setDisableConfirm(false)
      // Navigate back to list after disabling
      router.push('/codes')
    } catch (err) {
      console.error('Failed to disable code:', err)
      alert(`Failed to disable code: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setDisabling(false)
    }
  }, [code, router])

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never'
    // Append 'Z' if no timezone info to treat as UTC, then convert to local
    const dateStr = dateString.includes('Z') || dateString.includes('+') ? dateString : dateString + 'Z'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return 'N/A'
    // Append 'Z' if no timezone info to treat as UTC, then convert to local
    const dateStr = dateString.includes('Z') || dateString.includes('+') ? dateString : dateString + 'Z'
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getAccessScope = (code: AccessCode): string => {
    if (code.accessType === 'ecosystem') return code.context?.name || 'Full Presence Access'
    if (code.accessType === 'gathering' && code.gathering?.name)
      return code.gathering.name
    return 'Unknown'
  }

  const isExpiringSoon = (dateString: string | null): boolean => {
    if (!dateString) return false
    const date = new Date(dateString)
    const now = new Date()
    const daysUntilExpiry = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30
  }

  // Loading state
  if (!code) {
    return (
      <>
        <PageHeader
          title="Code Details"
          subtitle="Loading..."
          action={
            <Link
              href="/codes"
              className="flex items-center gap-2 text-muted hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
              Back to Codes
            </Link>
          }
        />
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Code Details"
        subtitle={code.code}
        action={
          <Link
            href="/codes"
            className="flex items-center gap-2 text-muted hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            Back to Codes
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Code Card */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center">
                  <KeyRound size={28} className="text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted mb-1">Invitation Code</p>
                  <h2 className="text-xl font-mono font-bold text-white tracking-wider">{code.code}</h2>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-sm text-white transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={16} className="text-emerald-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy
                    </>
                  )}
                </button>
                <StatusBadge status={code.status} />
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-sidebar rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted text-xs mb-2">
                  <Building2 size={14} className="flex-shrink-0" style={{ color: '#eb8000' }} />
                  Box
                </div>
                <p className="text-sm text-white">{code.context?.name || 'N/A'}</p>
              </div>

              <div className="bg-sidebar rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted text-xs mb-2">
                  <UserCog size={14} className="flex-shrink-0" style={{ color: '#eb8000' }} />
                  Role
                </div>
                <p className="text-sm text-white">{code.scope?.name || 'N/A'}</p>
              </div>

              <div className="bg-sidebar rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted text-xs mb-2">
                  <Sparkles size={14} className="flex-shrink-0" style={{ color: '#eb8000' }} />
                  Access Type
                </div>
                <AccessTypeBadge accessType={code.accessType} />
              </div>
            </div>

            {/* Second Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-sidebar rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted text-xs mb-2">
                  <Calendar size={14} className="flex-shrink-0" style={{ color: '#eb8000' }} />
                  Created
                </div>
                <p className="text-sm text-white">{formatDate(code.createdAt)}</p>
              </div>

              <div className="bg-sidebar rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted text-xs mb-2">
                  <Clock size={14} className="flex-shrink-0" style={{ color: '#eb8000' }} />
                  Expires
                </div>
                <p
                  className={`text-sm ${code.status.toLowerCase() === 'active' && isExpiringSoon(code.expiresAt)
                      ? 'text-amber-400'
                      : 'text-white'
                    }`}
                >
                  {formatDate(code.expiresAt)}
                </p>
                {code.status.toLowerCase() === 'active' && isExpiringSoon(code.expiresAt) && (
                  <p className="text-xs text-amber-400/80 mt-0.5">Expiring soon</p>
                )}
              </div>

              <div className="bg-sidebar rounded-xl p-4">
                <div className="flex items-center gap-2 text-muted text-xs mb-2">
                  <DollarSign size={14} className="flex-shrink-0" style={{ color: '#eb8000' }} />
                  Price
                </div>
                <p className="text-sm text-white">
                  {code.price && Number(code.price) > 0 ? `$${Number(code.price).toFixed(2)}` : 'Free'}
                </p>
              </div>
            </div>

            {/* Access Scope */}
            {(code.accessType === 'gathering' || code.accessType === 'ecosystem') && (
              <div className="mt-4 p-4 bg-sidebar rounded-xl border border-card-border">
                <p className="text-xs text-muted mb-1">Access Scope</p>
                <p className="text-sm text-white font-medium">{getAccessScope(code)}</p>
                {code.accessType === 'ecosystem' && (
                  <p className="text-xs text-muted mt-1">
                    Full access to all gatherings and content within this presence as {code.role === 'member' ? 'Member' : 'Guest'}
                  </p>
                )}
                {code.accessType === 'gathering' && code.context?.name && (
                  <p className="text-xs text-muted mt-1">
                    Access to this gathering within {code.context.name} as {code.role === 'member' ? 'Member' : 'Guest'}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-6 pt-6 border-t border-card-border">
              {code.status.toLowerCase() === 'active' && (
                <button
                  onClick={() => setDisableConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm font-medium rounded-lg transition-colors"
                >
                  <Ban size={16} />
                  Disable Code
                </button>
              )}
            </div>
          </Card>

          {/* Send Invitation Via - Only show for active codes */}
          {code.status.toLowerCase() === 'active' && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Send size={18} className="text-accent" />
                Send Invitation Via
              </h3>
              <div className="grid grid-cols-5 gap-3">
                {/* Email - Active */}
                <div className="w-full p-4 rounded-xl border border-accent bg-accent/10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                      <Mail size={20} className="text-accent" />
                    </div>
                    <span className="font-medium text-sm text-accent">Email</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      Active
                    </span>
                  </div>
                </div>

                {/* Kinship - Coming Soon */}
                <div className="relative group">
                  <div className="w-full p-4 rounded-xl border border-card-border bg-white/[0.02] opacity-50 text-center cursor-not-allowed">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <Lock size={18} className="text-muted" />
                      </div>
                      <span className="font-medium text-sm text-muted">Kinship</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-muted">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-card border border-card-border rounded-lg text-xs text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Kinship invitations coming soon
                  </div>
                </div>

                {/* SMS - Coming Soon */}
                <div className="relative group">
                  <div className="w-full p-4 rounded-xl border border-card-border bg-white/[0.02] opacity-50 text-center cursor-not-allowed">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <Lock size={18} className="text-muted" />
                      </div>
                      <span className="font-medium text-sm text-muted">SMS</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-muted">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-card border border-card-border rounded-lg text-xs text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    SMS invitations coming soon
                  </div>
                </div>

                {/* Telegram - Coming Soon */}
                <div className="relative group">
                  <div className="w-full p-4 rounded-xl border border-card-border bg-white/[0.02] opacity-50 text-center cursor-not-allowed">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <Lock size={18} className="text-muted" />
                      </div>
                      <span className="font-medium text-sm text-muted">Telegram</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-muted">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-card border border-card-border rounded-lg text-xs text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Telegram invitations coming soon
                  </div>
                </div>

                {/* Bluesky - Coming Soon */}
                <div className="relative group">
                  <div className="w-full p-4 rounded-xl border border-card-border bg-white/[0.02] opacity-50 text-center cursor-not-allowed">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <Lock size={18} className="text-muted" />
                      </div>
                      <span className="font-medium text-sm text-muted">Bluesky</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-muted">
                        Coming Soon
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-card border border-card-border rounded-lg text-xs text-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Bluesky invitations coming soon
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Send Invite - Only show for active codes */}
          {code.status.toLowerCase() === 'active' && (
            <Card className="p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <User size={18} className="text-accent" />
                Send Invite
              </h3>
              
              {/* Permission Loading State */}
              {permissionLoading && (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="sm" />
                </div>
              )}
              
              {/* No Permission State */}
              {!permissionLoading && !canSendInvite && (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center mx-auto mb-3">
                    <Lock size={24} className="text-muted" />
                  </div>
                  <p className="text-muted text-sm mb-1">Permission Required</p>
                  <p className="text-white/40 text-xs">
                    You need invite permission for this context to send invitations.
                  </p>
                </div>
              )}
              
              {/* Has Permission - Show Form */}
              {!permissionLoading && canSendInvite && (
                <div className="space-y-4">
                  {/* Success Message */}
                  {inviteSuccess && (
                    <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
                      <Check size={16} className="text-emerald-400" />
                      <span className="text-emerald-400 text-sm">{inviteSuccess}</span>
                    </div>
                  )}
                  
                  {/* Error Message */}
                  {inviteError && (
                    <div className="bg-red-500/15 border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
                      <Ban size={16} className="text-red-400" />
                      <span className="text-red-400 text-sm">{inviteError}</span>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-white/70 text-sm block mb-2">Name</label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(e) => {
                          setInviteName(e.target.value)
                          setInviteError(null)
                        }}
                        placeholder="John Smith"
                        className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-white/70 text-sm block mb-2">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => {
                          setInviteEmail(e.target.value)
                          setInviteError(null)
                        }}
                        placeholder="john@example.com"
                        className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Personal Message */}
                  <div>
                    <label className="text-white/70 text-sm block mb-2">
                      Personal Message <span className="text-muted">(optional)</span>
                    </label>
                    <textarea
                      value={personalMessage}
                      onChange={(e) => setPersonalMessage(e.target.value)}
                      placeholder="Hey! I'd love for you to join us..."
                      rows={3}
                      maxLength={500}
                      className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors resize-none"
                    />
                    <p className="text-muted text-xs mt-1 text-right">
                      {personalMessage.length}/500 characters
                    </p>
                  </div>

                  {/* Send Invite Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleSendInvite}
                      disabled={resending}
                      className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white text-sm font-medium rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      {resending ? (
                        <>
                          <Spinner size="sm" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          Send Invite
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Transaction History Section */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b border-card-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <DollarSign size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">Transaction History</h3>
                    <p className="text-muted text-sm">
                      {redemptionsLoading ? 'Loading...' : `${redemptionsTotal} user${redemptionsTotal !== 1 ? 's' : ''} joined`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total Revenue</p>
                  <p className="text-2xl font-bold text-white">
                    {code.price && Number(code.price) > 0
                      ? `$${(Number(code.price) * redemptionsTotal).toFixed(2)}`
                      : '$0.00'
                    }
                  </p>
                </div>
              </div>
            </div>

            {redemptionsLoading ? (
              <div className="p-8 text-center">
                <Spinner size="md" />
                <p className="text-muted text-sm mt-2">Loading transactions...</p>
              </div>
            ) : redemptionsError ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center mx-auto mb-3">
                  <Ban size={24} className="text-red-400" />
                </div>
                <p className="text-red-400 text-sm">{redemptionsError}</p>
                <button
                  onClick={() => {
                    setRedemptionsLoading(true)
                    setRedemptionsError(null)
                    fetchCodeRedemptions(codeId)
                      .then((data: CodeRedemptionsResponse) => {
                        setRedemptions(data.members)
                        setRedemptionsTotal(data.total)
                      })
                      .catch((err: Error) => {
                        setRedemptionsError(err.message || 'Failed to load')
                      })
                      .finally(() => setRedemptionsLoading(false))
                  }}
                  className="mt-3 text-xs text-accent hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : redemptions.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center mx-auto mb-3">
                  <DollarSign size={24} className="text-muted" />
                </div>
                <p className="text-muted text-sm">No transactions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-card-border">
                {redemptions.map((member) => (
                  <div
                    key={member.id}
                    className="p-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
                          <User size={18} className="text-accent" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm font-mono">
                            {member.wallet.slice(0, 6)}...{member.wallet.slice(-4)}
                          </p>
                          <p className="text-muted text-xs capitalize">{member.role}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-emerald-400">
                          {code.price && Number(code.price) > 0 ? `+$${Number(code.price).toFixed(2)}` : 'Free'}
                        </p>
                        <p className="text-xs text-muted">{formatDateTime(member.redeemedAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar - Right Side */}
        <div className="space-y-6">
          {/* Stats Card */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Users size={16} className="text-accent" />
              Statistics
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-sidebar rounded-xl">
                <span className="text-sm text-muted">Users Joined</span>
                <span className="text-lg font-bold text-white">{redemptionsLoading ? '...' : redemptionsTotal}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-sidebar rounded-xl">
                <span className="text-sm text-muted">Status</span>
                <StatusBadge status={code.status} />
              </div>
            </div>
          </Card>

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
                  className={`w-full p-3 rounded-xl border text-left transition-all ${role === option.value
                      ? option.value === 'member'
                        ? 'border-accent bg-accent/10'
                        : 'border-white/30 bg-white/[0.08]'
                      : 'border-card-border hover:border-white/20 hover:bg-white/[0.03]'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`font-medium text-sm ${role === option.value ? 'text-white' : 'text-white/80'
                        }`}
                    >
                      {option.label}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${role === option.value
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

          {/* Timeline Card */}
          <Card className="p-6">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Clock size={16} className="text-accent" />
              Timeline
            </h3>

            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div className="w-px h-full bg-card-border" />
                </div>
                <div className="pb-4">
                  <p className="text-xs text-muted">Created</p>
                  <p className="text-sm text-white">{formatDateTime(code.createdAt)}</p>
                </div>
              </div>

              {redemptions.length > 0 && (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                    <div className="w-px h-full bg-card-border" />
                  </div>
                  <div className="pb-4">
                    <p className="text-xs text-muted">First User Joined</p>
                    <p className="text-sm text-white">
                      {formatDateTime(redemptions[redemptions.length - 1].redeemedAt)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-2 h-2 rounded-full ${code.status.toLowerCase() === 'expired'
                        ? 'bg-white/40'
                        : code.status.toLowerCase() === 'disabled'
                          ? 'bg-red-400'
                          : 'bg-amber-400'
                      }`}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted">
                    {code.status.toLowerCase() === 'expired'
                      ? 'Expired'
                      : code.status.toLowerCase() === 'disabled'
                        ? 'Disabled'
                        : 'Expires'}
                  </p>
                  <p className="text-sm text-white">
                    {code.status.toLowerCase() === 'disabled'
                      ? formatDateTime(code.updatedAt)
                      : formatDateTime(code.expiresAt)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Disable Confirmation Dialog */}
      <ConfirmDialog
        open={disableConfirm}
        title="Disable Access Code"
        message={`Are you sure you want to disable the access code ${code.code}? It will no longer be usable to access the ${code.accessType === 'ecosystem' ? 'presence' : 'gathering'}.`}
        confirmLabel="Disable Code"
        variant="danger"
        loading={disabling}
        onConfirm={handleDisableCode}
        onCancel={() => setDisableConfirm(false)}
      />
    </>
  )
}