/**
 * Kinship Studio - Roles API
 * 
 * API client for managing context roles in kinship-agent.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerSummary {
  id: string
  name: string
  tools: string[]
}

export interface Role {
  id: string
  contextId: string
  workerIds: string[]
  name: string
  permissions: string[]
  wallet: string
  toolIds: string[]
  workers: WorkerSummary[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateRoleParams {
  contextId: string
  workerIds: string[]
  name: string
  permissions?: string[]
  wallet: string
  createdBy: string
}

export interface UpdateRoleParams {
  name?: string
  workerIds?: string[]
  permissions?: string[]
}

export interface RoleListResponse {
  roles: Role[]
  count: number
}

// Available permission types
export const VALID_PERMISSIONS = ['invite', 'manage', 'admin', 'edit', 'delete', 'view'] as const
export type PermissionType = typeof VALID_PERMISSIONS[number]

// ─────────────────────────────────────────────────────────────────────────────
// API Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CONTEXT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL 
  ? `${process.env.NEXT_PUBLIC_AGENT_API_URL}/api/v1`
  : 'http://192.168.1.30:8000/api/v1'

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Transform API response to Role
// ─────────────────────────────────────────────────────────────────────────────

function transformRole(r: any): Role {
  return {
    id: r.id,
    contextId: r.context_id,
    workerIds: r.worker_ids || [],
    name: r.name,
    permissions: r.permissions || [],
    wallet: r.wallet,
    toolIds: r.tool_ids || [],
    workers: (r.workers || []).map((w: any) => ({
      id: w.id,
      name: w.name,
      tools: w.tools || [],
    })),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all roles for a context
 */
export async function fetchRoles(contextId: string): Promise<Role[]> {
  try {
    const response = await fetch(`${CONTEXT_API_URL}/roles/context/${contextId}`)
    if (!response.ok) throw new Error('Failed to fetch roles')
    const data = await response.json()
    return (data.roles || []).map(transformRole)
  } catch (err) {
    console.error('Error fetching roles:', err)
    return []
  }
}

/**
 * Get a single role by ID
 */
export async function getRole(roleId: string): Promise<Role | null> {
  try {
    const response = await fetch(`${CONTEXT_API_URL}/roles/${roleId}`)
    if (!response.ok) return null
    const data = await response.json()
    return transformRole(data)
  } catch (err) {
    console.error('Error fetching role:', err)
    return null
  }
}

/**
 * Create a new role
 */
export async function createRole(params: CreateRoleParams): Promise<Role> {
  const response = await fetch(`${CONTEXT_API_URL}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextId: params.contextId,
      workerIds: params.workerIds,
      name: params.name,
      permissions: params.permissions || [],
      wallet: params.wallet,
      createdBy: params.createdBy,
    }),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to create role')
  }
  
  const data = await response.json()
  return transformRole(data)
}

/**
 * Update an existing role
 */
export async function updateRole(roleId: string, params: UpdateRoleParams): Promise<Role> {
  const body: Record<string, any> = {}
  if (params.name !== undefined) body.name = params.name
  if (params.workerIds !== undefined) body.workerIds = params.workerIds
  if (params.permissions !== undefined) body.permissions = params.permissions
  
  const response = await fetch(`${CONTEXT_API_URL}/roles/${roleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to update role')
  }
  
  const data = await response.json()
  return transformRole(data)
}

/**
 * Delete a role
 */
export async function deleteRole(roleId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONTEXT_API_URL}/roles/${roleId}`, {
      method: 'DELETE',
    })
    return response.ok || response.status === 204
  } catch (err) {
    console.error('Error deleting role:', err)
    return false
  }
}

/**
 * List all roles with optional filters
 */
export async function listRoles(params?: {
  contextId?: string
  wallet?: string
}): Promise<RoleListResponse> {
  try {
    const searchParams = new URLSearchParams()
    if (params?.contextId) searchParams.set('contextId', params.contextId)
    if (params?.wallet) searchParams.set('wallet', params.wallet)
    
    const url = searchParams.toString() 
      ? `${CONTEXT_API_URL}/roles?${searchParams}`
      : `${CONTEXT_API_URL}/roles`
    
    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to list roles')
    
    const data = await response.json()
    return {
      roles: (data.roles || []).map(transformRole),
      count: data.count || 0,
    }
  } catch (err) {
    console.error('Error listing roles:', err)
    return { roles: [], count: 0 }
  }
}