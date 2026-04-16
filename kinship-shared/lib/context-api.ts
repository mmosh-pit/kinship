/**
 * Context API Client
 *
 * Connects to kinship-agent backend for Context and NestedContext operations.
 * (Migrated from kinship-assets platforms/projects)
 */

// Backend URL - configure in .env as NEXT_PUBLIC_AGENT_API_URL
// Can be set as "http://192.168.1.30:8000" or "http://192.168.1.30:8000/api/v1"
const RAW_AGENT_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";
const AGENT_API_URL = RAW_AGENT_URL.endsWith('/api/v1') 
  ? RAW_AGENT_URL 
  : `${RAW_AGENT_URL.replace(/\/$/, '')}/api/v1`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VisibilityLevel = "public" | "private" | "secret";

export interface Context {
  id: string;
  name: string;
  slug: string;
  handle: string | null;
  contextType: string | null;
  description: string;
  icon: string;
  color: string;
  presenceIds: string[];
  visibility: VisibilityLevel;
  knowledgeBaseIds: string[];
  instructionIds: string[];
  instructions: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assetsCount: number;
  gamesCount: number;
  nestedContextsCount: number;
}

export interface ContextWithNested extends Context {
  nestedContexts: NestedContext[];
}

export interface NestedContext {
  id: string;
  contextId: string;
  name: string;
  slug: string;
  handle: string | null;
  contextType: string | null;
  description: string;
  icon: string;
  color: string;
  presenceIds: string[];
  visibility: VisibilityLevel;
  knowledgeBaseIds: string[];
  gatheringIds: string[];
  instructionIds: string[];
  instructions: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assetsCount: number;
  gamesCount: number;
}

export interface CreateContextParams {
  name: string;
  handle?: string;
  contextType?: string;
  description?: string;
  icon?: string;
  color?: string;
  presenceIds?: string[];
  visibility?: VisibilityLevel;
  knowledgeBaseIds?: string[];
  instructionIds?: string[];
  instructions?: string;
  createdBy: string;
}

export interface UpdateContextParams {
  name?: string;
  handle?: string;
  contextType?: string;
  description?: string;
  icon?: string;
  color?: string;
  presenceIds?: string[];
  visibility?: VisibilityLevel;
  knowledgeBaseIds?: string[];
  instructionIds?: string[];
  instructions?: string;
  isActive?: boolean;
}

export interface CreateNestedContextParams {
  contextId: string;
  name: string;
  handle?: string;
  contextType?: string;
  description?: string;
  icon?: string;
  color?: string;
  presenceIds?: string[];
  visibility?: VisibilityLevel;
  knowledgeBaseIds?: string[];
  gatheringIds?: string[];
  instructionIds?: string[];
  instructions?: string;
  createdBy: string;
}

export interface UpdateNestedContextParams {
  name?: string;
  handle?: string;
  contextType?: string;
  description?: string;
  icon?: string;
  color?: string;
  presenceIds?: string[];
  visibility?: VisibilityLevel;
  knowledgeBaseIds?: string[];
  gatheringIds?: string[];
  instructionIds?: string[];
  instructions?: string;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward Compatibility Types (aliases for migration)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use Context instead */
export type Platform = Context;
/** @deprecated Use ContextWithNested instead */
export type PlatformWithProjects = ContextWithNested;
/** @deprecated Use NestedContext instead */
export type Project = NestedContext;
/** @deprecated Use CreateContextParams instead */
export type CreatePlatformParams = CreateContextParams;
/** @deprecated Use UpdateContextParams instead */
export type UpdatePlatformParams = UpdateContextParams;
/** @deprecated Use CreateNestedContextParams instead */
export type CreateProjectParams = CreateNestedContextParams;
/** @deprecated Use UpdateNestedContextParams instead */
export type UpdateProjectParams = UpdateNestedContextParams;

// ─────────────────────────────────────────────────────────────────────────────
// Response Transformation (snake_case -> camelCase)
// ─────────────────────────────────────────────────────────────────────────────

function transformContext(data: any): Context {
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    handle: data.handle,
    contextType: data.context_type || null,
    description: data.description,
    icon: data.icon,
    color: data.color,
    presenceIds: data.presence_ids || [],
    visibility: data.visibility,
    knowledgeBaseIds: data.knowledge_base_ids || [],
    instructionIds: data.instruction_ids || [],
    instructions: data.instructions || "",
    isActive: data.is_active,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    assetsCount: data.assets_count || 0,
    gamesCount: data.games_count || 0,
    nestedContextsCount: data.nested_contexts_count || 0,
  };
}

