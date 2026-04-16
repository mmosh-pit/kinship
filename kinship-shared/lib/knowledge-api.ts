/**
 * Knowledge API Client
 *
 * Connects to the Python FastAPI backend (kinship-agent) for knowledge operations.
 */

// Backend URL - configure in .env as NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  contentType?: string;
  content?: string;
  wallet: string;
  platformId?: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface KnowledgeItem {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  chunkCount?: number;
}

export interface CreateKnowledgeParams {
  name: string;
  description?: string;
  content?: string;
  contentType?: string;
  wallet: string;
  platformId?: string;
}

export interface UpdateKnowledgeParams {
  name?: string;
  description?: string;
  content?: string;
}

export interface ListKnowledgeParams {
  wallet?: string;
  platformId?: string;
  limit?: number;
  offset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List knowledge bases
 */
export async function listKnowledgeBases(
  params: ListKnowledgeParams = {}
): Promise<{ knowledgeBases: KnowledgeBase[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.wallet) searchParams.set("wallet", params.wallet);
  if (params.platformId) searchParams.set("platformId", params.platformId);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  if (params.offset) searchParams.set("offset", params.offset.toString());

  const res = await fetch(`${AGENT_API_URL}/api/knowledge?${searchParams.toString()}`);
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to list knowledge bases");
  }

  return res.json();
}

/**
 * Get a single knowledge base by ID
 */
export async function getKnowledgeBase(id: string): Promise<KnowledgeBase & { items: KnowledgeItem[] }> {
  const res = await fetch(`${AGENT_API_URL}/api/knowledge/${id}`);
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Knowledge base not found");
  }

  return res.json();
}

/**
 * Create a new knowledge base
 */
export async function createKnowledgeBase(params: CreateKnowledgeParams): Promise<KnowledgeBase> {
  const res = await fetch(`${AGENT_API_URL}/api/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to create knowledge base");
  }

  return res.json();
}

/**
 * Update a knowledge base
 */
export async function updateKnowledgeBase(
  id: string,
  params: UpdateKnowledgeParams
): Promise<KnowledgeBase> {
  const res = await fetch(`${AGENT_API_URL}/api/knowledge/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to update knowledge base");
  }

  return res.json();
}

/**
 * Delete a knowledge base
 */
export async function deleteKnowledgeBase(id: string): Promise<void> {
  const res = await fetch(`${AGENT_API_URL}/api/knowledge/${id}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 204) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to delete knowledge base");
  }
}

/**
 * Upload a file to a knowledge base
 */
export async function uploadToKnowledgeBase(
  kbId: string,
  file: File
): Promise<{ success: boolean; item: KnowledgeItem }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${AGENT_API_URL}/api/knowledge/${kbId}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to upload file");
  }

  return res.json();
}

/**
 * Ingest/process a knowledge base (generate embeddings)
 */
export async function ingestKnowledgeBase(kbId: string): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`${AGENT_API_URL}/api/knowledge/${kbId}/ingest`, {
    method: "POST",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "Failed to ingest knowledge base");
  }

  return res.json();
}
