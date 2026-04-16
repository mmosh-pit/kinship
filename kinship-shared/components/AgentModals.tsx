'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import {
  suggestHandle,
  isValidHandle,
  HANDLE_MAX,
  WORKER_ACCESS_LEVELS,
} from '@/lib/agent-types'
import type { Presence, WorkerAccessLevel, AgentTone } from '@/lib/agent-types'
import { createPresenceAgent, createWorkerAgent } from '@/lib/agents-api'
import { connectToolToWorker, verifyToolCredentials } from '@/lib/tools-api'

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Save Draft Storage
// ─────────────────────────────────────────────────────────────────────────────

const PRESENCE_DRAFT_KEY = 'kinship_presence_draft'
const WORKER_DRAFT_KEY = 'kinship_worker_draft'
const AUTO_SAVE_DEBOUNCE_MS = 500

interface PresenceDraft {
  name: string
  handle: string
  briefDescription: string
  backstory: string
  tone: AgentTone
  selectedKnowledgeIds: string[]
  selectedPromptId: string | null
  currentStep: number
  savedAt: number
}

interface WorkerDraft {
  name: string
  description: string
  backstory: string
  role: string
  accessLevel: WorkerAccessLevel
  parentPresenceId: string
  connectedTools: ConnectedTool[]
  selectedPromptId: string | null
  currentStep: number
  savedAt: number
}

// Utility: Debounce function for auto-save
function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args)
      }, delay)
    },
    [callback, delay]
  ) as T

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return debouncedFn
}

// Save draft to localStorage
function savePresenceDraft(draft: PresenceDraft): void {
  try {
    localStorage.setItem(PRESENCE_DRAFT_KEY, JSON.stringify(draft))
  } catch (e) {
    console.warn('Failed to save presence draft:', e)
  }
}

function loadPresenceDraft(): PresenceDraft | null {
  try {
    const stored = localStorage.getItem(PRESENCE_DRAFT_KEY)
    if (stored) {
      const draft = JSON.parse(stored) as PresenceDraft
      // Only load draft if it's less than 24 hours old
      if (Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
        return draft
      }
      localStorage.removeItem(PRESENCE_DRAFT_KEY)
    }
  } catch (e) {
    console.warn('Failed to load presence draft:', e)
  }
  return null
}

function clearPresenceDraft(): void {
  try {
    localStorage.removeItem(PRESENCE_DRAFT_KEY)
  } catch (e) {
    console.warn('Failed to clear presence draft:', e)
  }
}

function saveWorkerDraft(draft: WorkerDraft): void {
  try {
    localStorage.setItem(WORKER_DRAFT_KEY, JSON.stringify(draft))
  } catch (e) {
    console.warn('Failed to save worker draft:', e)
  }
}

function loadWorkerDraft(): WorkerDraft | null {
  try {
    const stored = localStorage.getItem(WORKER_DRAFT_KEY)
    if (stored) {
      const draft = JSON.parse(stored) as WorkerDraft
      // Only load draft if it's less than 24 hours old
      if (Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
        return draft
      }
      localStorage.removeItem(WORKER_DRAFT_KEY)
    }
  } catch (e) {
    console.warn('Failed to load worker draft:', e)
  }
  return null
}