function transformNestedContext(data: any): NestedContext {
  return {
    id: data.id,
    contextId: data.context_id,
    name: data.name,
    slug: data.slug,
    handle: data.handle,
    contextType: data.context_type || null,
    description: data.description,
    icon: data.icon,
    color: data.color,
    presenceIds: data.presence_ids || [],
    visibility: data.visibility,
    knowledgeBaseIds: data.knowledge_base_ids || [],
    gatheringIds: data.gathering_ids || [],
    instructionIds: data.instruction_ids || [],
    instructions: data.instructions || "",
    isActive: data.is_active,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    assetsCount: data.assets_count || 0,
    gamesCount: data.games_count || 0,
  };
}

function transformContextWithNested(data: any): ContextWithNested {
  return {
    ...transformContext(data),
    nestedContexts: (data.nested_contexts || []).map(transformNestedContext),
  };
}

function transformContextRequest(params: CreateContextParams | UpdateContextParams): any {
  const result: any = {};
  
  if ('name' in params && params.name !== undefined) result.name = params.name;
  if ('handle' in params && params.handle !== undefined) result.handle = params.handle;
  if ('contextType' in params && params.contextType !== undefined) result.contextType = params.contextType;
  if ('description' in params && params.description !== undefined) result.description = params.description;
  if ('icon' in params && params.icon !== undefined) result.icon = params.icon;
  if ('color' in params && params.color !== undefined) result.color = params.color;
  if ('presenceIds' in params && params.presenceIds !== undefined) result.presenceIds = params.presenceIds;
  if ('visibility' in params && params.visibility !== undefined) result.visibility = params.visibility;
  if ('knowledgeBaseIds' in params && params.knowledgeBaseIds !== undefined) result.knowledgeBaseIds = params.knowledgeBaseIds;
  if ('instructionIds' in params && params.instructionIds !== undefined) result.instructionIds = params.instructionIds;
  if ('instructions' in params && params.instructions !== undefined) result.instructions = params.instructions;
  if ('createdBy' in params && params.createdBy !== undefined) result.createdBy = params.createdBy;
  if ('isActive' in params && params.isActive !== undefined) result.isActive = params.isActive;
  
  return result;
}

function transformNestedContextRequest(params: CreateNestedContextParams | UpdateNestedContextParams): any {
  const result: any = {};
  
  if ('contextId' in params && params.contextId !== undefined) result.contextId = params.contextId;
  if ('name' in params && params.name !== undefined) result.name = params.name;
  if ('handle' in params && params.handle !== undefined) result.handle = params.handle;
  if ('contextType' in params && params.contextType !== undefined) result.contextType = params.contextType;
  if ('description' in params && params.description !== undefined) result.description = params.description;
  if ('icon' in params && params.icon !== undefined) result.icon = params.icon;
  if ('color' in params && params.color !== undefined) result.color = params.color;
  if ('presenceIds' in params && params.presenceIds !== undefined) result.presenceIds = params.presenceIds;
  if ('visibility' in params && params.visibility !== undefined) result.visibility = params.visibility;
  if ('knowledgeBaseIds' in params && params.knowledgeBaseIds !== undefined) result.knowledgeBaseIds = params.knowledgeBaseIds;
  if ('gatheringIds' in params && params.gatheringIds !== undefined) result.gatheringIds = params.gatheringIds;
  if ('instructionIds' in params && params.instructionIds !== undefined) result.instructionIds = params.instructionIds;
  if ('instructions' in params && params.instructions !== undefined) result.instructions = params.instructions;
  if ('createdBy' in params && params.createdBy !== undefined) result.createdBy = params.createdBy;
  if ('isActive' in params && params.isActive !== undefined) result.isActive = params.isActive;
  
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all contexts
 * @param wallet - Optional wallet address to filter contexts by creator (created_by field)
 */
export async function listContexts(wallet?: string): Promise<Context[]> {
  const params = new URLSearchParams();
  if (wallet) {
    params.append("wallet", wallet);
  }
  
  const url = params.toString() 
    ? `${AGENT_API_URL}/context?${params.toString()}`
    : `${AGENT_API_URL}/context`;
    
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to list contexts");
  }

  const data = await response.json();
  return data.map(transformContext);
}

/**
 * List all contexts with their nested contexts embedded
 * @param wallet - Optional wallet address to filter contexts by creator (created_by field)
 */
export async function listContextsWithNested(wallet?: string): Promise<ContextWithNested[]> {
  const params = new URLSearchParams({ include_nested: "true" });
  if (wallet) {
    params.append("wallet", wallet);
  }
  
  const response = await fetch(`${AGENT_API_URL}/context?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to list contexts with nested");
  }

  const data = await response.json();
  return data.map(transformContextWithNested);
}

/**
 * Get a single context by ID
 */
export async function getContext(id: string): Promise<Context> {
  const response = await fetch(`${AGENT_API_URL}/context/${id}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Box not found");
  }

  const data = await response.json();
  return transformContext(data);
}

