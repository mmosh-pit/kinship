'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Card, EmptyState, Spinner, ConfirmDialog } from '@/components/UI'
import { useAuth } from '@/lib/auth-context'
import { fetchAccessibleCodes, fetchPermittedContexts, toggleCode } from '@/lib/codes-api'
import type { AccessibleCode, AccessType, CodeStatus, AccessSource, PermittedContext } from '@/lib/types'
import {
  Copy,
  Check,
  Ban,
  MoreHorizontal,
  KeyRound,
  Sparkles,
  Plus,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Gamepad2,
  User,
  Shield,
} from 'lucide-react'

// Tab filter type
type TabFilter = 'all' | 'own' | 'shared'

// Access type icons and colors - Display "Presence" for ecosystem, keep gathering
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

// Status badge styles
const STATUS_STYLES: Record<CodeStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  expired: 'bg-white/10 text-muted border-white/10',
  disabled: 'bg-red-500/15 text-red-400 border-red-500/20',
  redeemed: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
}

// Access source styles
const ACCESS_SOURCE_CONFIG: Record<
  AccessSource,
  { icon: typeof User; label: string; color: string; bgColor: string }
> = {
  own: {
    icon: User,
    label: 'Own',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/15',
  },
  permission: {
    icon: Shield,
    label: 'Shared',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
  },
}

// Invite limit configuration
const INVITE_LIMIT_INCREMENT = 50
const INVITE_LIMIT_STORAGE_KEY = 'kinship_invite_limit'

