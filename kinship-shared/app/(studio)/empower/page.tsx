'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { useStudio } from '@/lib/studio-context'
import { useAuth } from '@/lib/auth-context'
import type { Presence } from '@/lib/agent-types'
import { Spinner } from '@/components/UI'
import { listAgents, updateAgent, listEmpowerAgents, type EmpowerPresence, type EmpowerWorker, type AccessType } from '@/lib/agents-api'
import { listKnowledgeBases, type KnowledgeBase } from '@/lib/knowledge-api'
import { listPrompts, type Prompt } from '@/lib/prompts-api'
import { verifyToolCredentials, connectToolToWorker, disconnectToolFromWorker, listWorkerToolConnections } from '@/lib/tools-api'

// ─── Types ──────────────────────────────────────────────────────────────────

// Extended Presence type for empower page (includes access_type and camelCase aliases)
type EmpowerAgentPresence = EmpowerPresence & {
  knowledgeBaseIds?: string[]
  promptId?: string
  tools?: string[]
  accessLevel?: string  // camelCase alias for access_level
}

type EmpowerAgentWorker = EmpowerWorker & {
  knowledgeBaseIds?: string[]
  promptId?: string
  accessLevel?: string  // camelCase alias for access_level (workers have this too)
  handle?: string       // Workers don't have handles but needed for union type
}

type Tool = {
  id: string
  name: string
  icon: string
  description: string
  authType: string
  status: 'connected' | 'disconnected'
  connectedAs?: string
}

type SelectionType = 'presence' | 'worker'
type TabType = 'knowledge' | 'instruct' | 'tools'

// ─── Available Tools (same as Worker creation Step 2) ────────────────────────

const AVAILABLE_TOOLS: Tool[] = [
  {
    id: 'bluesky',
    name: 'Bluesky',
    description: 'Post, reply, and engage on Bluesky social network',
    icon: 'lucide:cloud',
    authType: 'app_password',
    status: 'disconnected',
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Access Google services (Calendar, Drive, Gmail)',
    icon: 'mdi:google',
    authType: 'oauth2',
    status: 'disconnected',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Send messages and manage Telegram bots',
    icon: 'lucide:send',
    authType: 'bot_token',
    status: 'disconnected',
  },
  {
    id: 'solana',
    name: 'Solana',
    description: 'Interact with Solana blockchain and wallets',
    icon: 'simple-icons:solana',
    authType: 'wallet',
    status: 'disconnected',
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Send and receive emails',
    icon: 'lucide:mail',
    authType: 'app_password',
    status: 'disconnected',
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    description: 'Post tweets, reply, and engage',
    icon: 'lucide:twitter',
    authType: 'app_password',
    status: 'disconnected',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Manage channels and send messages',
    icon: 'lucide:message-circle',
    authType: 'app_password',
    status: 'disconnected',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Schedule and manage events',
    icon: 'lucide:calendar',
    authType: 'app_password',
    status: 'disconnected',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Create and update pages',
    icon: 'lucide:file-text',
    authType: 'app_password',
    status: 'disconnected',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages to channels',
    icon: 'lucide:hash',
    authType: 'app_password',
    status: 'disconnected',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage repos and issues',
    icon: 'lucide:github',
    authType: 'app_password',
    status: 'disconnected',
  },
]

// Tools that are currently enabled for connection (same as Worker creation Step 2)
const ENABLED_TOOLS = ['bluesky', 'telegram', 'solana', 'google']

// Google tools - expanded array stored in agents.tools
const GOOGLE_TOOLS = ['google_gmail_tool', 'google_calendar_tool', 'google_meet_tool']