/**
 * Get a context by handle
 */
export async function getContextByHandle(handle: string): Promise<Context> {
  const response = await fetch(`${AGENT_API_URL}/context/handle/${encodeURIComponent(handle)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Box not found");
  }

  const data = await response.json();
  return transformContext(data);
}

/**
 * Create a new context
 */
export async function createContext(params: CreateContextParams): Promise<Context> {
  const response = await fetch(`${AGENT_API_URL}/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transformContextRequest(params)),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to create context");
  }

  const data = await response.json();
  return transformContext(data);
}

/**
 * Update a context
 */
export async function updateContext(id: string, params: UpdateContextParams): Promise<Context> {
  const response = await fetch(`${AGENT_API_URL}/context/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transformContextRequest(params)),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to update context");
  }

  const data = await response.json();
  return transformContext(data);
}

/**
 * Delete a context
 */
export async function deleteContext(id: string): Promise<void> {
  const response = await fetch(`${AGENT_API_URL}/context/${id}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to delete context");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NestedContext API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all nested contexts
 */
export async function listNestedContexts(contextId?: string): Promise<NestedContext[]> {
  const url = contextId 
    ? `${AGENT_API_URL}/nested-context?context_id=${contextId}`
    : `${AGENT_API_URL}/nested-context`;
    
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to list nested contexts");
  }

  const data = await response.json();
  return data.map(transformNestedContext);
}

/**
 * List nested contexts for a specific context
 */
export async function listNestedContextsForContext(contextId: string): Promise<NestedContext[]> {
  const response = await fetch(`${AGENT_API_URL}/context/${contextId}/nested`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to list nested contexts");
  }

  const data = await response.json();
  return data.map(transformNestedContext);
}

/**
 * Get a single nested context by ID
 */
export async function getNestedContext(id: string): Promise<NestedContext> {
  const response = await fetch(`${AGENT_API_URL}/nested-context/${id}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Nested context not found");
  }

  const data = await response.json();
  return transformNestedContext(data);
}

/**
 * Get a nested context by handle
 */
export async function getNestedContextByHandle(handle: string): Promise<NestedContext> {
  const response = await fetch(`${AGENT_API_URL}/nested-context/handle/${encodeURIComponent(handle)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Nested context not found");
  }

  const data = await response.json();
  return transformNestedContext(data);
}

/**
 * Create a new nested context
 */
export async function createNestedContext(params: CreateNestedContextParams): Promise<NestedContext> {
  const response = await fetch(`${AGENT_API_URL}/nested-context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transformNestedContextRequest(params)),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to create nested context");
  }

  const data = await response.json();
  return transformNestedContext(data);
}

/**
 * Update a nested context
 */
export async function updateNestedContext(id: string, params: UpdateNestedContextParams): Promise<NestedContext> {
  const response = await fetch(`${AGENT_API_URL}/nested-context/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transformNestedContextRequest(params)),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to update nested context");
  }

  const data = await response.json();
  return transformNestedContext(data);
}

/**
 * Delete a nested context
 */
export async function deleteNestedContext(id: string): Promise<void> {
  const response = await fetch(`${AGENT_API_URL}/nested-context/${id}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const error = await response.json();
    throw new Error(error.detail || error.message || "Failed to delete nested context");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward Compatibility Functions (deprecated, use Context functions instead)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use listContexts instead */
export const listPlatforms = listContexts;
/** @deprecated Use listContextsWithNested instead */
export const listPlatformsWithProjects = listContextsWithNested;
/** @deprecated Use getContext instead */
export const getPlatform = getContext;
/** @deprecated Use getContextByHandle instead */
export const getPlatformByHandle = getContextByHandle;
/** @deprecated Use createContext instead */
export const createPlatform = createContext;
/** @deprecated Use updateContext instead */
export const updatePlatform = updateContext;
/** @deprecated Use deleteContext instead */
export const deletePlatform = deleteContext;

/** @deprecated Use listNestedContexts instead */
export const listProjects = listNestedContexts;
/** @deprecated Use listNestedContextsForContext instead */
export const listProjectsForPlatform = listNestedContextsForContext;
/** @deprecated Use getNestedContext instead */
export const getProject = getNestedContext;
/** @deprecated Use getNestedContextByHandle instead */
export const getProjectByHandle = getNestedContextByHandle;
/** @deprecated Use createNestedContext instead */
export const createProject = createNestedContext;
/** @deprecated Use updateNestedContext instead */
export const updateProject = updateNestedContext;
/** @deprecated Use deleteNestedContext instead */
export const deleteProject = deleteNestedContext;

// ─────────────────────────────────────────────────────────────────────────────
// Accessible Contexts (Owner + Any Permission via Code Redemption)
// ─────────────────────────────────────────────────────────────────────────────

export interface PermittedContextInfo {
  id: string;
  name: string;
  slug: string;
}

/**
 * Permission info for a context
 */
export interface ContextPermissions {
  isOwner: boolean;
  canEdit: boolean;   // Owner or has invite permission
  canDelete: boolean; // Only owner
}

/**
 * Accessible context info from backend
 */
export interface AccessibleContextInfo {
  id: string;
  name: string;
  slug: string;
  isOwner: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Fetch contexts where user has invite permission (via code redemption)
 * @deprecated Use fetchAccessibleContexts instead for full permission info
 */
export async function fetchPermittedContextIds(wallet: string): Promise<Set<string>> {
  try {
    const response = await fetch(
      `${AGENT_API_URL}/codes/permitted-contexts?wallet=${encodeURIComponent(wallet)}`
    );
    
    if (!response.ok) {
      console.error('Failed to fetch permitted contexts:', response.statusText);
      return new Set();
    }
    
    const data = await response.json();
    const contextIds = (data.contexts || []).map((ctx: PermittedContextInfo) => ctx.id);
    return new Set(contextIds);
  } catch (error) {
    console.error('Error fetching permitted contexts:', error);
    return new Set();
  }
}

/**
 * Fetch ALL accessible contexts with permission info
 * 
 * Returns contexts where user:
 * 1. Is the owner (createdBy === wallet) - can edit and delete
 * 2. Has redeemed a code with invite permission - can edit only
 * 3. Has redeemed a code without invite permission - view only
 */
export async function fetchAccessibleContexts(
  wallet: string
): Promise<Map<string, ContextPermissions>> {
  try {
    const response = await fetch(
      `${AGENT_API_URL}/codes/accessible-contexts?wallet=${encodeURIComponent(wallet)}`
    );
    
    if (!response.ok) {
      console.error('Failed to fetch accessible contexts:', response.statusText);
      return new Map();
    }
    
    const data = await response.json();
    const permissionsMap = new Map<string, ContextPermissions>();
    
    for (const ctx of (data.contexts || [])) {
      permissionsMap.set(ctx.id, {
        isOwner: ctx.isOwner,
        canEdit: ctx.canEdit,
        canDelete: ctx.canDelete,
      });
    }
    
    return permissionsMap;
  } catch (error) {
    console.error('Error fetching accessible contexts:', error);
    return new Map();
  }
}

/**
 * Get permissions for a specific context
 */
export async function getContextPermissions(
  wallet: string,
  contextId: string
): Promise<ContextPermissions | null> {
  const permissions = await fetchAccessibleContexts(wallet);
  return permissions.get(contextId) || null;
}

/**
 * List contexts accessible to a user (owner OR has ANY permission via code redemption)
 * 
 * A context is accessible if:
 * 1. User is the creator (createdBy === wallet), OR
 * 2. User has redeemed a code for this context (any permission level)
 */
export async function listAccessibleContextsWithNested(
  wallet: string
): Promise<ContextWithNested[]> {
  // Fetch all contexts (we'll filter them)
  const allContexts = await listContextsWithNested();
  
  // Get ALL accessible contexts (not just those with invite permission)
  const accessibleContextsMap = await fetchAccessibleContexts(wallet);
  
  // Filter to only accessible contexts
  const accessibleContexts = allContexts.filter((context) => {
    // Owner always has access
    if (context.createdBy === wallet) {
      return true;
    }
    // Has any access via code redemption
    if (accessibleContextsMap.has(context.id)) {
      return true;
    }
    return false;
  });
  
  return accessibleContexts;
}

/**
 * Extended context with permission info
 */
export interface ContextWithNestedAndPermissions extends ContextWithNested {
  permissions: ContextPermissions;
}

/**
 * List contexts accessible to a user with permission info included
 */
export async function listAccessibleContextsWithPermissions(
  wallet: string
): Promise<ContextWithNestedAndPermissions[]> {
  // Fetch all contexts
  const allContexts = await listContextsWithNested();
  
  // Get ALL accessible contexts with permissions
  const accessibleContextsMap = await fetchAccessibleContexts(wallet);
  
  // Filter and add permissions
  const accessibleContexts: ContextWithNestedAndPermissions[] = [];
  
  for (const context of allContexts) {
    const isOwner = context.createdBy === wallet;
    const apiPermissions = accessibleContextsMap.get(context.id);
    
    if (isOwner || apiPermissions) {
      accessibleContexts.push({
        ...context,
        permissions: apiPermissions || {
          isOwner: true,
          canEdit: true,
          canDelete: true,
        },
      });
    }
  }
  
  return accessibleContexts;
}