/**
 * Prompts API Client
 *
 * Connects to the Python FastAPI backend (kinship-agent) for prompt operations.
 */

// Backend URL - configure in .env as NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Prompt {
  id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  tier: number; // 1=Global, 2=Scene, 3=NPC
  status: string;
  wallet: string;
  platformId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptParams {
  name: string;
  content?: string;
  description?: string;
  category?: string;
  tier?: number;
  wallet: string;
  platformId?: string;
}

export interface UpdatePromptParams {
  name?: string;
  content?: string;
  description?: string;
  category?: string;
  tier?: number;
  status?: string;
}

export interface ListPromptsParams {
  wallet?: string;
  platformId?: string;
  tier?: number;
  status?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List prompts
 */
export async function listPrompts(
  params: ListPromptsParams = {}
): Promise<{ prompts: Prompt[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.wallet) searchParams.set("wallet", params.wallet);
  if (params.platformId) searchParams.set("platformId", params.platformId);
  if (params.tier !== undefined) searchParams.set("tier", params.tier.toString());
  if (params.status) searchParams.set("status", params.status);
  if (params.category) searchParams.set("category", params.category);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.offset) searchParams.set("offset", params.offset.toString());

  const res = await fetch(`${AGENT_API_URL}/api/prompts?${searchParams.toString()}`);
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to list prompts");
  }

  return res.json();
}

/**
 * Get a single prompt by ID
 */
export async function getPrompt(id: string): Promise<Prompt> {
  const res = await fetch(`${AGENT_API_URL}/api/prompts/${id}`);
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Prompt not found");
  }

  return res.json();
}

/**
 * Create a new prompt
 */
export async function createPrompt(params: CreatePromptParams): Promise<Prompt> {
  const res = await fetch(`${AGENT_API_URL}/api/prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to create prompt");
  }

  return res.json();
}

/**
 * Update a prompt
 */
export async function updatePrompt(
  id: string,
  params: UpdatePromptParams
): Promise<Prompt> {
  const res = await fetch(`${AGENT_API_URL}/api/prompts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to update prompt");
  }

  return res.json();
}

/**
 * Delete a prompt
 */
export async function deletePrompt(id: string): Promise<void> {
  const res = await fetch(`${AGENT_API_URL}/api/prompts/${id}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 204) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to delete prompt");
  }
}
