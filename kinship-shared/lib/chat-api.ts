/**
 * Chat API Client
 *
 * Connects to the Python FastAPI backend for chat operations.
 */

// Backend URL - configure in .env as NEXT_PUBLIC_CHAT_API_URL
const CHAT_API_URL =
  process.env.NEXT_PUBLIC_CHAT_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  presenceId: string;
  userId: string;
  userWallet: string;
  userRole: "creator" | "member" | "guest";
  platformId?: string;
  status: "active" | "archived";
  title?: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAction {
  type: string;
  workerId?: string;
  workerName?: string;
  status: "pending" | "executed" | "failed" | "requires_approval";
  result?: unknown;
  error?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  action?: MessageAction;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  createdAt: string;
}

export interface OrchestrationResult {
  success: boolean;
  intent?: {
    classified: string;
    action: string | null;
    confidence: number;
  };
  execution?: {
    workerId: string;
    workerName: string;
    status: string;
    result?: unknown;
  };
  pendingApproval?: {
    id: string;
    reason: string;
  };
}

export interface SendMessageResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  orchestration: OrchestrationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new chat session
 */
export async function createChatSession(params: {
  presenceId: string;
  userId: string;
  userWallet: string;
  userRole: "creator" | "member" | "guest";
  platformId?: string;
  title?: string;
}): Promise<ChatSession> {
  const response = await fetch(`${CHAT_API_URL}/api/chat/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      presenceId: params.presenceId,
      userId: params.userId,
      userWallet: params.userWallet,
      userRole: params.userRole,
      platformId: params.platformId,
      title: params.title,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to create session");
  }

  const data = await response.json();
  return data.session;
}

/**
 * List chat sessions for a user
 */
export async function listChatSessions(params: {
  userId?: string;
  userWallet?: string;
  presenceId?: string;
  status?: "active" | "archived";
  limit?: number;
}): Promise<ChatSession[]> {
  const searchParams = new URLSearchParams();
  if (params.userId) searchParams.set("userId", params.userId);
  if (params.userWallet) searchParams.set("userWallet", params.userWallet);
  if (params.presenceId) searchParams.set("presenceId", params.presenceId);
  if (params.status) searchParams.set("status", params.status);
  if (params.limit) searchParams.set("limit", params.limit.toString());

  const response = await fetch(
    `${CHAT_API_URL}/api/chat/sessions?${searchParams.toString()}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to list sessions");
  }

  const data = await response.json();
  return data.sessions;
}

/**
 * Get a chat session by ID
 */
export async function getChatSession(sessionId: string): Promise<ChatSession> {
  const response = await fetch(
    `${CHAT_API_URL}/api/chat/sessions/${sessionId}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Session not found");
  }

  const data = await response.json();
  return data.session;
}

/**
 * Archive a chat session
 */
export async function archiveChatSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `${CHAT_API_URL}/api/chat/sessions/${sessionId}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to archive session");
  }
}

/**
 * Get messages for a session
 */
export async function getChatMessages(params: {
  sessionId: string;
  limit?: number;
  before?: string;
}): Promise<ChatMessage[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("sessionId", params.sessionId);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.before) searchParams.set("before", params.before);

  const response = await fetch(
    `${CHAT_API_URL}/api/chat/messages?${searchParams.toString()}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to get messages");
  }

  const data = await response.json();
  return data.messages;
}

/**
 * Send a message (main orchestration entry point)
 */
export async function sendChatMessage(params: {
  sessionId: string;
  content: string;
  userId: string;
  userRole: "creator" | "member" | "guest";
}): Promise<SendMessageResponse> {
  const response = await fetch(`${CHAT_API_URL}/api/chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: params.sessionId,
      content: params.content,
      userId: params.userId,
      userRole: params.userRole,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to send message");
  }

  return response.json();
}

/**
 * Process a message directly (without session)
 */
export async function processMessage(params: {
  presenceId: string;
  message: string;
  userId: string;
  userWallet: string;
  userRole: "creator" | "member" | "guest";
  messageHistory?: Array<{ role: string; content: string }>;
}): Promise<OrchestrationResult & { response: string }> {
  const response = await fetch(
    `${CHAT_API_URL}/api/presence/${params.presenceId}/process`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: params.message,
        userId: params.userId,
        userWallet: params.userWallet,
        userRole: params.userRole,
        messageHistory: params.messageHistory,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to process message");
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Alignment & Checkpoint APIs
// ─────────────────────────────────────────────────────────────────────────────

export interface Alignment {
  id: string;
  name: string;
  description: string;
  presenceId: string;
  type: "loop" | "checkpoint" | "workflow";
  loop?: {
    trigger: string;
    schedule?: string;
    action: string;
    workerId?: string;
    params?: Record<string, unknown>;
    lastRun?: string;
    nextRun?: string;
  };
  checkpoint?: {
    triggers: string[];
    approvers: string[];
    autoApprove?: { conditions: string[] };
    timeout?: number;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PendingApproval {
  id: string;
  alignmentId: string;
  checkpointName: string;
  presenceId: string;
  action: {
    type: string;
    workerId: string;
    workerName: string;
    params: Record<string, unknown>;
  };
  requestedBy: {
    userId: string;
    userWallet: string;
    userRole: string;
  };
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt?: string;
}

/**
 * List alignments for a Presence
 */
export async function listAlignments(presenceId: string): Promise<Alignment[]> {
  const response = await fetch(
    `${CHAT_API_URL}/api/alignments?presenceId=${presenceId}`
  );

  if (!response.ok) {
    throw new Error("Failed to list alignments");
  }

  const data = await response.json();
  return data.alignments;
}

/**
 * Create an alignment
 */
export async function createAlignment(
  alignment: Omit<Alignment, "id" | "createdAt" | "updatedAt" | "isActive">
): Promise<Alignment> {
  const response = await fetch(`${CHAT_API_URL}/api/alignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alignment),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to create alignment");
  }

  const data = await response.json();
  return data.alignment;
}

/**
 * List pending approvals
 */
export async function listPendingApprovals(
  presenceId: string
): Promise<PendingApproval[]> {
  const response = await fetch(
    `${CHAT_API_URL}/api/checkpoints?presenceId=${presenceId}`
  );

  if (!response.ok) {
    throw new Error("Failed to list pending approvals");
  }

  const data = await response.json();
  return data.pendingApprovals;
}

/**
 * Approve a checkpoint
 */
export async function approveCheckpoint(
  approvalId: string,
  approvedBy: string
): Promise<void> {
  const response = await fetch(
    `${CHAT_API_URL}/api/checkpoints/${approvalId}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved_by: approvedBy }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to approve");
  }
}

/**
 * Reject a checkpoint
 */
export async function rejectCheckpoint(
  approvalId: string,
  rejectedBy: string,
  reason?: string
): Promise<void> {
  const response = await fetch(
    `${CHAT_API_URL}/api/checkpoints/${approvalId}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejected_by: rejectedBy, reason }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to reject");
  }
}
