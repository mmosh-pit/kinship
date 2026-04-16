/**
 * Agents API Client
 *
 * Connects to the Python FastAPI backend (kinship-agent) for agent operations.
 */

import type { Presence, AgentTone, WorkerAccessLevel } from "./agent-types";

// Backend URL - configure in .env as NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePresenceParams {
  name: string;
  handle: string;
  briefDescription?: string;
  backstory?: string;
  tone?: AgentTone;
  wallet: string;
  platformId?: string;
  knowledgeBaseIds?: string[];
  promptId?: string;
}

export interface CreateWorkerParams {
  name: string;
  briefDescription?: string;
  backstory?: string;
  role?: string;
  accessLevel?: WorkerAccessLevel;
  wallet: string;
  platformId?: string;
  parentId?: string;
  tools?: string[];
  knowledgeBaseIds?: string[];
  promptId?: string | null;
  systemPrompt?: string | null;
}

export interface UpdateAgentParams {
  name?: string;
  handle?: string;
  briefDescription?: string;
  description?: string;
  backstory?: string;
  role?: string;
  accessLevel?: WorkerAccessLevel;
  tone?: AgentTone;
  status?: string;
  knowledgeBaseIds?: string[];
  promptId?: string;
  tools?: string[];
}

export interface AgentListResult {
  agents: Presence[];
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Empower Types (for shared user access)
// ─────────────────────────────────────────────────────────────────────────────

export type AccessType = "owned" | "shared";

export interface EmpowerPresence {
  id: string;
  name: string;
  handle?: string;
  type: string;
  status: string;
  description?: string;
  backstory?: string;
  access_level?: string;
  tone?: string;
  system_prompt?: string;
  access_type: AccessType;
  context_id?: string;
  context_name?: string;
}

export interface EmpowerWorker {
  id: string;
  name: string;
  type: string;
  status: string;
  description?: string;
  parent_id: string;
  tools: string[];
  access_type: AccessType;
  context_id?: string;
  context_name?: string;
  connected_tools: string[];
  external_handles: Record<string, string>;
}

export interface EmpowerAgentsResult {
  presences: EmpowerPresence[];
  workers: EmpowerWorker[];
  total_presences: number;
  total_workers: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all agents with optional filters
 */
export async function listAgents(params?: {
  wallet?: string;
  platformId?: string;
  type?: "presence" | "worker";
  includeWorkers?: boolean;
}): Promise<AgentListResult> {
  const searchParams = new URLSearchParams();
  if (params?.wallet) searchParams.set("wallet", params.wallet);
  if (params?.platformId) searchParams.set("platformId", params.platformId);
  if (params?.type) searchParams.set("type", params.type);
  if (params?.includeWorkers !== undefined) {
    searchParams.set("includeWorkers", String(params.includeWorkers));
  }

  const response = await fetch(
    `${AGENT_API_URL}/api/agents?${searchParams.toString()}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to list agents");
  }

  return response.json();
}

/**
 * List all agents for empower page (owned + shared with tool connection status)
 * 
 * Returns agents accessible to the user with:
 * - access_type: "owned" or "shared"
 * - connected_tools: tools the current user has connected (their own, not others')
 * - external_handles: connection handles for the current user
 */
export async function listEmpowerAgents(params: {
  wallet: string;
}): Promise<EmpowerAgentsResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("wallet", params.wallet);

  const response = await fetch(
    `${AGENT_API_URL}/api/agents/empower?${searchParams.toString()}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to list empower agents");
  }

  return response.json();
}

/**
 * Get a single agent by ID
 */
export async function getAgent(agentId: string): Promise<Presence> {
  const response = await fetch(`${AGENT_API_URL}/api/agents/${agentId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Agent not found");
  }

  const data = await response.json();
  return data;
}

/**
 * Create a new Presence (Supervisor) agent
 */
export async function createPresenceAgent(
  params: CreatePresenceParams
): Promise<Presence> {
  const response = await fetch(`${AGENT_API_URL}/api/agents/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      handle: params.handle,
      description: params.briefDescription,
      backstory: params.backstory,
      tone: params.tone || "neutral",
      wallet: params.wallet,
      platformId: params.platformId,
      knowledgeBaseIds: params.knowledgeBaseIds,
      promptId: params.promptId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.error || "Failed to create presence");
  }

  return response.json();
}

/**
 * Create a new Worker agent
 */
export async function createWorkerAgent(
  params: CreateWorkerParams
): Promise<Presence> {
  const response = await fetch(`${AGENT_API_URL}/api/agents/worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      description: params.briefDescription,
      backstory: params.backstory,
      role: params.role,
      accessLevel: params.accessLevel || "private",
      wallet: params.wallet,
      platformId: params.platformId,
      parentId: params.parentId,
      tools: params.tools,
      knowledgeBaseIds: params.knowledgeBaseIds,
      promptId: params.promptId,
      systemPrompt: params.systemPrompt,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    // Handle specific error codes
    if (error.code === "PRESENCE_REQUIRED") {
      throw new Error(
        error.error || "You must create a Presence before creating Worker agents"
      );
    }
    throw new Error(error.detail || error.error || "Failed to create worker");
  }

  return response.json();
}

/**
 * Update an existing agent
 */
export async function updateAgent(
  agentId: string,
  params: UpdateAgentParams
): Promise<Presence> {
  const response = await fetch(`${AGENT_API_URL}/api/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.error || "Failed to update agent");
  }

  return response.json();
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId: string): Promise<void> {
  const response = await fetch(`${AGENT_API_URL}/api/agents/${agentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.error || "Failed to delete agent");
  }
}

/**
 * Get all workers for a Presence
 */
export async function getWorkersForPresence(
  presenceId: string
): Promise<AgentListResult> {
  const response = await fetch(
    `${AGENT_API_URL}/api/agents/${presenceId}/workers`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to get workers");
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM Providers API
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMProvider {
  id: string;
  name: string;
  models: Array<{
    id: string;
    name: string;
    default?: boolean;
  }>;
  available: boolean;
}

/**
 * Get available LLM providers
 */
export async function getLLMProviders(): Promise<LLMProvider[]> {
  const response = await fetch(`${AGENT_API_URL}/api/chat/providers`);

  if (!response.ok) {
    throw new Error("Failed to get LLM providers");
  }

  const data = await response.json();
  return data.providers;
}