function StatusBadge({ status }: { status: CodeStatus }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

function AccessSourceBadge({ source }: { source: AccessSource }) {
  const config = ACCESS_SOURCE_CONFIG[source]
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${config.bgColor} ${config.color}`}
    >
      <Icon size={10} />
      {config.label}
    </span>
  )
}

// Tab component
function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active
          ? 'bg-accent text-white'
          : 'bg-white/[0.05] text-muted hover:bg-white/[0.1] hover:text-white'
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${active ? 'bg-white/20' : 'bg-white/10'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// Invite Limit Progress Component
function InviteLimitProgress({
  used,
  limit,
  onAddMore,
  isExpanding,
}: {
  used: number
  limit: number
  onAddMore: () => void
  isExpanding: boolean
}) {
  const percentage = Math.min((used / limit) * 100, 100)
  const isNearLimit = percentage >= 80
  const isAtLimit = used >= limit

  return (
    <Card className="p-5 mb-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <KeyRound size={20} className="text-accent" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Invitation Quota</h3>
            <p className="text-muted text-xs">
              {used} of {limit} invitations used
            </p>
          </div>
        </div>
        
        {isAtLimit && (
          <button
            onClick={onAddMore}
            disabled={isExpanding}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dark text-white text-sm font-medium rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isExpanding ? (
              <>
                <Spinner size="sm" />
                <span>Expanding...</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>Add {INVITE_LIMIT_INCREMENT} More</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${
            isAtLimit
              ? 'bg-gradient-to-r from-red-500 to-red-400'
              : isNearLimit
              ? 'bg-gradient-to-r from-amber-500 to-amber-400'
              : 'bg-gradient-to-r from-accent to-accent-dark'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Warning message when near limit */}
      {isNearLimit && !isAtLimit && (
        <div className="flex items-center gap-2 mt-3 text-amber-400">
          <AlertCircle size={14} />
          <span className="text-xs">
            Approaching invitation limit. {limit - used} remaining.
          </span>
        </div>
      )}

      {/* At limit message */}
      {isAtLimit && (
        <div className="flex items-center gap-2 mt-3 text-white/60">
          <AlertCircle size={14} />
          <span className="text-xs">
            Invitation limit reached. Add more to continue sending invitations.
          </span>
        </div>
      )}
    </Card>
  )
}

function CodeActionsDropdown({
  code,
  onCopy,
  onDisable,
  canEdit,
}: {
  code: AccessibleCode
  onCopy: () => void
  onDisable: () => void
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopy()
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-white/[0.06] text-muted hover:text-white transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-44 bg-gray-900 border border-card-border rounded-xl shadow-xl z-20 overflow-hidden">
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white hover:bg-white/[0.06] transition-colors"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy Code
                </>
              )}
            </button>
            {canEdit && code.status === 'active' && (
              <button
                onClick={() => {
                  onDisable()
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Ban size={14} />
                Disable Code
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function CodesPage() {
  const router = useRouter()
  const { user } = useAuth()

  // Codes state
  const [codes, setCodes] = useState<AccessibleCode[]>([])
  const [loading, setLoading] = useState(true)
  const [disableConfirm, setDisableConfirm] = useState<AccessibleCode | null>(null)
  const [disabling, setDisabling] = useState(false)

  // Tab filter state
  const [activeTab, setActiveTab] = useState<TabFilter>('all')
  
  // Stats
  const [ownCount, setOwnCount] = useState(0)
  const [permittedCount, setPermittedCount] = useState(0)

  // Permitted contexts for create button visibility
  const [permittedContexts, setPermittedContexts] = useState<PermittedContext[]>([])
  const [hasInvitePermission, setHasInvitePermission] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCodes, setTotalCodes] = useState(0)
  const ITEMS_PER_PAGE = 10

  // Invite limit state
  const [inviteLimit, setInviteLimit] = useState(INVITE_LIMIT_INCREMENT)
  const [isExpandingLimit, setIsExpandingLimit] = useState(false)

  // Initialize invite limit from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(INVITE_LIMIT_STORAGE_KEY)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed) && parsed >= INVITE_LIMIT_INCREMENT) {
        setInviteLimit(parsed)
      }
    }
  }, [])

  // Fetch codes and permitted contexts on mount
  useEffect(() => {
    async function loadData() {
      if (!user?.wallet) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        
        // Fetch accessible codes
        const codesResult = await fetchAccessibleCodes(user.wallet)
        setCodes(codesResult.codes)
        setOwnCount(codesResult.ownCount)
        setPermittedCount(codesResult.permittedCount)
        setTotalCodes(codesResult.total)

        // Fetch permitted contexts
        const contextsResult = await fetchPermittedContexts(user.wallet)
        setPermittedContexts(contextsResult.contexts)
        // User can create codes if they own any codes OR have invite permission
        setHasInvitePermission(contextsResult.total > 0 || codesResult.ownCount > 0)
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user?.wallet])

  // Filter codes based on active tab
  const filteredCodes = codes.filter((code) => {
    if (activeTab === 'own') return code.accessSource === 'own'
    if (activeTab === 'shared') return code.accessSource === 'permission'
    return true
  })

  // Paginate filtered codes
  const totalPages = Math.ceil(filteredCodes.length / ITEMS_PER_PAGE)
  const paginatedCodes = filteredCodes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Reset to page 1 when tab changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab])

  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [totalPages])

  const handleCopyCode = useCallback((code: AccessibleCode) => {
    console.log('Code copied:', code.code)
  }, [])

  const handleDisableCode = useCallback((code: AccessibleCode) => {
    setDisableConfirm(code)
  }, [])

  const confirmDisable = useCallback(async () => {
    if (!disableConfirm) return

    setDisabling(true)
    try {
      await toggleCode(disableConfirm.id, false)
      setCodes((prev) =>
        prev.map((c) =>
          c.id === disableConfirm.id ? { ...c, isActive: false, status: 'disabled' as CodeStatus } : c
        )
      )
    } catch (err) {
      console.error('Failed to disable code:', err)
    } finally {
      setDisabling(false)
      setDisableConfirm(null)
    }
  }, [disableConfirm])

  const handleAddMoreInvites = useCallback(async () => {
    setIsExpandingLimit(true)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    setInviteLimit((prev) => {
      const newLimit = prev + INVITE_LIMIT_INCREMENT
      localStorage.setItem(INVITE_LIMIT_STORAGE_KEY, String(newLimit))
      return newLimit
    })
    setIsExpandingLimit(false)
  }, [])

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
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

  return (
    <>
      <PageHeader
        title="Invitation Codes"
        subtitle="Manage access codes for your presence and gatherings"
        action={
          <Link href="/codes/create">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold rounded-xl transition-colors">
              <Plus size={18} />
              Create Code
            </button>
          </Link>
        }
      />

      {/* Invite Limit Progress - only show for own codes */}
      {!loading && ownCount > 0 && (
        <InviteLimitProgress
          used={ownCount}
          limit={inviteLimit}
          onAddMore={handleAddMoreInvites}
          isExpanding={isExpandingLimit}
        />
      )}

      {/* Tab Filters */}
      {!loading && codes.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          <TabButton
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            count={codes.length}
          >
            All
          </TabButton>
          <TabButton
            active={activeTab === 'own'}
            onClick={() => setActiveTab('own')}
            count={ownCount}
          >
            <span className="flex items-center gap-1.5">
              <User size={14} />
              Own
            </span>
          </TabButton>
          {permittedCount > 0 && (
            <TabButton
              active={activeTab === 'shared'}
              onClick={() => setActiveTab('shared')}
              count={permittedCount}
            >
              <span className="flex items-center gap-1.5">
                <Shield size={14} />
                Shared
              </span>
            </TabButton>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Empty State */}
      {!loading && codes.length === 0 && (
        <EmptyState
          icon="🔑"
          title="No invitation codes yet"
          description="Create your first invitation code to share access to your presence or gatherings."
          action={
            <Link href="/codes/create">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-dark text-white text-sm font-semibold rounded-xl transition-colors">
                <Plus size={18} />
                Create Code
              </button>
            </Link>
          }
        />
      )}

      {/* Codes Table */}
      {!loading && paginatedCodes.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-5 py-4">
                    Code
                  </th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-5 py-4">
                    Source
                  </th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-5 py-4">
                    Context / Role
                  </th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-5 py-4">
                    Status
                  </th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wider px-5 py-4">
                    Expires
                  </th>
                  <th className="text-right text-xs font-semibold text-muted uppercase tracking-wider px-5 py-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCodes.map((code) => (
                  <tr
                    key={code.id}
                    onClick={() => router.push(`/codes/${code.id}`)}
                    className="border-b border-card-border last:border-0 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center">
                          <KeyRound size={16} className="text-accent" />
                        </div>
                        <p className="text-white font-mono font-medium text-sm">
                          {code.code}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <AccessSourceBadge source={code.accessSource} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-white">
                          {code.contextName || 'Unknown Context'}
                        </span>
                        {code.roleName && (
                          <span className="text-xs text-muted">
                            {code.roleName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={code.status} />
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-sm ${
                          code.status === 'active' && isExpiringSoon(code.expiresAt)
                            ? 'text-amber-400'
                            : 'text-muted'
                        }`}
                      >
                        {formatDate(code.expiresAt)}
                        {code.status === 'active' &&
                          isExpiringSoon(code.expiresAt) && (
                            <span className="block text-xs text-amber-400/80">
                              Expiring soon
                            </span>
                          )}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div onClick={(e) => e.stopPropagation()}>
                          <CodeActionsDropdown
                            code={code}
                            onCopy={() => handleCopyCode(code)}
                            onDisable={() => handleDisableCode(code)}
                            canEdit={code.accessSource === 'own'}
                          />
                        </div>
                        <ChevronRight size={16} className="text-muted group-hover:text-white transition-colors" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-card-border">
              <div className="text-sm text-muted">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredCodes.length)} of {filteredCodes.length} codes
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                
                {/* Page numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      if (page === 1 || page === totalPages) return true
                      if (Math.abs(page - currentPage) <= 1) return true
                      return false
                    })
                    .reduce((acc: (number | string)[], page, idx, arr) => {
                      if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                        acc.push('...')
                      }
                      acc.push(page)
                      return acc
                    }, [])
                    .map((item, idx) => (
                      item === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted">...</span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => handlePageChange(item as number)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                            currentPage === item
                              ? 'bg-accent text-white'
                              : 'bg-white/[0.05] hover:bg-white/[0.1] text-white'
                          }`}
                        >
                          {item}
                        </button>
                      )
                    ))
                  }
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Summary Stats */}
      {!loading && codes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <KeyRound size={20} className="text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{totalCodes}</p>
                <p className="text-xs text-muted">Total Codes</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <User size={20} className="text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{ownCount}</p>
                <p className="text-xs text-muted">Own Codes</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Shield size={20} className="text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{permittedCount}</p>
                <p className="text-xs text-muted">Shared Codes</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Disable Confirmation Dialog */}
      <ConfirmDialog
        open={disableConfirm !== null}
        title="Disable Access Code"
        message={`Are you sure you want to disable the access code ${disableConfirm?.code}? It will no longer be usable.`}
        confirmLabel="Disable Code"
        variant="danger"
        loading={disabling}
        onConfirm={confirmDisable}
        onCancel={() => setDisableConfirm(null)}
      />
    </>
  )
}