function clearWorkerDraft(): void {
  try {
    localStorage.removeItem(WORKER_DRAFT_KEY)
  } catch (e) {
    console.warn('Failed to clear worker draft:', e)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string
  name: string
  description?: string
}

interface Prompt {
  id: string
  name: string
  content?: string
  type?: string
}

interface Tool {
  id: string
  name: string
  description: string
  icon: string
  authType: string
  instructions?: string
}

// Connected tool with verified credentials
interface ConnectedTool {
  toolName: string
  credentials: Record<string, string>
  externalHandle?: string
  verified: boolean
}

// Available tools for Empower
const AVAILABLE_TOOLS: Tool[] = [
  {
    id: 'bluesky',
    name: 'Bluesky',
    description: 'Post, reply, and engage on Bluesky social network',
    icon: 'lucide:cloud',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Access Google services (Calendar, Drive, Gmail)',
    icon: 'mdi:google',
    authType: 'oauth2',
    instructions: "Click 'Sign in with Google' to authorize access via OAuth",
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Send messages and manage Telegram bots',
    icon: 'lucide:send',
    authType: 'bot_token',
    instructions:
      '1. Open Telegram and search for @BotFather\n2. Send /newbot and follow instructions\n3. Copy the Bot Token provided',
  },
  {
    id: 'solana',
    name: 'Solana',
    description: 'Interact with Solana blockchain and wallets',
    icon: 'simple-icons:solana',
    authType: 'wallet',
    instructions:
      '1. Connect your Solana wallet\n2. Approve the connection request\n3. Your agent will have read access to your wallet',
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Send and receive emails',
    icon: 'lucide:mail',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    description: 'Post tweets, reply, and engage',
    icon: 'lucide:twitter',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Manage channels and send messages',
    icon: 'lucide:message-circle',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Schedule and manage events',
    icon: 'lucide:calendar',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Create and update pages',
    icon: 'lucide:file-text',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages to channels',
    icon: 'lucide:hash',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage repos and issues',
    icon: 'lucide:github',
    authType: 'app_password',
    instructions:
      "1. Go to Bluesky → Settings → App Passwords\n2. Click 'Add App Password'\n3. Name it 'Kinship Agent'\n4. Copy the generated password",
  },
]

// Tools that are currently enabled for connection
const ENABLED_TOOLS = ['bluesky', 'telegram', 'solana', 'google']

// Google tools to be sent as array instead of single "google"
const GOOGLE_TOOLS = [
  'google_gmail_tool',
  'google_calendar_tool',
  'google_meet_tool',
]

// Available tones for Presence agents
export const AGENT_TONES: {
  value: AgentTone
  label: string
  description: string
  icon: string
}[] = [
    {
      value: 'neutral',
      label: 'Neutral',
      description: 'Balanced and helpful',
      icon: 'lucide:minus',
    },
    {
      value: 'friendly',
      label: 'Friendly',
      description: 'Warm and approachable',
      icon: 'lucide:smile',
    },
    {
      value: 'professional',
      label: 'Professional',
      description: 'Formal and business-like',
      icon: 'lucide:briefcase',
    },
    {
      value: 'strict',
      label: 'Strict',
      description: 'Direct and authoritative',
      icon: 'lucide:shield-alert',
    },
    {
      value: 'cool',
      label: 'Cool',
      description: 'Laid-back and casual',
      icon: 'lucide:glasses',
    },
    {
      value: 'angry',
      label: 'Angry',
      description: 'Assertive and intense',
      icon: 'lucide:flame',
    },
    {
      value: 'playful',
      label: 'Playful',
      description: 'Fun and whimsical',
      icon: 'lucide:sparkles',
    },
    {
      value: 'wise',
      label: 'Wise',
      description: 'Thoughtful and philosophical',
      icon: 'lucide:graduation-cap',
    },
  ]

// ─────────────────────────────────────────────────────────────────────────────
// Choice Modal - Select Presence or Worker Agent
// ─────────────────────────────────────────────────────────────────────────────

interface CreateAgentChoiceModalProps {
  onClose: () => void
  onChoosePresence: () => void
  onChooseAgent: () => void
  presences: Presence[]
}

export function CreateAgentChoiceModal({
  onClose,
  onChoosePresence,
  onChooseAgent,
  presences,
}: CreateAgentChoiceModalProps) {
  const hasPresences = presences.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
        onClick={onClose}
      />
      <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-card-border">
          <div>
            <h2 className="text-xl font-bold text-white">Create New Agent</h2>
            <p className="text-sm text-muted mt-1">
              Choose what kind of agent to create
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
          {/* Presence (supervisor) */}
          <button
            onClick={onChoosePresence}
            className="group text-left bg-background border border-card-border rounded-xl p-5 transition-all hover:border-accent/60 hover:bg-accent/5"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/15 group-hover:bg-accent/25 flex items-center justify-center flex-shrink-0 transition-colors">
                <Icon
                  icon="lucide:crown"
                  width={22}
                  height={22}
                  className="text-accent"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-white font-semibold text-base">
                    Presence
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-accent/20 text-accent">
                    Supervisor
                  </span>
                </div>
                <p className="text-sm text-muted leading-relaxed">
                  A top-level orchestrator agent that coordinates worker agents
                  and serves as the primary interface.
                </p>
              </div>
              <Icon
                icon="lucide:chevron-right"
                width={18}
                height={18}
                className="text-muted group-hover:text-accent transition-colors flex-shrink-0 mt-3"
              />
            </div>
          </button>

          {/* Agent (worker) */}
          <button
            onClick={hasPresences ? onChooseAgent : undefined}
            disabled={!hasPresences}
            className={`group text-left bg-background border border-card-border rounded-xl p-5 transition-all ${
              hasPresences
                ? 'hover:border-accent/60 hover:bg-accent/5 cursor-pointer'
                : 'cursor-not-allowed opacity-60'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                hasPresences
                  ? 'bg-white/[0.06] group-hover:bg-white/[0.1]'
                  : 'bg-white/[0.03]'
              }`}>
                <Icon
                  icon="lucide:bot"
                  width={22}
                  height={22}
                  className={hasPresences ? 'text-white/70' : 'text-white/40'}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className={`font-semibold text-base ${hasPresences ? 'text-white' : 'text-white/50'}`}>Agent</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.08] text-white/60">
                    Worker
                  </span>
                </div>
                <p className={`text-sm leading-relaxed ${hasPresences ? 'text-muted' : 'text-muted/70'}`}>
                  A specialized worker agent that executes tasks and can be
                  empowered with tools.
                </p>
                {!hasPresences && (
                  <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                    <Icon icon="lucide:alert-triangle" width={12} height={12} />
                    Create a Presence first to enable Worker creation
                  </p>
                )}
              </div>
              <Icon
                icon="lucide:chevron-right"
                width={18}
                height={18}
                className={`transition-colors flex-shrink-0 mt-3 ${
                  hasPresences ? 'text-muted group-hover:text-accent' : 'text-white/20'
                }`}
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Presence Modal (Supervisor) - 3 Steps
// Steps: 1. Basic Info → 2. Knowledge Base → 3. System Prompt
// ─────────────────────────────────────────────────────────────────────────────

interface CreatePresenceModalProps {
  onClose: () => void
  onCreate: (presence: Presence) => void
  platformId?: string
  wallet: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions for Presence Step 1
// ─────────────────────────────────────────────────────────────────────────────

const PRESENCE_NAME_MAX = 25
const PRESENCE_DESCRIPTION_MAX = 255
const PRESENCE_BACKSTORY_MAX = 255

function validatePresenceName(name: string): string | null {
  if (!name) return null
  if (name.trim().length === 0) return 'Name is required'
  if (name.length > PRESENCE_NAME_MAX)
    return `Max ${PRESENCE_NAME_MAX} characters`
  return null
}

function validatePresenceHandle(h: string): string | null {
  if (!h) return null
  if (!isValidHandle(h))
    return 'Only letters, numbers, underscores, and periods allowed'
  if (h.length > HANDLE_MAX) return `Max ${HANDLE_MAX} characters`
  return null
}

function validatePresenceDescription(desc: string): string | null {
  if (!desc) return null
  if (desc.trim().length === 0) return 'Description is required'
  if (desc.length > PRESENCE_DESCRIPTION_MAX)
    return `Max ${PRESENCE_DESCRIPTION_MAX} characters`
  return null
}

function validatePresenceBackstory(backstory: string): string | null {
  if (!backstory) return null
  if (backstory.trim().length === 0) return 'Backstory is required'
  if (backstory.length > PRESENCE_BACKSTORY_MAX)
    return `Max ${PRESENCE_BACKSTORY_MAX} characters`
  return null
}

const PRESENCE_STEPS = [
  { id: 1, name: 'Basic Info', icon: 'lucide:user' },
  { id: 2, name: 'Knowledge', icon: 'lucide:brain' },
  { id: 3, name: 'System Prompt', icon: 'lucide:message-square-code' },
]

export function CreatePresenceModal({
  onClose,
  onCreate,
  platformId,
  wallet,
}: CreatePresenceModalProps) {
  // Load draft from localStorage on mount
  const initialDraft = loadPresenceDraft()

  const [currentStep, setCurrentStep] = useState(initialDraft?.currentStep || 1)

  // Step 1: Basic Info
  const [name, setName] = useState(initialDraft?.name || '')
  const [nameTouched, setNameTouched] = useState(false)
  const [handle, setHandle] = useState(initialDraft?.handle || '')
  const [handleTouched, setHandleTouched] = useState(false)
  const [briefDescription, setBriefDescription] = useState(
    initialDraft?.briefDescription || ''
  )
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [backstory, setBackstory] = useState(initialDraft?.backstory || '')
  const [backstoryTouched, setBackstoryTouched] = useState(false)
  const [tone, setTone] = useState<AgentTone>(initialDraft?.tone || 'neutral')

  // Step 2: Knowledge Base
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>(
    initialDraft?.selectedKnowledgeIds || []
  )
  const [loadingKB, setLoadingKB] = useState(false)

  // Step 3: System Prompt
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(
    initialDraft?.selectedPromptId || null
  )
  const [loadingPrompts, setLoadingPrompts] = useState(false)

  // General state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Auto-save debounced function
  const saveDraft = useCallback(() => {
    const draft: PresenceDraft = {
      name,
      handle,
      briefDescription,
      backstory,
      tone,
      selectedKnowledgeIds,
      selectedPromptId,
      currentStep,
      savedAt: Date.now(),
    }
    savePresenceDraft(draft)
  }, [
    name,
    handle,
    briefDescription,
    backstory,
    tone,
    selectedKnowledgeIds,
    selectedPromptId,
    currentStep,
  ])

  const debouncedSaveDraft = useDebounce(saveDraft, AUTO_SAVE_DEBOUNCE_MS)

  // Auto-save on field changes
  useEffect(() => {
    // Only save if there's meaningful data
    if (
      name ||
      handle ||
      briefDescription ||
      backstory ||
      selectedKnowledgeIds.length > 0 ||
      selectedPromptId
    ) {
      debouncedSaveDraft()
    }
  }, [
    name,
    handle,
    briefDescription,
    backstory,
    tone,
    selectedKnowledgeIds,
    selectedPromptId,
    debouncedSaveDraft,
  ])

  // Save draft immediately on step change
  useEffect(() => {
    if (name || handle || briefDescription) {
      saveDraft()
    }
  }, [currentStep])

  // Auto-scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [error])

  useEffect(() => {
    if (currentStep === 2 && knowledgeBases.length === 0) {
      fetchKnowledgeBases()
    }
  }, [currentStep])

  useEffect(() => {
    if (currentStep === 3 && prompts.length === 0) {
      fetchPrompts()
    }
  }, [currentStep])

  async function fetchKnowledgeBases() {
    setLoadingKB(true)
    try {
      const AGENT_API_URL =
        process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'
      const params = new URLSearchParams()
      if (wallet) params.set('wallet', wallet)
      if (platformId) params.set('platformId', platformId)
      const res = await fetch(
        `${AGENT_API_URL}/api/knowledge?${params.toString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setKnowledgeBases(data.knowledgeBases || [])
      }
    } catch (error) {
      console.error('Error fetching knowledge bases:', error)
    } finally {
      setLoadingKB(false)
    }
  }

  async function fetchPrompts() {
    setLoadingPrompts(true)
    try {
      const AGENT_API_URL =
        process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'
      const params = new URLSearchParams()
      if (wallet) params.set('wallet', wallet)
      if (platformId) params.set('platformId', platformId)
      const res = await fetch(
        `${AGENT_API_URL}/api/prompts?${params.toString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setPrompts(data.prompts || [])
      }
    } catch (error) {
      console.error('Error fetching prompts:', error)
    } finally {
      setLoadingPrompts(false)
    }
  }

  function onNameChange(val: string) {
    setName(val)
    if (!val.trim()) {
      // Name was cleared — release handle ownership so auto-fill resumes
      setHandle('')
      setHandleTouched(false)
    } else if (!handleTouched) {
      setHandle(suggestHandle(val))
    }
  }

  function onHandleChange(val: string) {
    const cleaned = val.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, HANDLE_MAX)
    setHandle(cleaned)
    if (cleaned === '') {
      setHandleTouched(false)
    } else {
      setHandleTouched(true)
    }
  }

  function toggleKnowledgeBase(id: string) {
    setSelectedKnowledgeIds((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]
    )
  }

  // Inline validation errors (only show after field is touched)
  const inlineNameError = nameTouched ? validatePresenceName(name) : null
  const inlineHandleError = handleTouched
    ? validatePresenceHandle(handle)
    : null
  const inlineDescriptionError = descriptionTouched
    ? validatePresenceDescription(briefDescription)
    : null
  const inlineBackstoryError = backstoryTouched
    ? validatePresenceBackstory(backstory)
    : null

  // Can proceed only if all fields are valid
  const canProceedStep1 =
    name.trim() &&
    handle.trim() &&
    briefDescription.trim() &&
    backstory.trim() &&
    !validatePresenceName(name) &&
    !validatePresenceHandle(handle) &&
    !validatePresenceDescription(briefDescription) &&
    !validatePresenceBackstory(backstory)

  function nextStep() {
    // Enforce Step 1 validation before proceeding
    if (currentStep === 1 && !canProceedStep1) {
      return
    }
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Skip step and clear any data selected in the current step
  function skipStep() {
    if (currentStep === 2) {
      // Step 2: Knowledge - clear selected knowledge bases
      setSelectedKnowledgeIds([])
    } else if (currentStep === 3) {
      // Step 3: Instruct - clear selected prompt
      setSelectedPromptId(null)
    }
    nextStep()
  }

  async function handleSubmit() {
    if (!canProceedStep1) return
    setLoading(true)
    setError('')
    try {
      const agent = await createPresenceAgent({
        name: name.trim(),
        handle: handle.trim(),
        briefDescription: briefDescription.trim(),
        backstory: backstory.trim() || undefined,
        tone,
        wallet,
        platformId,
        knowledgeBaseIds: selectedKnowledgeIds,
        promptId: selectedPromptId || undefined,
      })
      // Clear draft on successful creation
      clearPresenceDraft()
      onCreate(agent)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - clicking outside does NOT close the modal to prevent data loss */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-card-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Icon
                icon="lucide:crown"
                width={20}
                height={20}
                className="text-accent"
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Create Presence
              </h2>
              <p className="text-xs text-muted">
                Step {currentStep} of {PRESENCE_STEPS.length}:{' '}
                {PRESENCE_STEPS[currentStep - 1].name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors p-1 cursor-pointer"
          >
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        {/* Step Indicators */}
        <div className="px-6 py-4 border-b border-card-border bg-background/50">
          <div className="relative flex items-start justify-between">
            {/* Connector lines - positioned at vertical center with small gaps from circles */}
            {/* Line 1: from circle 1 to circle 2 */}
            <div
              className={`absolute h-[2px] rounded-full ${currentStep > 1 ? 'bg-green-500/50' : 'bg-white/[0.1]'}`}
              style={{
                top: '19px',
                left: 'calc(16.67% + 28px)', // Right edge of circle + 8px gap
                right: 'calc(50% + 28px)', // Left edge of middle circle + 8px gap
              }}
            />
            {/* Line 2: from circle 2 to circle 3 */}
            <div
              className={`absolute h-[2px] rounded-full ${currentStep > 2 ? 'bg-green-500/50' : 'bg-white/[0.1]'}`}
              style={{
                top: '19px',
                left: 'calc(50% + 28px)', // Right edge of middle circle + 8px gap
                right: 'calc(16.67% + 28px)', // Left edge of last circle + 8px gap
              }}
            />

            {/* Step circles */}
            {PRESENCE_STEPS.map((step) => (
              <div
                key={step.id}
                className="flex flex-col items-center z-10"
                style={{ width: '33.33%' }}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${currentStep === step.id
                    ? 'bg-accent text-white'
                    : currentStep > step.id
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-card text-muted border border-white/[0.1]'
                    }`}
                >
                  {currentStep > step.id ? (
                    <Icon icon="lucide:check" width={18} height={18} />
                  ) : (
                    <Icon icon={step.icon} width={18} height={18} />
                  )}
                </div>
                <span
                  className={`text-xs mt-2 whitespace-nowrap ${currentStep === step.id ? 'text-accent font-medium' : 'text-muted'}`}
                >
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Presence Name <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow only letters (a-z, A-Z) and numbers (0-9)
                      const filteredValue = value.replace(/[^a-zA-Z0-9 ]/g, '');
                      onNameChange(filteredValue);
                    }}
                    onBlur={() => setNameTouched(true)}
                    placeholder="e.g. Emma the English Teacher"
                    maxLength={PRESENCE_NAME_MAX}
                    autoFocus
                    className={`w-full bg-input border rounded-xl px-4 pr-14 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${inlineNameError
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : 'border-card-border focus:border-accent/50'
                      }`}
                  />
                  <span
                    className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums ${name.length >= PRESENCE_NAME_MAX ? 'text-red-400' : 'text-muted'}`}
                  >
                    {name.length}/{PRESENCE_NAME_MAX}
                  </span>
                </div>
                {inlineNameError && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <Icon icon="lucide:alert-circle" width={12} height={12} />
                    {inlineNameError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Handle <span className="text-accent">*</span>
                  <span className="text-muted font-normal ml-1">
                    (unique identifier)
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
                    placeholder="emma_english"
                    maxLength={HANDLE_MAX}
                    className={`w-full bg-input border rounded-xl pl-8 pr-14 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${inlineHandleError
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : 'border-card-border focus:border-accent/50'
                      }`}
                  />
                  <span
                    className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums ${handle.length >= HANDLE_MAX ? 'text-red-400' : 'text-muted'}`}
                  >
                    {handle.length}/{HANDLE_MAX}
                  </span>
                </div>
                {inlineHandleError && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <Icon icon="lucide:alert-circle" width={12} height={12} />
                    {inlineHandleError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Description <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <textarea
                    value={briefDescription}
                    onChange={(e) => setBriefDescription(e.target.value)}
                    onBlur={() => setDescriptionTouched(true)}
                    placeholder="e.g. A friendly English teacher who helps students learn grammar and vocabulary"
                    maxLength={PRESENCE_DESCRIPTION_MAX}
                    rows={3}
                    className={`w-full bg-input border rounded-xl px-4 py-3 pr-14 text-foreground placeholder:text-muted focus:outline-none text-sm resize-none transition-colors ${inlineDescriptionError
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : 'border-card-border focus:border-accent/50'
                      }`}
                  />
                  <span
                    className={`absolute right-4 bottom-3 text-xs tabular-nums ${briefDescription.length >= PRESENCE_DESCRIPTION_MAX ? 'text-red-400' : 'text-muted'}`}
                  >
                    {briefDescription.length}/{PRESENCE_DESCRIPTION_MAX}
                  </span>
                </div>
                {inlineDescriptionError && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <Icon icon="lucide:alert-circle" width={12} height={12} />
                    {inlineDescriptionError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Backstory <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <textarea
                    value={backstory}
                    onChange={(e) => setBackstory(e.target.value)}
                    onBlur={() => setBackstoryTouched(true)}
                    placeholder="e.g. Born in a small town, Emma discovered her passion for teaching English when..."
                    maxLength={PRESENCE_BACKSTORY_MAX}
                    rows={3}
                    className={`w-full bg-input border rounded-xl px-4 py-3 pr-14 text-foreground placeholder:text-muted focus:outline-none text-sm resize-none transition-colors ${inlineBackstoryError
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : 'border-card-border focus:border-accent/50'
                    }`}
                  />
                  <span
                    className={`absolute right-4 bottom-3 text-xs tabular-nums ${backstory.length >= PRESENCE_BACKSTORY_MAX ? 'text-red-400' : 'text-muted'}`}
                  >
                    {backstory.length}/{PRESENCE_BACKSTORY_MAX}
                  </span>
                </div>
                {inlineBackstoryError && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <Icon icon="lucide:alert-circle" width={12} height={12} />
                    {inlineBackstoryError}
                  </p>
                )}
              </div>

              {/* Tone Selector */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Personality Tone
                </label>
                <p className="text-xs text-muted mb-3">
                  Choose how your Presence communicates
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {AGENT_TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTone(t.value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${tone === t.value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-card-border hover:border-white/30 hover:bg-white/[0.02] text-muted'
                        }`}
                    >
                      <Icon
                        icon={t.icon}
                        width={20}
                        height={20}
                        className={
                          tone === t.value ? 'text-accent' : 'text-muted'
                        }
                      />
                      <span
                        className={`text-xs font-medium ${tone === t.value ? 'text-accent' : 'text-foreground'}`}
                      >
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted/70 mt-2 text-center">
                  {AGENT_TONES.find((t) => t.value === tone)?.description}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Knowledge Base */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">
                    Select Knowledge Base
                  </h3>
                  <p className="text-sm text-muted">
                    Choose what your Presence knows about
                  </p>
                </div>
                <a
                  href="/knowledge"
                  className="text-sm text-accent hover:underline flex items-center gap-1"
                >
                  <Icon icon="lucide:plus" width={14} height={14} />
                  Create New
                </a>
              </div>

              {loadingKB ? (
                <div className="flex items-center justify-center py-8">
                  <Icon
                    icon="lucide:loader-2"
                    width={24}
                    height={24}
                    className="animate-spin text-accent"
                  />
                </div>
              ) : knowledgeBases.length === 0 ? (
                <div className="text-center py-8 bg-white/[0.02] rounded-xl border border-dashed border-card-border">
                  <Icon
                    icon="lucide:brain"
                    width={32}
                    height={32}
                    className="mx-auto text-muted mb-2"
                  />
                  <p className="text-muted">No knowledge bases found</p>
                  <p className="text-sm text-muted/70">
                    You can skip this step and add later
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {knowledgeBases.map((kb) => (
                    <label
                      key={kb.id}
                      className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedKnowledgeIds.includes(kb.id)
                        ? 'border-accent/50 bg-accent/5'
                        : 'border-card-border hover:border-white/20 hover:bg-white/[0.02]'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedKnowledgeIds.includes(kb.id)}
                        onChange={() => toggleKnowledgeBase(kb.id)}
                        className="mt-1 accent-accent"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium">
                          {kb.name}
                        </span>
                        {kb.description && (
                          <p className="text-xs text-muted mt-0.5 line-clamp-2">
                            {kb.description}
                          </p>
                        )}
                      </div>
                      <Icon
                        icon="lucide:brain"
                        width={16}
                        height={16}
                        className="text-muted flex-shrink-0"
                      />
                    </label>
                  ))}
                </div>
              )}

              {selectedKnowledgeIds.length > 0 && (
                <p className="text-sm text-accent flex items-center gap-1">
                  <Icon icon="lucide:check-circle" width={14} height={14} />
                  {selectedKnowledgeIds.length} knowledge base(s) selected
                </p>
              )}
            </div>
          )}

          {/* Step 3: System Prompt */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">
                    Select System Prompt
                  </h3>
                  <p className="text-sm text-muted">
                    Define how your Presence behaves
                  </p>
                </div>
                <a
                  href="/prompts"
                  className="text-sm text-accent hover:underline flex items-center gap-1"
                >
                  <Icon icon="lucide:plus" width={14} height={14} />
                  Create New
                </a>
              </div>

              {loadingPrompts ? (
                <div className="flex items-center justify-center py-8">
                  <Icon
                    icon="lucide:loader-2"
                    width={24}
                    height={24}
                    className="animate-spin text-accent"
                  />
                </div>
              ) : prompts.length === 0 ? (
                <div className="text-center py-8 bg-white/[0.02] rounded-xl border border-dashed border-card-border">
                  <Icon
                    icon="lucide:message-square-code"
                    width={32}
                    height={32}
                    className="mx-auto text-muted mb-2"
                  />
                  <p className="text-muted">No prompts found</p>
                  <p className="text-sm text-muted/70">
                    You can skip this step and add later
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      onClick={() =>
                        setSelectedPromptId(
                          selectedPromptId === prompt.id ? null : prompt.id
                        )
                      }
                      className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedPromptId === prompt.id
                        ? 'border-accent/50 bg-accent/5'
                        : 'border-card-border hover:border-white/20 hover:bg-white/[0.02]'
                        }`}
                    >
                      <div
                        className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selectedPromptId === prompt.id ? 'border-accent bg-accent' : 'border-muted'}`}
                      >
                        {selectedPromptId === prompt.id && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium">
                          {prompt.name}
                        </span>
                        {prompt.type && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-white/[0.06] text-muted">
                            {prompt.type}
                          </span>
                        )}
                        {prompt.content && (
                          <p className="text-xs text-muted mt-0.5 line-clamp-2">
                            {prompt.content}
                          </p>
                        )}
                      </div>
                      <Icon
                        icon="lucide:message-square-code"
                        width={16}
                        height={16}
                        className="text-muted flex-shrink-0"
                      />
                    </div>
                  ))}
                </div>
              )}

              {selectedPromptId && (
                <p className="text-sm text-accent flex items-center gap-1">
                  <Icon icon="lucide:check-circle" width={14} height={14} />
                  Prompt selected
                </p>
              )}
            </div>
          )}

          {error && (
            <p
              ref={errorRef}
              className="text-sm text-red-400 flex items-center gap-1.5 mt-4"
            >
              <Icon icon="lucide:alert-circle" width={14} height={14} />
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-card-border bg-background/50">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={prevStep}
                className="flex items-center gap-1.5 text-muted hover:text-white transition-colors"
              >
                <Icon icon="lucide:arrow-left" width={16} height={16} />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Skip button for step 2 */}
            {currentStep === 2 && (
              <button
                type="button"
                onClick={skipStep}
                className="px-4 py-2 text-muted hover:text-white transition-colors text-sm"
              >
                Skip
              </button>
            )}

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={nextStep}
                disabled={currentStep === 1 && !canProceedStep1}
                className="bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
              >
                Next
                <Icon icon="lucide:arrow-right" width={16} height={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !canProceedStep1}
                className="bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <Icon
                    icon="lucide:loader-2"
                    width={16}
                    height={16}
                    className="animate-spin"
                  />
                ) : (
                  <Icon icon="lucide:check" width={16} height={16} />
                )}
                {loading ? 'Creating…' : 'Create Presence'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Worker Agent Modal - Multi-Step Wizard
// Steps: 1. Basic Info → 2. Empower (Connect Tools) → 3. System Prompt
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions for Worker Step 1
// ─────────────────────────────────────────────────────────────────────────────

const WORKER_NAME_MAX = 25
const WORKER_ROLE_MAX = 100
const WORKER_DESCRIPTION_MAX = 255
const WORKER_BACKSTORY_MAX = 255

function validateWorkerName(name: string): string | null {
  if (!name) return null
  if (name.trim().length === 0) return 'Name is required'
  if (name.length > WORKER_NAME_MAX) return `Max ${WORKER_NAME_MAX} characters`
  return null
}

function validateWorkerRole(role: string): string | null {
  if (!role) return null
  if (role.trim().length === 0) return 'Role is required'
  if (role.length > WORKER_ROLE_MAX) return `Max ${WORKER_ROLE_MAX} characters`
  return null
}

function validateWorkerDescription(desc: string): string | null {
  if (!desc) return null
  if (desc.trim().length === 0) return 'Description is required'
  if (desc.length > WORKER_DESCRIPTION_MAX)
    return `Max ${WORKER_DESCRIPTION_MAX} characters`
  return null
}

function validateWorkerBackstory(backstory: string): string | null {
  if (!backstory) return null
  if (backstory.trim().length === 0) return 'Backstory is required'
  if (backstory.length > WORKER_BACKSTORY_MAX)
    return `Max ${WORKER_BACKSTORY_MAX} characters`
  return null
}

interface CreateWorkerAgentModalProps {
  onClose: () => void
  onCreated: (agent: Presence) => void
  platformId?: string
  wallet: string
}

const WORKER_STEPS = [
  { id: 1, name: 'Basic Info', icon: 'lucide:user' },
  { id: 2, name: 'Empower', icon: 'lucide:zap' },
  { id: 3, name: 'System Prompt', icon: 'lucide:message-square-code' },
]

export function CreateWorkerAgentModal({
  onClose,
  onCreated,
  platformId,
  wallet,
}: CreateWorkerAgentModalProps) {
  // Load draft from localStorage on mount
  const initialDraft = loadWorkerDraft()

  const [currentStep, setCurrentStep] = useState(initialDraft?.currentStep || 1)

  // Step 1: Basic Info
  const [name, setName] = useState(initialDraft?.name || '')
  const [nameTouched, setNameTouched] = useState(false)
  const [description, setDescription] = useState(
    initialDraft?.description || ''
  )
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [backstory, setBackstory] = useState(initialDraft?.backstory || '')
  const [backstoryTouched, setBackstoryTouched] = useState(false)
  const [role, setRole] = useState(initialDraft?.role || '')
  const [roleTouched, setRoleTouched] = useState(false)
  const [accessLevel, setAccessLevel] = useState<WorkerAccessLevel>(
    initialDraft?.accessLevel || 'public'
  )
  
  // Parent Presence (required)
  const [parentPresenceId, setParentPresenceId] = useState(initialDraft?.parentPresenceId || '')
  const [presences, setPresences] = useState<Presence[]>([])
  const [loadingPresences, setLoadingPresences] = useState(true)
  const [presenceDropdownOpen, setPresenceDropdownOpen] = useState(false)
  const presenceDropdownRef = useRef<HTMLDivElement>(null)

  // Step 2: Empower (Connect Tools)
  const [connectedTools, setConnectedTools] = useState<ConnectedTool[]>(
    initialDraft?.connectedTools || []
  )
  const [connectingTool, setConnectingTool] = useState<Tool | null>(null)

  // Step 3: System Prompt
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(
    initialDraft?.selectedPromptId || null
  )
  const [loadingPrompts, setLoadingPrompts] = useState(false)

  // General state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Auto-save debounced function
  const saveDraft = useCallback(() => {
    const draft: WorkerDraft = {
      name,
      description,
      backstory,
      role,
      accessLevel,
      parentPresenceId,
      connectedTools,
      selectedPromptId,
      currentStep,
      savedAt: Date.now(),
    }
    saveWorkerDraft(draft)
  }, [
    name,
    description,
    backstory,
    role,
    accessLevel,
    parentPresenceId,
    connectedTools,
    selectedPromptId,
    currentStep,
  ])

  const debouncedSaveDraft = useDebounce(saveDraft, AUTO_SAVE_DEBOUNCE_MS)

  // Auto-save on field changes
  useEffect(() => {
    // Only save if there's meaningful data
    if (
      name ||
      description ||
      backstory ||
      role ||
      parentPresenceId ||
      connectedTools.length > 0 ||
      selectedPromptId
    ) {
      debouncedSaveDraft()
    }
  }, [
    name,
    description,
    backstory,
    role,
    accessLevel,
    parentPresenceId,
    connectedTools,
    selectedPromptId,
    debouncedSaveDraft,
  ])

  // Save draft immediately on step change
  useEffect(() => {
    if (name || description || role) {
      saveDraft()
    }
  }, [currentStep])

  // Auto-scroll to error when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [error])

  // Inline validation errors (only show after field is touched)
  const inlineNameError = nameTouched ? validateWorkerName(name) : null
  const inlineRoleError = roleTouched ? validateWorkerRole(role) : null
  const inlineDescriptionError = descriptionTouched
    ? validateWorkerDescription(description)
    : null
  const inlineBackstoryError = backstoryTouched
    ? validateWorkerBackstory(backstory)
    : null

  // Can proceed only if all fields are valid
  const canProceedStep1 =
    name.trim() &&
    role.trim() &&
    description.trim() &&
    backstory.trim() &&
    parentPresenceId.trim() &&
    !validateWorkerName(name) &&
    !validateWorkerRole(role) &&
    !validateWorkerDescription(description) &&
    !validateWorkerBackstory(backstory)

  // Fetch presences on mount
  useEffect(() => {
    async function fetchPresences() {
      setLoadingPresences(true)
      try {
        const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'
        const res = await fetch(
          `${AGENT_API_URL}/api/agents?wallet=${encodeURIComponent(wallet)}&includeWorkers=false`
        )
        if (res.ok) {
          const data = await res.json()
          const presenceList = (data.agents || []).filter((a: Presence) => a.type === 'PRESENCE')
          setPresences(presenceList)
        }
      } catch (err) {
        console.error('Error fetching presences:', err)
      } finally {
        setLoadingPresences(false)
      }
    }
    fetchPresences()
  }, [wallet])

  // Close presence dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (presenceDropdownRef.current && !presenceDropdownRef.current.contains(e.target as Node)) {
        setPresenceDropdownOpen(false)
      }
    }
    if (presenceDropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [presenceDropdownOpen])

  useEffect(() => {
    if (currentStep === 3 && prompts.length === 0) {
      fetchPrompts()
    }
  }, [currentStep])

  async function fetchPrompts() {
    setLoadingPrompts(true)
    try {
      const AGENT_API_URL =
        process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'
      const params = new URLSearchParams()
      if (wallet) params.set('wallet', wallet)
      if (platformId) params.set('platformId', platformId)
      const res = await fetch(
        `${AGENT_API_URL}/api/prompts?${params.toString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setPrompts(data.prompts || [])
      }
    } catch (error) {
      console.error('Error fetching prompts:', error)
    } finally {
      setLoadingPrompts(false)
    }
  }

  function isToolConnected(toolName: string): boolean {
    return connectedTools.some((t) => t.toolName === toolName && t.verified)
  }

  function getConnectedTool(toolName: string): ConnectedTool | undefined {
    return connectedTools.find((t) => t.toolName === toolName)
  }

  function handleToolConnected(
    toolName: string,
    credentials: Record<string, string>,
    externalHandle?: string
  ) {
    setConnectedTools((prev) => {
      const filtered = prev.filter((t) => t.toolName !== toolName)
      return [
        ...filtered,
        { toolName, credentials, externalHandle, verified: true },
      ]
    })
    setConnectingTool(null)
  }

  function handleDisconnectTool(toolName: string) {
    setConnectedTools((prev) => prev.filter((t) => t.toolName !== toolName))
  }

  function nextStep() {
    // Enforce Step 1 validation before proceeding
    if (currentStep === 1 && !canProceedStep1) {
      return
    }
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Skip step and clear any data selected in the current step
  function skipStep() {
    if (currentStep === 2) {
      // Step 2: Empower - clear all connected tools
      setConnectedTools([])
    } else if (currentStep === 3) {
      // Step 3: System Prompt - clear selected prompt
      setSelectedPromptId(null)
    }
    nextStep()
  }

  async function handleCreate() {
    if (!canProceedStep1) return
    setSaving(true)
    setError('')

    try {
      // 1. Create the Worker agent
      const agent = await createWorkerAgent({
        name: name.trim(),
        briefDescription: description.trim(),
        backstory: backstory.trim() || undefined,
        role: role.trim(),
        accessLevel,
        wallet,
        platformId,
        parentId: parentPresenceId || undefined,
        // Expand "google" to individual Google tools array, exclude telegram from agent table
        tools: connectedTools
          .filter((t) => t.toolName !== 'telegram')
          .flatMap((t) =>
            t.toolName === 'google' ? GOOGLE_TOOLS : [t.toolName]
          ),
        promptId: selectedPromptId,
      })

      // 2. Connect tools with credentials (save to DB)
      for (const tool of connectedTools) {
        try {
          await connectToolToWorker(agent.id, tool.toolName, tool.credentials)
        } catch (toolError) {
          console.error(`Failed to save tool ${tool.toolName}:`, toolError)
        }
      }

      // Clear draft on successful creation
      clearWorkerDraft()
      onCreated(agent)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop - clicking outside does NOT close the modal to prevent data loss */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-card-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                <Icon
                  icon="lucide:bot"
                  width={20}
                  height={20}
                  className="text-white/70"
                />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Create Worker Agent
                </h2>
                <p className="text-xs text-muted">
                  Step {currentStep} of {WORKER_STEPS.length}:{' '}
                  {WORKER_STEPS[currentStep - 1].name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-white transition-colors cursor-pointer"
            >
              <Icon icon="lucide:x" width={20} height={20} />
            </button>
          </div>

          {/* Step Indicators */}
          <div className="px-6 py-4 border-b border-card-border bg-background/50">
            <div className="relative flex items-start justify-between">
              {/* Connector lines - positioned at vertical center with small gaps from circles */}
              {/* Line 1: from circle 1 to circle 2 */}
              <div
                className={`absolute h-[2px] rounded-full ${currentStep > 1 ? 'bg-green-500/50' : 'bg-white/[0.1]'}`}
                style={{
                  top: '19px',
                  left: 'calc(16.67% + 28px)', // Right edge of circle + 8px gap
                  right: 'calc(50% + 28px)', // Left edge of middle circle + 8px gap
                }}
              />
              {/* Line 2: from circle 2 to circle 3 */}
              <div
                className={`absolute h-[2px] rounded-full ${currentStep > 2 ? 'bg-green-500/50' : 'bg-white/[0.1]'}`}
                style={{
                  top: '19px',
                  left: 'calc(50% + 28px)', // Right edge of middle circle + 8px gap
                  right: 'calc(16.67% + 28px)', // Left edge of last circle + 8px gap
                }}
              />

              {/* Step circles */}
              {WORKER_STEPS.map((step) => (
                <div
                  key={step.id}
                  className="flex flex-col items-center z-10"
                  style={{ width: '33.33%' }}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${currentStep === step.id
                      ? 'bg-accent text-white'
                      : currentStep > step.id
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-card text-muted border border-white/[0.1]'
                      }`}
                  >
                    {currentStep > step.id ? (
                      <Icon icon="lucide:check" width={18} height={18} />
                    ) : (
                      <Icon icon={step.icon} width={18} height={18} />
                    )}
                  </div>
                  <span
                    className={`text-xs mt-2 whitespace-nowrap ${currentStep === step.id ? 'text-accent font-medium' : 'text-muted'}`}
                  >
                    {step.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Step 1: Basic Info */}
            {currentStep === 1 && (
              <div className="space-y-4">
                {/* Parent Presence (Required) */}
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Select Presence <span className="text-accent">*</span>
                  </label>
                  <div className="relative" ref={presenceDropdownRef}>
                    <button
                      type="button"
                      disabled={loadingPresences}
                      onClick={() => setPresenceDropdownOpen((o) => !o)}
                      className={`w-full bg-input border rounded-xl px-4 py-3 text-left focus:outline-none cursor-pointer disabled:opacity-50 flex items-center justify-between gap-2 transition-colors hover:border-accent/40 ${
                        parentPresenceId ? 'border-accent/50' : 'border-card-border'
                      }`}
                    >
                      <span className={parentPresenceId ? 'text-accent' : 'text-muted'}>
                        {loadingPresences
                          ? 'Loading presences...'
                          : parentPresenceId
                            ? presences.find((p) => p.id === parentPresenceId)?.name || 'Select a presence...'
                            : 'Select a presence...'}
                      </span>
                      <Icon
                        icon={loadingPresences ? 'lucide:loader-2' : presenceDropdownOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                        width={16}
                        height={16}
                        className={`flex-shrink-0 ${loadingPresences ? 'animate-spin text-muted' : parentPresenceId ? 'text-accent' : 'text-muted'}`}
                      />
                    </button>

                    {presenceDropdownOpen && !loadingPresences && (
                      <div className="absolute z-50 w-full mt-1 bg-card border border-accent/30 rounded-xl shadow-2xl overflow-hidden">
                        <div className="max-h-48 overflow-y-auto">
                          {presences.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-muted">
                              No presences found. Create a presence first.
                            </div>
                          ) : (
                            <>
                              {/* Select presence option (to unselect) */}
                              <button
                                type="button"
                                onClick={() => { setParentPresenceId(''); setPresenceDropdownOpen(false) }}
                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                                  !parentPresenceId
                                    ? 'bg-accent/20 text-accent'
                                    : 'text-muted hover:bg-accent/10 hover:text-accent'
                                }`}
                              >
                                <span>Select presence...</span>
                                {!parentPresenceId && (
                                  <Icon icon="lucide:check" width={14} height={14} className="text-accent flex-shrink-0" />
                                )}
                              </button>
                              {presences.map((presence) => {
                                const isSelected = parentPresenceId === presence.id
                                return (
                                  <button
                                    key={presence.id}
                                    type="button"
                                    onClick={() => { setParentPresenceId(presence.id); setPresenceDropdownOpen(false) }}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                                      isSelected
                                        ? 'bg-accent/20 text-accent'
                                        : 'text-foreground hover:bg-accent/10 hover:text-accent'
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
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {presences.length === 0 && !loadingPresences && (
                    <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                      <Icon icon="lucide:alert-triangle" width={12} height={12} />
                      Create a Presence agent first to assign as parent
                    </p>
                  )}
                </div>

                {/* Agent Name */}
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Agent Name <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => setNameTouched(true)}
                      maxLength={WORKER_NAME_MAX}
                      placeholder="e.g. Research Agent, Content Writer, Data Analyst"
                      className={`w-full bg-input border rounded-xl px-4 pr-14 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${inlineNameError
                        ? 'border-red-500/50 focus:border-red-500/70'
                        : 'border-card-border focus:border-accent/50'
                        }`}
                    />
                    <span
                      className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums ${name.length >= WORKER_NAME_MAX ? 'text-red-400' : 'text-muted'}`}
                    >
                      {name.length}/{WORKER_NAME_MAX}
                    </span>
                  </div>
                  {inlineNameError && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <Icon icon="lucide:alert-circle" width={12} height={12} />
                      {inlineNameError}
                    </p>
                  )}
                </div>

                {/* Specialization / Role */}
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Specialization / Role <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <input
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      onBlur={() => setRoleTouched(true)}
                      maxLength={WORKER_ROLE_MAX}
                      placeholder="e.g. Web research, Copywriting, Data extraction"
                      className={`w-full bg-input border rounded-xl px-4 pr-16 py-3 text-foreground placeholder:text-muted focus:outline-none transition-colors ${inlineRoleError
                        ? 'border-red-500/50 focus:border-red-500/70'
                        : 'border-card-border focus:border-accent/50'
                        }`}
                    />
                    <span
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs tabular-nums ${role.length >= WORKER_ROLE_MAX ? 'text-red-400' : 'text-muted'}`}
                    >
                      {role.length}/{WORKER_ROLE_MAX}
                    </span>
                  </div>
                  {inlineRoleError && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <Icon icon="lucide:alert-circle" width={12} height={12} />
                      {inlineRoleError}
                    </p>
                  )}
                </div>

                {/* Access Level
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Access Level <span className="text-accent">*</span>
                  </label>
                  <div className="space-y-2">
                    {WORKER_ACCESS_LEVELS.map((level) => (
                      <label
                        key={level.value}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${accessLevel === level.value
                            ? "border-accent/50 bg-accent/5"
                            : "border-card-border hover:border-white/20 hover:bg-white/[0.02]"
                          }`}
                      >
                        <input
                          type="radio"
                          name="accessLevel"
                          value={level.value}
                          checked={accessLevel === level.value}
                          onChange={() => setAccessLevel(level.value)}
                          className="mt-0.5 accent-accent"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${accessLevel === level.value ? "text-white" : "text-foreground"}`}>
                            {level.label}
                          </span>
                          <p className="text-xs text-muted mt-0.5">{level.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div> */}

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Description <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onBlur={() => setDescriptionTouched(true)}
                      maxLength={WORKER_DESCRIPTION_MAX}
                      placeholder="What does this agent do? What tasks will it handle?"
                      rows={3}
                      className={`w-full bg-input border rounded-xl px-4 py-3 pr-16 text-foreground placeholder:text-muted focus:outline-none resize-none transition-colors ${inlineDescriptionError
                        ? 'border-red-500/50 focus:border-red-500/70'
                        : 'border-card-border focus:border-accent/50'
                        }`}
                    />
                    <span
                      className={`absolute right-4 bottom-3 text-xs tabular-nums ${description.length >= WORKER_DESCRIPTION_MAX ? 'text-red-400' : 'text-muted'}`}
                    >
                      {description.length}/{WORKER_DESCRIPTION_MAX}
                    </span>
                  </div>
                  {inlineDescriptionError && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <Icon icon="lucide:alert-circle" width={12} height={12} />
                      {inlineDescriptionError}
                    </p>
                  )}
                </div>

                {/* Backstory */}
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    Backstory <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <textarea
                      value={backstory}
                      onChange={(e) => setBackstory(e.target.value)}
                      onBlur={() => setBackstoryTouched(true)}
                      maxLength={WORKER_BACKSTORY_MAX}
                      placeholder="e.g. Trained on thousands of research papers, this agent specializes in..."
                      rows={3}
                      className={`w-full bg-input border rounded-xl px-4 py-3 pr-16 text-foreground placeholder:text-muted focus:outline-none resize-none transition-colors ${inlineBackstoryError
                        ? 'border-red-500/50 focus:border-red-500/70'
                        : 'border-card-border focus:border-accent/50'
                      }`}
                    />
                    <span
                      className={`absolute right-4 bottom-3 text-xs tabular-nums ${backstory.length >= WORKER_BACKSTORY_MAX ? 'text-red-400' : 'text-muted'}`}
                    >
                      {backstory.length}/{WORKER_BACKSTORY_MAX}
                    </span>
                  </div>
                  {inlineBackstoryError && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <Icon icon="lucide:alert-circle" width={12} height={12} />
                      {inlineBackstoryError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Empower (Connect Tools) */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-white font-medium">Empower with Tools</h3>
                  <p className="text-sm text-muted">
                    Connect tools this agent can use to take actions
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_TOOLS.map((tool) => {
                    const connected = isToolConnected(tool.id)
                    const connectedData = getConnectedTool(tool.id)

                    return (
                      <div
                        key={tool.id}
                        className={`flex flex-col p-4 rounded-xl border transition-all ${connected
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-card-border hover:border-white/20 hover:bg-white/[0.02]'
                          }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${connected ? 'bg-green-500/20' : 'bg-white/[0.06]'
                              }`}
                          >
                            <Icon
                              icon={tool.icon}
                              width={20}
                              height={20}
                              className={
                                connected ? 'text-green-400' : 'text-muted'
                              }
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-white text-sm font-medium">
                              {tool.name}
                            </span>
                            <p className="text-xs text-muted line-clamp-1">
                              {tool.description}
                            </p>
                          </div>
                        </div>

                        {connected ? (
                          <div className="space-y-3">
                            {/* Connected Status Badge */}
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                              <span className="text-xs text-green-400 font-medium flex-1 truncate">
                                {connectedData?.externalHandle || 'Connected'}
                              </span>
                              <Icon
                                icon="lucide:check-circle"
                                width={14}
                                height={14}
                                className="text-green-400"
                              />
                            </div>

                            {/* Disconnect Button */}
                            <button
                              onClick={() => handleDisconnectTool(tool.id)}
                              className="w-full group flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 hover:border-red-500/40 transition-all duration-200"
                            >
                              <Icon
                                icon="lucide:unlink"
                                width={14}
                                height={14}
                                className="text-red-400 group-hover:text-red-300 transition-colors"
                              />
                              <span className="text-xs font-medium text-red-400 group-hover:text-red-300 transition-colors">
                                Disconnect
                              </span>
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={async () => {
                              if (tool.id === 'solana') {
                                // Solana: connect directly without modal (no credentials needed)
                                try {
                                  const result = await verifyToolCredentials(
                                    'solana',
                                    {}
                                  )
                                  if (result.success) {
                                    handleToolConnected(tool.id, {}, 'Solana')
                                  }
                                } catch (err) {
                                  console.error(
                                    'Failed to connect Solana:',
                                    err
                                  )
                                }
                              } else {
                                setConnectingTool(tool)
                              }
                            }}
                            disabled={!ENABLED_TOOLS.includes(tool.id)}
                            className={`w-full py-2 px-3 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${ENABLED_TOOLS.includes(tool.id)
                              ? 'bg-accent/10 hover:bg-accent/20 text-accent'
                              : 'bg-white/[0.03] text-muted cursor-not-allowed'
                              }`}
                          >
                            <Icon icon="lucide:link" width={14} height={14} />
                            {ENABLED_TOOLS.includes(tool.id)
                              ? 'Connect'
                              : 'Coming Soon'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {connectedTools.length > 0 && (
                  <p className="text-sm text-green-400 flex items-center gap-1">
                    <Icon icon="lucide:zap" width={14} height={14} />
                    {connectedTools.length} tool(s) connected
                  </p>
                )}

                {connectedTools.length === 0 && (
                  <div className="text-center py-4 bg-white/[0.02] rounded-xl border border-dashed border-card-border">
                    <p className="text-muted text-sm">
                      No tools connected. Agent will only respond to messages.
                    </p>
                    <p className="text-xs text-muted/70 mt-1">
                      You can connect tools later in settings.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: System Prompt */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">
                      Select System Prompt
                    </h3>
                    <p className="text-sm text-muted">
                      Choose a pre-defined prompt to guide agent behavior
                    </p>
                  </div>
                  <a
                    href="/prompts"
                    className="text-sm text-accent hover:underline flex items-center gap-1"
                  >
                    <Icon icon="lucide:plus" width={14} height={14} />
                    Create New
                  </a>
                </div>

                {loadingPrompts ? (
                  <div className="flex items-center justify-center py-8">
                    <Icon
                      icon="lucide:loader-2"
                      width={24}
                      height={24}
                      className="animate-spin text-accent"
                    />
                  </div>
                ) : prompts.length === 0 ? (
                  <div className="text-center py-8 bg-white/[0.02] rounded-xl border border-dashed border-card-border">
                    <Icon
                      icon="lucide:message-square-code"
                      width={32}
                      height={32}
                      className="mx-auto text-muted mb-2"
                    />
                    <p className="text-muted">No prompts found</p>
                    <p className="text-sm text-muted/70 mt-1">
                      Create prompts in the{' '}
                      <a
                        href="/prompts"
                        className="text-accent hover:underline"
                      >
                        Instruct
                      </a>{' '}
                      section
                    </p>
                    <p className="text-xs text-muted/50 mt-2">
                      You can skip this step and add later
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {prompts.map((prompt) => (
                      <div
                        key={prompt.id}
                        onClick={() =>
                          setSelectedPromptId(
                            selectedPromptId === prompt.id ? null : prompt.id
                          )
                        }
                        className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedPromptId === prompt.id
                          ? 'border-accent/50 bg-accent/5'
                          : 'border-card-border hover:border-white/20 hover:bg-white/[0.02]'
                          }`}
                      >
                        <div
                          className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${selectedPromptId === prompt.id ? 'border-accent bg-accent' : 'border-muted'}`}
                        >
                          {selectedPromptId === prompt.id && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium">
                            {prompt.name}
                          </span>
                          {prompt.content && (
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">
                              {prompt.content}
                            </p>
                          )}
                        </div>
                        <Icon
                          icon="lucide:message-square-code"
                          width={16}
                          height={16}
                          className="text-muted flex-shrink-0"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {selectedPromptId && (
                  <p className="text-sm text-accent flex items-center gap-1">
                    <Icon icon="lucide:check-circle" width={14} height={14} />
                    Prompt selected
                  </p>
                )}
              </div>
            )}

            {error && (
              <p
                ref={errorRef}
                className="text-sm text-red-400 flex items-center gap-1.5 mt-4"
              >
                <Icon icon="lucide:alert-circle" width={14} height={14} />
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-card-border bg-background/50">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex items-center gap-1.5 text-muted hover:text-white transition-colors"
                >
                  <Icon icon="lucide:arrow-left" width={16} height={16} />
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Skip button for step 2 */}
              {currentStep === 2 && (
                <button
                  type="button"
                  onClick={skipStep}
                  className="px-4 py-2 text-muted hover:text-white transition-colors text-sm"
                >
                  Skip
                </button>
              )}

              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={currentStep === 1 && !canProceedStep1}
                  className="bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
                >
                  Next
                  <Icon icon="lucide:arrow-right" width={16} height={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving || !canProceedStep1}
                  className="bg-accent hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
                >
                  {saving && (
                    <Icon
                      icon="lucide:loader-2"
                      width={16}
                      height={16}
                      className="animate-spin"
                    />
                  )}
                  {saving ? 'Creating…' : 'Create Agent'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tool Connection Modal */}
      {connectingTool && (
        <ToolConnectModal
          tool={connectingTool}
          onClose={() => setConnectingTool(null)}
          onConnected={(credentials, externalHandle) => {
            handleToolConnected(connectingTool.id, credentials, externalHandle)
          }}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Connection Modal
// ─────────────────────────────────────────────────────────────────────────────

interface ToolConnectModalProps {
  tool: Tool
  onClose: () => void
  onConnected: (
    credentials: Record<string, string>,
    externalHandle?: string
  ) => void
}

function ToolConnectModal({
  tool,
  onClose,
  onConnected,
}: ToolConnectModalProps) {
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
      // Only handle messages from our popup
      if (
        event.data?.type === 'oauth_success' &&
        event.data?.provider === tool.id
      ) {
        const { credentials, displayName } = event.data
        setVerifying(false)
        setOauthPopup(null)
        onConnected(
          credentials,
          displayName || credentials.email || 'Connected'
        )
      } else if (
        event.data?.type === 'oauth_error' &&
        event.data?.provider === tool.id
      ) {
        setError(event.data.error || 'OAuth failed')
        setVerifying(false)
        setOauthPopup(null)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [tool.id, onConnected])

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

    // Open popup for Google OAuth - use backend URL (no OAuth logic in frontend)
    const backendUrl =
      process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'
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

        // Verify with backend API (not directly with Bluesky)
        const result = await verifyToolCredentials('bluesky', {
          handle: blueskyHandle.trim(),
          app_password: blueskyAppPassword.trim(),
        })

        if (!result.success) {
          setError(result.error || 'Invalid credentials')
          setVerifying(false)
          return
        }

        onConnected(
          result.credentials || {
            handle: blueskyHandle.trim(),
            app_password: blueskyAppPassword.trim(),
          },
          result.externalHandle
        )
      } else if (tool.id === 'telegram') {
        if (!telegramBotToken.trim()) {
          setError('Please enter the bot token')
          setVerifying(false)
          return
        }

        // Verify with backend API (not directly with Telegram)
        const result = await verifyToolCredentials('telegram', {
          bot_token: telegramBotToken.trim(),
        })

        if (!result.success) {
          setError(result.error || 'Invalid bot token')
          setVerifying(false)
          return
        }

        onConnected(
          result.credentials || { bot_token: telegramBotToken.trim() },
          result.externalHandle
        )
      } else if (tool.id === 'google') {
        // Google uses popup OAuth - handled by handleGoogleOAuth
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop - clicking outside does NOT close the modal to prevent data loss */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-card-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Icon
                icon={tool.icon}
                width={20}
                height={20}
                className="text-accent"
              />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Connect {tool.name}
              </h2>
              <p className="text-xs text-muted">{tool.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors cursor-pointer"
          >
            <Icon icon="lucide:x" width={20} height={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Instructions */}
          {tool.instructions && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 mb-6">
              <h4 className="text-sm font-medium text-accent flex items-center gap-2 mb-2">
                <Icon icon="lucide:info" width={14} height={14} />
                How to get credentials
              </h4>
              <p className="text-xs text-muted whitespace-pre-line">
                {tool.instructions}
              </p>
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
                  data-form-type="other"
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
                  data-form-type="other"
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
                  data-form-type="other"
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
                  <Icon
                    icon="lucide:loader-2"
                    width={16}
                    height={16}
                    className="animate-spin"
                  />
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
                <Icon
                  icon="lucide:loader-2"
                  width={16}
                  height={16}
                  className="animate-spin"
                />
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