// ─── Toast Notification ─────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose
}: {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${type === 'success'
      ? 'bg-green-500/20 border-green-500/30 text-green-300'
      : 'bg-red-500/20 border-red-500/30 text-red-300'
      }`}>
      <Icon
        icon={type === 'success' ? 'lucide:check-circle' : 'lucide:alert-circle'}
        width={20}
        height={20}
      />
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70 cursor-pointer">
        <Icon icon="lucide:x" width={16} height={16} />
      </button>
    </div>
  )
}

// ─── Tool Connection Modal (matches Worker creation Step 2) ─────────────────

// Tool instructions for each supported tool
const TOOL_INSTRUCTIONS: Record<string, string> = {
  bluesky: '1. Go to Bluesky → Settings → App Passwords\n2. Click "Add App Password"\n3. Name it "Kinship Agent"\n4. Copy the generated password',
  google: 'Click "Sign in with Google" to authorize access via OAuth',
  telegram: '1. Open Telegram and search for @BotFather\n2. Send /newbot and follow instructions\n3. Copy the Bot Token provided',
  solana: '1. Connect your Solana wallet\n2. Approve the connection request\n3. Your agent will have read access to your wallet',
}

function ToolConnectionModal({
  tool,
  onClose,
  onConnect,
}: {
  tool: Tool
  onClose: () => void
  onConnect: (toolId: string, connectedAs: string, credentials?: Record<string, string>) => Promise<void>
}) {
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bluesky
  const [blueskyHandle, setBlueskyHandle] = useState('')
  const [blueskyAppPassword, setBlueskyAppPassword] = useState('')

  // Telegram
  const [telegramBotToken, setTelegramBotToken] = useState('')

  // Google OAuth popup
  const [oauthPopup, setOauthPopup] = useState<Window | null>(null)

  // Listen for OAuth popup messages
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'oauth_success' && event.data?.provider === tool.id) {
        const { credentials, displayName } = event.data
        setVerifying(false)
        setOauthPopup(null)
        onConnect(tool.id, displayName || credentials?.email || 'Connected', credentials)
        onClose()
      } else if (event.data?.type === 'oauth_error' && event.data?.provider === tool.id) {
        setError(event.data.error || 'OAuth failed')
        setVerifying(false)
        setOauthPopup(null)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [tool.id, onConnect, onClose])

  // Check if popup was closed without completing OAuth
  useEffect(() => {
    if (!oauthPopup) return

    const checkPopup = setInterval(() => {
      if (oauthPopup.closed) {
        setVerifying(false)
        setOauthPopup(null)
        clearInterval(checkPopup)
      }
    }, 500)

    return () => clearInterval(checkPopup)
  }, [oauthPopup])

  function handleGoogleOAuth() {
    setVerifying(true)
    setError(null)

    const backendUrl = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const popup = window.open(
      `${backendUrl}/api/oauth/google/init?popup=true`,
      'google_oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    )

    if (popup) {
      setOauthPopup(popup)
      popup.focus()
    } else {
      setError('Popup blocked. Please allow popups for this site.')
      setVerifying(false)
    }
  }

  async function handleVerifyAndConnect() {
    setVerifying(true)
    setError(null)

    try {
      if (tool.id === 'bluesky') {
        if (!blueskyHandle.trim() || !blueskyAppPassword.trim()) {
          setError('Please enter both handle and app password')
          setVerifying(false)
          return
        }

        const result = await verifyToolCredentials('bluesky', {
          handle: blueskyHandle.trim(),
          app_password: blueskyAppPassword.trim(),
        })

        if (!result.success) {
          setError(result.error || 'Invalid credentials')
          setVerifying(false)
          return
        }

        await onConnect(
          tool.id,
          result.externalHandle || `@${blueskyHandle}`,
          result.credentials || { handle: blueskyHandle.trim(), app_password: blueskyAppPassword.trim() }
        )
        onClose()

      } else if (tool.id === 'telegram') {
        if (!telegramBotToken.trim()) {
          setError('Please enter the bot token')
          setVerifying(false)
          return
        }

        const result = await verifyToolCredentials('telegram', {
          bot_token: telegramBotToken.trim(),
        })

        if (!result.success) {
          setError(result.error || 'Invalid bot token')
          setVerifying(false)
          return
        }

        await onConnect(
          tool.id,
          result.externalHandle || `Bot: ${telegramBotToken.slice(0, 8)}…`,
          result.credentials || { bot_token: telegramBotToken.trim() }
        )
        onClose()

      } else if (tool.id === 'google') {
        handleGoogleOAuth()
        return
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      if (tool.id !== 'google') {
        setVerifying(false)
      }
    }
  }

  const instructions = TOOL_INSTRUCTIONS[tool.id]

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-card-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Icon icon={tool.icon} width={20} height={20} className="text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Connect {tool.name}</h2>
              <p className="text-xs text-muted">{tool.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors cursor-pointer">
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Instructions */}
          {instructions && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 mb-6">
              <h4 className="text-sm font-medium text-accent flex items-center gap-2 mb-2">
                <Icon icon="lucide:info" width={14} height={14} />
                How to get credentials
              </h4>
              <p className="text-xs text-muted whitespace-pre-line">{instructions}</p>
            </div>
          )}

          {/* Bluesky Form */}
          {tool.id === 'bluesky' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Bluesky Handle
                </label>
                <input
                  type="text"
                  value={blueskyHandle}
                  onChange={(e) => setBlueskyHandle(e.target.value)}
                  placeholder="username.bsky.social"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  App Password
                </label>
                <input
                  type="password"
                  value={blueskyAppPassword}
                  onChange={(e) => setBlueskyAppPassword(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  autoComplete="new-password"
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
            </div>
          )}

          {/* Telegram Form */}
          {tool.id === 'telegram' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Bot Token
                </label>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-input border border-card-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Google OAuth */}
          {tool.id === 'google' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-card-border text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto mb-3">
                  <Icon icon="logos:google-icon" width={28} height={28} />
                </div>
                <p className="text-sm text-foreground mb-1">
                  Connect your Google account
                </p>
                <p className="text-xs text-muted">
                  Access Gmail, Calendar, and Drive
                </p>
              </div>

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted">
                  <Icon icon="lucide:loader-2" width={16} height={16} className="animate-spin" />
                  Waiting for authorization...
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-sm text-red-400 flex items-center gap-2">
                <Icon icon="lucide:alert-circle" width={14} height={14} />
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-card-border bg-background/50">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-foreground hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleVerifyAndConnect}
            disabled={verifying}
            className="bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
          >
            {verifying ? (
              <>
                <Icon icon="lucide:loader-2" width={16} height={16} className="animate-spin" />
                {tool.id === 'google' ? 'Authorizing...' : 'Verifying...'}
              </>
            ) : tool.id === 'google' ? (
              <>
                <Icon icon="logos:google-icon" width={16} height={16} />
                Sign in with Google
              </>
            ) : (
              <>
                <Icon icon="lucide:link" width={16} height={16} />
                Connect
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Empower Page ──────────────────────────────────────────────────────

export default function EmpowerPage() {
  const router = useRouter()
  const { currentPlatform } = useStudio()
  const { user } = useAuth()

  // Agents state - now using empower types with access_type
  const [presenceAgents, setPresenceAgents] = useState<EmpowerAgentPresence[]>([])
  const [workerAgents, setWorkerAgents] = useState<EmpowerAgentWorker[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selection state
  const [selectionType, setSelectionType] = useState<SelectionType | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('knowledge')

  // Knowledge state
  const [allKnowledgeBases, setAllKnowledgeBases] = useState<KnowledgeBase[]>([])

  // Prompts state
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([])

  // Tools state
  const [tools, setTools] = useState<Tool[]>(AVAILABLE_TOOLS)
  const [activeToolId, setActiveToolId] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Derived state
  const selectedAgent = selectionType === 'presence'
    ? presenceAgents.find((a) => a.id === selectedAgentId)
    : workerAgents.find((a) => a.id === selectedAgentId)

  const activeTool = tools.find((t) => t.id === activeToolId)

  // ─── Fetch Agents ─────────────────────────────────────────────────────────

  const fetchAgents = useCallback(async (isRefresh = false) => {
    if (!user?.wallet) {
      setInitialLoading(false)
      return
    }

    if (!isRefresh) {
      setInitialLoading(true)
    }
    setError(null)

    try {
      // Use empower endpoint to get owned + shared agents with per-user tool status
      const result = await listEmpowerAgents({
        wallet: user.wallet,
      })

      // Map to extended types with additional fields and camelCase aliases
      const presences = result.presences.map(p => ({
        ...p,
        knowledgeBaseIds: [] as string[], // Will be fetched separately if needed
        promptId: undefined as string | undefined,
        tools: [] as string[],
        accessLevel: p.access_level, // camelCase alias
      }))
      
      const workers = result.workers.map(w => ({
        ...w,
        knowledgeBaseIds: [] as string[],
        promptId: undefined as string | undefined,
        accessLevel: undefined as string | undefined, // Workers don't have access level from API
        handle: undefined as string | undefined,      // Workers don't have handles
      }))

      setPresenceAgents(presences)
      setWorkerAgents(workers)

      // Auto-select first agent only on initial load when nothing is selected
      if (!isRefresh) {
        setSelectionType((prevType) => {
          if (prevType) return prevType // Already have a selection type
          if (presences.length > 0) return 'presence'
          if (workers.length > 0) return 'worker'
          return null
        })
        setSelectedAgentId((prevId) => {
          if (prevId) return prevId // Already have a selection
          if (presences.length > 0) return presences[0].id
          if (workers.length > 0) return workers[0].id
          return null
        })
        setActiveTab((prevTab) => {
          if (prevTab !== 'knowledge') return prevTab // Already changed
          // Default based on what we're selecting
          if (presences.length > 0) return 'knowledge'
          if (workers.length > 0) return 'tools'
          return 'knowledge'
        })
      }
    } catch (err) {
      console.error('Error fetching agents:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch agents')
    } finally {
      setInitialLoading(false)
    }
  }, [user?.wallet, currentPlatform?.id])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // ─── Fetch Knowledge Bases ────────────────────────────────────────────────

  const fetchKnowledgeBases = useCallback(async () => {
    if (!user?.wallet) return

    try {
      const result = await listKnowledgeBases({
        wallet: user.wallet,
        platformId: currentPlatform?.id,
      })
      setAllKnowledgeBases(result.knowledgeBases || [])
    } catch (err) {
      console.error('Error fetching knowledge bases:', err)
    }
  }, [user?.wallet, currentPlatform?.id])

  useEffect(() => {
    fetchKnowledgeBases()
  }, [fetchKnowledgeBases])

  // ─── Fetch Prompts ────────────────────────────────────────────────────────

  const fetchPrompts = useCallback(async () => {
    if (!user?.wallet) return

    try {
      const result = await listPrompts({
        wallet: user.wallet,
        platformId: currentPlatform?.id,
      })
      setAllPrompts(result.prompts || [])
    } catch (err) {
      console.error('Error fetching prompts:', err)
    }
  }, [user?.wallet, currentPlatform?.id])

  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  // ─── Fetch Tool Connections for Worker ────────────────────────────────────

  const fetchToolConnections = useCallback(async () => {
    if (!selectedAgentId || selectionType !== 'worker' || !user?.wallet) {
      setTools(AVAILABLE_TOOLS)
      setDetailsLoading(false)
      return
    }

    // Get the selected worker agent's tools array
    const worker = workerAgents.find((a) => a.id === selectedAgentId)
    const workerTools = worker?.tools || []
    // For empower page, use connected_tools from the API (user's own connections)
    const connectedTools = worker?.connected_tools || []
    const externalHandles = worker?.external_handles || {}

    // Fetch connections from backend API with wallet (per-user credentials)
    let backendConnections: { toolName: string; status: string; externalHandle?: string }[] = []

    try {
      const connections = await listWorkerToolConnections(selectedAgentId, user.wallet)
      backendConnections = connections.map((c) => ({
        toolName: c.toolName,
        status: c.status === 'active' ? 'connected' : c.status,
        externalHandle: c.externalHandle,
      }))
    } catch (err) {
      console.error('Error fetching tool connections from backend:', err)
      // Use connected_tools from empower API as fallback
      backendConnections = connectedTools.map(toolName => ({
        toolName,
        status: 'connected',
        externalHandle: externalHandles[toolName],
      }))
    }

    console.log('Worker connected_tools from empower API:', connectedTools)
    console.log('Fetched connections from backend:', backendConnections)

    // Set tools ONCE - uses per-user connection status from empower API
    // NOTE: For shared users, this shows THEIR connections, not the owner's
    setTools(
      AVAILABLE_TOOLS.map((tool) => {
        // Check if tool has an active connection in backend tool_connections (user's own)
        const conn = backendConnections.find((c) => c.toolName === tool.id)
        const isConnected = conn?.status === 'connected'

        if (isConnected) {
          return {
            ...tool,
            status: 'connected',
            connectedAs: conn?.externalHandle || 'Connected'
          }
        }
        return { ...tool, status: 'disconnected', connectedAs: undefined }
      })
    )

    setDetailsLoading(false)
  }, [selectedAgentId, selectionType, workerAgents, user?.wallet])

  useEffect(() => {
    fetchToolConnections()
  }, [fetchToolConnections])

  // Clear details loading for presence agents (they don't fetch tools)
  useEffect(() => {
    if (selectionType === 'presence') {
      setDetailsLoading(false)
    }
  }, [selectionType, selectedAgentId])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectAgent = (type: SelectionType, agentId: string) => {
    // Only show loading if agent actually changed
    if (selectedAgentId !== agentId) {
      setDetailsLoading(true)
    }
    setSelectionType(type)
    setSelectedAgentId(agentId)
    setActiveTab(type === 'presence' ? 'knowledge' : 'tools')
  }

  const handleAddKnowledge = async (newIds: string[]) => {
    if (!selectedAgent) return

    const updatedIds = [...(selectedAgent.knowledgeBaseIds || []), ...newIds]

    try {
      await updateAgent(selectedAgent.id, { knowledgeBaseIds: updatedIds })
      setToast({ message: 'Knowledge added successfully', type: 'success' })
      fetchAgents(true) // Refresh without full page loading
    } catch (err) {
      console.error('Error adding knowledge:', err)
      setToast({ message: 'Failed to add knowledge', type: 'error' })
    }
  }

  const handleRemoveKnowledge = async (kbId: string) => {
    if (!selectedAgent) return

    const updatedIds = (selectedAgent.knowledgeBaseIds || []).filter((id) => id !== kbId)

    try {
      await updateAgent(selectedAgent.id, { knowledgeBaseIds: updatedIds })
      setToast({ message: 'Knowledge removed', type: 'success' })
      fetchAgents(true) // Refresh without full page loading
    } catch (err) {
      console.error('Error removing knowledge:', err)
      setToast({ message: 'Failed to remove knowledge', type: 'error' })
    }
  }

  const handleConnectInstruct = async (promptId: string) => {
    if (!selectedAgent) return

    try {
      await updateAgent(selectedAgent.id, { promptId })
      setToast({ message: 'Instruct connected', type: 'success' })
      fetchAgents(true) // Refresh without full page loading
    } catch (err) {
      console.error('Error connecting instruct:', err)
      setToast({ message: 'Failed to connect instruct', type: 'error' })
    }
  }

  const handleDisconnectInstruct = async () => {
    if (!selectedAgent) return

    try {
      await updateAgent(selectedAgent.id, { promptId: '' })
      setToast({ message: 'Instruct disconnected', type: 'success' })
      fetchAgents(true) // Refresh without full page loading
    } catch (err) {
      console.error('Error disconnecting instruct:', err)
      setToast({ message: 'Failed to disconnect instruct', type: 'error' })
    }
  }

  // ─── FIXED: Use connectToolToWorker from tools-api with wallet ─────
  const handleToolConnect = async (toolId: string, connectedAs: string, credentials?: Record<string, string>) => {
    if (!selectedAgentId) throw new Error('No agent selected')
    if (!user?.wallet) throw new Error('No wallet connected')

    try {
      const result = await connectToolToWorker(selectedAgentId, toolId, credentials || {}, user.wallet)

      if (!result.success) {
        throw new Error(result.error || 'Failed to connect')
      }

      // Update local state
      setTools((prev) =>
        prev.map((t) => (t.id === toolId ? {
          ...t,
          status: 'connected',
          connectedAs: result.connection?.externalHandle || connectedAs
        } : t))
      )

      // Refresh agents to update tools array
      fetchAgents(true)

      setToast({ message: `Connected to ${toolId}`, type: 'success' })
      setActiveToolId(null)
    } catch (err) {
      console.error('Error connecting tool:', err)
      throw err // Re-throw so modal can show error
    }
  }

  // ─── FIXED: Use disconnectToolFromWorker from tools-api with wallet ─
  const handleToolDisconnect = async (toolId: string) => {
    if (!selectedAgentId) return
    if (!user?.wallet) return

    try {
      await disconnectToolFromWorker(selectedAgentId, toolId, user.wallet)

      // Update local state
      setTools((prev) =>
        prev.map((t) => (t.id === toolId ? { ...t, status: 'disconnected', connectedAs: undefined } : t))
      )

      // Refresh agents to update tools array
      fetchAgents(true)

      setToast({ message: `Disconnected from ${toolId}`, type: 'success' })
    } catch (err) {
      console.error('Error disconnecting:', err)
      setToast({ message: 'Failed to disconnect', type: 'error' })
    }
  }

  // ─── Loading State ────────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Spinner size="lg" />
        <p className="text-muted mt-4">Loading agents...</p>
      </div>
    )
  }

  // ─── Error State ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center mb-4">
          <Icon icon="lucide:alert-circle" width={32} height={32} className="text-red-400" />
        </div>
        <h3 className="text-white font-semibold text-lg mb-1">Failed to load agents</h3>
        <p className="text-muted text-sm mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-accent/10 text-accent border border-accent/30 rounded-lg hover:bg-accent/20 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  // ─── Empty State ──────────────────────────────────────────────────────────

  if (presenceAgents.length === 0 && workerAgents.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Empower</h1>
            <p className="text-muted mt-1">Configure knowledge and tools for your agents</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-accent/15 border border-card-border flex items-center justify-center mb-4">
            <Icon icon="lucide:bot" width={40} height={40} className="text-accent" />
          </div>
          <h3 className="text-white font-bold text-lg mb-1">No agents found</h3>
          <p className="text-muted text-sm max-w-sm mb-6">
            Create a Presence or Worker agent first to configure their knowledge and tools.
          </p>
          <a
            href="/agents"
            className="px-6 py-3 bg-accent hover:bg-accent-dark text-white font-semibold rounded-full transition-colors"
          >
            Go to Agents
          </a>
        </div>
      </div>
    )
  }

  // ─── Main UI ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Empower</h1>
          <p className="text-muted mt-1">Configure knowledge and tools for your agents</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TOP SECTION — Agent Selection (Horizontal Scroll) */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      <div className="space-y-4 mb-6">
        {/* Presence Row */}
        {presenceAgents.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <Icon icon="lucide:crown" width={12} height={12} className="text-accent" />
              Presence
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {presenceAgents.map((agent) => {
                const isSelected = selectionType === 'presence' && selectedAgentId === agent.id
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleSelectAgent('presence', agent.id)}
                    className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all min-w-[180px] ${isSelected
                      ? 'bg-accent/15 border-accent/40 text-white'
                      : 'bg-card border-card-border text-white/70 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isSelected ? 'bg-accent/20' : 'bg-white/[0.06]'
                      }`}>
                      <Icon icon="lucide:crown" width={18} height={18} className={isSelected ? 'text-accent' : 'text-white/60'} />
                    </div>
                    <div className="text-left min-w-0">
                      <p className="font-medium text-sm truncate">{agent.name}</p>
                      {agent.handle && (
                        <p className="text-xs text-muted truncate">@{agent.handle}</p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Worker Row */}
        {workerAgents.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <Icon icon="lucide:bot" width={12} height={12} />
              Worker
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {workerAgents.map((agent) => {
                const isSelected = selectionType === 'worker' && selectedAgentId === agent.id
                const accessLevel = agent.accessLevel || 'private'
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleSelectAgent('worker', agent.id)}
                    className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all min-w-[180px] ${isSelected
                      ? 'bg-accent/15 border-accent/40 text-white'
                      : 'bg-card border-card-border text-white/70 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isSelected ? 'bg-accent/20' : 'bg-white/[0.06]'
                      }`}>
                      <Icon icon="lucide:bot" width={18} height={18} className={isSelected ? 'text-accent' : 'text-white/60'} />
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{agent.name}</p>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${accessLevel === 'public' ? 'bg-green-500/15 text-green-400' :
                        accessLevel === 'admin' ? 'bg-amber-500/15 text-amber-400' :
                          'bg-white/[0.06] text-muted'
                        }`}>
                        {accessLevel}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* BOTTOM SECTION — Details View */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {selectedAgent && (
        <div className="flex-1 bg-card border border-card-border rounded-xl overflow-hidden flex flex-col">
          {/* Details Header */}
          <div className="p-4 border-b border-card-border flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Icon
                icon={selectionType === 'presence' ? 'lucide:crown' : 'lucide:bot'}
                width={20}
                height={20}
                className="text-accent"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white truncate">{selectedAgent.name}</h2>
              <div className="flex items-center gap-2">
                {selectionType === 'presence' && selectedAgent.handle && (
                  <span className="text-xs text-muted">@{selectedAgent.handle}</span>
                )}
                {selectionType === 'worker' && selectedAgent.accessLevel && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${selectedAgent.accessLevel === 'public' ? 'bg-green-500/15 text-green-400' :
                    selectedAgent.accessLevel === 'admin' ? 'bg-amber-500/15 text-amber-400' :
                      'bg-white/[0.06] text-muted'
                    }`}>
                    {selectedAgent.accessLevel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs (Horizontal Scroll) */}
          <div className="border-b border-card-border">
            <div className="flex gap-1 p-2 overflow-x-auto scrollbar-thin">
              {selectionType === 'presence' ? (
                <>
                  <button
                    onClick={() => setActiveTab('knowledge')}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'knowledge'
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted hover:text-white hover:bg-white/[0.04]'
                      }`}
                  >
                    <Icon icon="lucide:brain" width={16} height={16} />
                    Knowledge
                  </button>
                  <button
                    onClick={() => setActiveTab('instruct')}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'instruct'
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted hover:text-white hover:bg-white/[0.04]'
                      }`}
                  >
                    <Icon icon="lucide:scroll-text" width={16} height={16} />
                    Instruct
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setActiveTab('tools')}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'tools'
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted hover:text-white hover:bg-white/[0.04]'
                      }`}
                  >
                    <Icon icon="lucide:wrench" width={16} height={16} />
                    Tools
                  </button>
                  <button
                    onClick={() => setActiveTab('instruct')}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'instruct'
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted hover:text-white hover:bg-white/[0.04]'
                      }`}
                  >
                    <Icon icon="lucide:scroll-text" width={16} height={16} />
                    Instruct
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tab Content (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Loading State for Details */}
            {detailsLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Spinner size="md" />
                <p className="text-muted text-sm mt-3">Loading...</p>
              </div>
            ) : (
              <>
                {/* ─── Knowledge Tab ───────────────────────────────────────────────── */}
                {activeTab === 'knowledge' && selectionType === 'presence' && (
                  <div className="space-y-2">
                    {allKnowledgeBases.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-14 h-14 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                          <Icon icon="lucide:brain" width={24} height={24} className="text-muted" />
                        </div>
                        <p className="text-muted text-sm mb-1">No knowledge bases available</p>
                        <p className="text-muted/60 text-xs">Create a knowledge base first</p>
                      </div>
                    ) : (
                      allKnowledgeBases.map((kb) => {
                        const isConnected = (selectedAgent?.knowledgeBaseIds || []).includes(kb.id)
                        return (
                          <div
                            key={kb.id}
                            className="flex items-center gap-3 p-3 bg-white/[0.02] border border-card-border rounded-xl"
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isConnected ? 'bg-accent/15' : 'bg-white/[0.06]'
                              }`}>
                              <Icon
                                icon="lucide:brain"
                                width={18}
                                height={18}
                                className={isConnected ? 'text-accent' : 'text-white/60'}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-white text-sm font-medium truncate">{kb.name}</p>
                                {isConnected && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                                    Active
                                  </span>
                                )}
                              </div>
                              {kb.description && (
                                <p className="text-muted text-xs truncate">{kb.description}</p>
                              )}
                            </div>
                            {isConnected ? (
                              <button
                                onClick={() => handleRemoveKnowledge(kb.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                Disconnect
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAddKnowledge([kb.id])}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
                              >
                                Connect
                              </button>
                            )}
                          </div>
                        )
                      })
                    )}

                    {/* Create New Knowledge Button */}
                    <button
                      onClick={() => router.push('/knowledge')}
                      className="w-full py-3 rounded-xl border border-dashed border-card-border text-muted hover:text-accent hover:border-accent/40 transition-colors flex items-center justify-center gap-2"
                    >
                      <Icon icon="lucide:plus" width={18} height={18} />
                      Create Knowledge
                    </button>
                  </div>
                )}

                {/* ─── Tools Tab ───────────────────────────────────────────────────── */}
                {activeTab === 'tools' && selectionType === 'worker' && (
                  <div className="space-y-2">
                    {tools.map((tool) => {
                      const isConnected = tool.status === 'connected'
                      const isEnabled = ENABLED_TOOLS.includes(tool.id)
                      return (
                        <div
                          key={tool.id}
                          className={`flex items-center gap-3 p-3 bg-white/[0.02] border border-card-border rounded-xl ${!isEnabled ? 'opacity-60' : ''}`}
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isConnected ? 'bg-accent/15' : 'bg-white/[0.06]'
                            }`}>
                            <Icon
                              icon={tool.icon}
                              width={18}
                              height={18}
                              className={isConnected ? 'text-accent' : 'text-white/60'}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white text-sm font-medium">{tool.name}</p>
                              {isConnected && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                                  Active
                                </span>
                              )}
                            </div>
                            {isConnected && tool.connectedAs ? (
                              <p className="text-xs text-muted truncate">{tool.connectedAs}</p>
                            ) : (
                              <p className="text-xs text-muted/60">{tool.description}</p>
                            )}
                          </div>
                          {isConnected ? (
                            <button
                              onClick={() => handleToolDisconnect(tool.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                            >
                              Disconnect
                            </button>
                          ) : isEnabled ? (
                            <button
                              onClick={async () => {
                                if (tool.id === 'solana') {
                                  // Solana: connect directly without modal (no credentials needed)
                                  try {
                                    const result = await verifyToolCredentials('solana', {})
                                    if (result.success) {
                                      await handleToolConnect(tool.id, 'Solana', {})
                                    }
                                  } catch (err) {
                                    console.error('Failed to connect Solana:', err)
                                    setToast({ message: 'Failed to connect Solana', type: 'error' })
                                  }
                                } else {
                                  setActiveToolId(tool.id)
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors flex-shrink-0"
                            >
                              Connect
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.03] text-muted cursor-not-allowed flex-shrink-0">
                              Coming Soon
                            </span>
                          )}
                        </div>
                      )
                    })}

                    {/* Connected tools count */}
                    {tools.filter(t => t.status === 'connected').length > 0 && (
                      <p className="text-xs text-muted flex items-center gap-1.5 px-1 pt-1">
                        <Icon icon="lucide:zap" width={12} height={12} className="text-accent" />
                        <span className="text-accent font-medium">
                          {tools.filter(t => t.status === 'connected').length}
                        </span> tool(s) connected
                      </p>
                    )}
                  </div>
                )}

                {/* ─── Instruct Tab ───────────────────────────────────────────────── */}
                {activeTab === 'instruct' && (
                  <div className="space-y-2">
                    {allPrompts.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-14 h-14 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                          <Icon icon="lucide:scroll-text" width={24} height={24} className="text-muted" />
                        </div>
                        <p className="text-muted text-sm mb-1">No instructs available</p>
                        <p className="text-muted/60 text-xs">Create an instruct to define agent behavior</p>
                      </div>
                    ) : (
                      allPrompts.map((prompt) => {
                        const isConnected = selectedAgent?.promptId === prompt.id
                        return (
                          <div
                            key={prompt.id}
                            className="flex items-center gap-3 p-3 bg-white/[0.02] border border-card-border rounded-xl"
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isConnected ? 'bg-accent/15' : 'bg-white/[0.06]'
                              }`}>
                              <Icon
                                icon="lucide:scroll-text"
                                width={18}
                                height={18}
                                className={isConnected ? 'text-accent' : 'text-white/60'}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-white text-sm font-medium truncate">{prompt.name}</p>
                                {isConnected && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                                    Active
                                  </span>
                                )}
                              </div>
                              {prompt.description && (
                                <p className="text-muted text-xs truncate">{prompt.description}</p>
                              )}
                            </div>
                            {isConnected ? (
                              <button
                                onClick={() => handleDisconnectInstruct()}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                Disconnect
                              </button>
                            ) : (
                              <button
                                onClick={() => handleConnectInstruct(prompt.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
                              >
                                Connect
                              </button>
                            )}
                          </div>
                        )
                      })
                    )}

                    {/* Create New Instruct Button */}
                    <button
                      onClick={() => router.push('/prompts')}
                      className="w-full py-3 rounded-xl border border-dashed border-card-border text-muted hover:text-accent hover:border-accent/40 transition-colors flex items-center justify-center gap-2"
                    >
                      <Icon icon="lucide:plus" width={18} height={18} />
                      Create Instruct
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {/* Tool Connection Modal (for all enabled tools: bluesky, telegram, google) */}
      {activeTool && ENABLED_TOOLS.includes(activeTool.id) && activeTool.id !== 'solana' && (
        <ToolConnectionModal
          tool={activeTool}
          onClose={() => setActiveToolId(null)}
          onConnect={handleToolConnect}
        />
      )}
    </div>
  )
}