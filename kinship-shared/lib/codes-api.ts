/**
 * Kinship Studio - Codes API
 *
 * API client for managing access codes in kinship-agent.
 * Handles field transformations between frontend and backend.
 */

import type {
  AccessCode,
  AccessType,
  CodeStatus,
  CodeRole,
  CreateCodePayload,
  UpdateCodePayload,
  CodeFilters,
  ValidateCodeResponse,
  RedeemCodeResponse,
  CodeListResponse,
  AccessSource,
  AccessibleCode,
  AccessibleCodesResponse,
  PermittedContext,
  PermittedContextsResponse,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// API Configuration
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL
  ? `${process.env.NEXT_PUBLIC_AGENT_API_URL}/api/v1`
  : 'http://localhost:8000/api/v1'

// ─────────────────────────────────────────────────────────────────────────────
// Field Transformation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform backend response to frontend AccessCode
 * - accessType: 'context' → 'ecosystem'
 * - expiryDate → expiresAt
 * - creatorWallet → createdBy
 */
function transformCodeFromBackend(data: Record<string, unknown>): AccessCode {
  // Map backend 'context' to frontend 'ecosystem'
  let accessType: AccessType = data.accessType as AccessType
  if (accessType === ('context' as AccessType)) {
    accessType = 'ecosystem'
  }

  return {
    id: data.id as string,
    code: data.code as string,
    accessType,
    contextId: data.contextId as string,
    gatheringId: (data.gatheringId as string) || null,
    scopeId: (data.scopeId as string) || null,
    role: data.role as CodeRole,
    price: (data.price as number) || null,
    discount: (data.discount as number) || null,
    // Map expiryDate → expiresAt
    expiresAt: (data.expiryDate as string) || null,
    maxUses: (data.maxUses as number) || null,
    currentUses: (data.currentUses as number) || 0,
    isActive: data.isActive as boolean,
    status: data.status as CodeStatus,
    // Map creatorWallet → createdBy
    createdBy: data.creatorWallet as string,
    createdAt: data.createdAt as string,
    updatedAt: data.updatedAt as string,
    // Related entities
    context: data.context as AccessCode['context'],
    gathering: data.gathering as AccessCode['gathering'],
    scope: data.scope as AccessCode['scope'],
  }
}

/**
 * Transform frontend payload to backend format
 * - accessType: 'ecosystem' → 'context'
 * - expiresAt → expiryDate
 * - createdBy → creatorWallet
 */
function transformCodeToBackend(
  payload: CreateCodePayload
): Record<string, unknown> {
  // Map frontend 'ecosystem' to backend 'context'
  let accessType: string = payload.accessType || 'ecosystem'
  if (accessType === 'ecosystem') {
    accessType = 'context'
  }

  return {
    accessType,
    contextId: payload.contextId,
    gatheringId: payload.gatheringId || null,
    scopeId: payload.scopeId || null,
    role: payload.role || 'member',
    price: payload.price || null,
    discount: payload.discount || null,
    // Map expiresAt → expiryDate
    expiryDate: payload.expiresAt || null,
    // Default maxUses to null (unlimited)
    maxUses: payload.maxUses ?? null,
    // Map createdBy → creatorWallet
    creatorWallet: payload.creatorWallet,
  }
}

/**
 * Transform update payload to backend format
 */
function transformUpdateToBackend(
  payload: UpdateCodePayload
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  if (payload.gatheringId !== undefined) result.gatheringId = payload.gatheringId
  if (payload.scopeId !== undefined) result.scopeId = payload.scopeId
  if (payload.role !== undefined) result.role = payload.role
  if (payload.price !== undefined) result.price = payload.price
  if (payload.discount !== undefined) result.discount = payload.discount
  if (payload.expiresAt !== undefined) result.expiryDate = payload.expiresAt
  if (payload.maxUses !== undefined) result.maxUses = payload.maxUses
  if (payload.status !== undefined) result.status = payload.status

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all codes with optional filters and pagination
 */
export async function fetchCodes(filters?: CodeFilters): Promise<CodeListResponse> {
  try {
    const params = new URLSearchParams()

    if (filters?.contextId) params.append('contextId', filters.contextId)
    if (filters?.gatheringId) params.append('gatheringId', filters.gatheringId)
    if (filters?.accessType) {
      // Map ecosystem → context for backend
      const backendType = filters.accessType === 'ecosystem' ? 'context' : filters.accessType
      params.append('accessType', backendType)
    }
    if (filters?.role) params.append('role', filters.role)
    if (filters?.status) params.append('status', filters.status)
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive))
    if (filters?.creatorWallet) params.append('creatorWallet', filters.creatorWallet)
    if (filters?.page) params.append('page', String(filters.page))
    if (filters?.limit) params.append('limit', String(filters.limit))

    const url = params.toString() ? `${API_URL}/codes?${params}` : `${API_URL}/codes`
    const response = await fetch(url)

    if (!response.ok) throw new Error('Failed to fetch codes')

    const data = await response.json()
    return {
      codes: (data.codes || []).map(transformCodeFromBackend),
      count: data.count || 0,
      total: data.total || 0,
      page: data.page || 1,
      limit: data.limit || 10,
      totalPages: data.totalPages || 0,
    }
  } catch (err) {
    console.error('Error fetching codes:', err)
    return {
      codes: [],
      count: 0,
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    }
  }
}

/**
 * Fetch codes by context ID
 */
export async function fetchCodesByContext(contextId: string): Promise<AccessCode[]> {
  try {
    const response = await fetch(`${API_URL}/codes/context/${contextId}`)
    if (!response.ok) throw new Error('Failed to fetch codes by context')

    const data = await response.json()
    return (data.codes || []).map(transformCodeFromBackend)
  } catch (err) {
    console.error('Error fetching codes by context:', err)
    return []
  }
}

/**
 * Get a single code by ID
 */
export async function getCode(codeId: string): Promise<AccessCode | null> {
  try {
    const response = await fetch(`${API_URL}/codes/${codeId}`)
    if (!response.ok) return null

    const data = await response.json()
    return transformCodeFromBackend(data)
  } catch (err) {
    console.error('Error fetching code:', err)
    return null
  }
}

/**
 * Create a new access code
 */
export async function createCode(payload: CreateCodePayload): Promise<AccessCode> {
  const backendPayload = transformCodeToBackend(payload)

  const response = await fetch(`${API_URL}/codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backendPayload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to create code')
  }

  const data = await response.json()
  return transformCodeFromBackend(data)
}

/**
 * Update an existing code
 */
export async function updateCode(
  codeId: string,
  payload: UpdateCodePayload
): Promise<AccessCode> {
  const backendPayload = transformUpdateToBackend(payload)

  const response = await fetch(`${API_URL}/codes/${codeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backendPayload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to update code')
  }

  const data = await response.json()
  return transformCodeFromBackend(data)
}

/**
 * Delete a code
 */
export async function deleteCode(codeId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/codes/${codeId}`, {
      method: 'DELETE',
    })
    return response.ok || response.status === 204
  } catch (err) {
    console.error('Error deleting code:', err)
    return false
  }
}

/**
 * Toggle code active status
 */
export async function toggleCode(
  codeId: string,
  isActive: boolean
): Promise<AccessCode> {
  const url = `${API_URL}/codes/${codeId}/toggle`
  console.log('Toggle code API call:', { url, codeId, isActive })
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  })

  console.log('Toggle code response:', response.status, response.statusText)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    console.error('Toggle code error:', error)
    throw new Error(error.detail || 'Failed to toggle code')
  }

  const data = await response.json()
  console.log('Toggle code data:', data)
  return transformCodeFromBackend(data)
}

/**
 * Validate a code string (public endpoint)
 */
export async function validateCode(codeString: string): Promise<ValidateCodeResponse> {
  const response = await fetch(`${API_URL}/codes/validate/${codeString}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to validate code')
  }

  const data = await response.json()

  // Transform accessType in response
  if (data.accessType === 'context') {
    data.accessType = 'ecosystem'
  }

  return data as ValidateCodeResponse
}

/**
 * Redeem a code
 */
export async function redeemCode(
  codeId: string,
  wallet: string
): Promise<RedeemCodeResponse> {
  const response = await fetch(`${API_URL}/codes/${codeId}/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to redeem code')
  }

  const data = await response.json()

  // Transform accessType in response
  if (data.accessType === 'context') {
    data.accessType = 'ecosystem'
  }

  return data as RedeemCodeResponse
}

/**
 * Send invite response type
 */
export interface SendInviteResponse {
  success: boolean
  message: string
  code: string
  recipientEmail: string
  recipientName: string
}

/**
 * Send an invitation email for a code
 */
export async function sendInvite(
  codeId: string,
  recipientName: string,
  recipientEmail: string,
  personalMessage?: string
): Promise<SendInviteResponse> {
  const response = await fetch(`${API_URL}/codes/${codeId}/send-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientName,
      recipientEmail,
      personalMessage: personalMessage || null,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to send invite')
  }

  return await response.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// Code Redemptions (Transaction History)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redemption member info
 */
export interface CodeRedemptionMember {
  id: string
  wallet: string
  role: string
  redeemedAt: string
  codeString: string
}

/**
 * Code redemptions response
 */
export interface CodeRedemptionsResponse {
  members: CodeRedemptionMember[]
  count: number
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * Fetch redemptions (joined members) for a specific code
 *
 * @param codeId - The code ID
 * @param page - Page number (default: 1)
 * @param limit - Items per page (default: 20)
 */
export async function fetchCodeRedemptions(
  codeId: string,
  page = 1,
  limit = 20
): Promise<CodeRedemptionsResponse> {
  try {
    const params = new URLSearchParams()
    params.append('page', String(page))
    params.append('limit', String(limit))

    const response = await fetch(`${API_URL}/codes/${codeId}/redemptions?${params}`)

    if (!response.ok) {
      if (response.status === 404) {
        return { members: [], count: 0, total: 0, page: 1, limit, totalPages: 0 }
      }
      throw new Error('Failed to fetch code redemptions')
    }

    return await response.json()
  } catch (err) {
    console.error('Error fetching code redemptions:', err)
    return { members: [], count: 0, total: 0, page: 1, limit, totalPages: 0 }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessible Codes API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform backend accessible code response to frontend AccessibleCode
 */
function transformAccessibleCodeFromBackend(data: Record<string, unknown>): AccessibleCode {
  // Get base code fields
  const baseCode = transformCodeFromBackend(data)

  return {
    ...baseCode,
    accessSource: data.accessSource as AccessSource,
    contextName: (data.contextName as string) || undefined,
    roleName: (data.roleName as string) || undefined,
    hasInvitePermission: (data.hasInvitePermission as boolean) ?? true,
  }
}

/**
 * Fetch codes accessible to the user (own + permission-based)
 *
 * @param wallet - User's wallet address
 * @param contextId - Optional context filter
 * @param limit - Maximum results (default: 50)
 * @param offset - Pagination offset (default: 0)
 */
export async function fetchAccessibleCodes(
  wallet: string,
  contextId?: string,
  limit = 50,
  offset = 0
): Promise<AccessibleCodesResponse> {
  try {
    const params = new URLSearchParams()
    params.append('wallet', wallet)
    if (contextId) params.append('contextId', contextId)
    params.append('limit', String(limit))
    params.append('offset', String(offset))

    const response = await fetch(`${API_URL}/codes/accessible?${params}`)

    if (!response.ok) throw new Error('Failed to fetch accessible codes')

    const data = await response.json()
    return {
      codes: (data.codes || []).map(transformAccessibleCodeFromBackend),
      total: data.total || 0,
      ownCount: data.ownCount || 0,
      permittedCount: data.permittedCount || 0,
    }
  } catch (err) {
    console.error('Error fetching accessible codes:', err)
    return {
      codes: [],
      total: 0,
      ownCount: 0,
      permittedCount: 0,
    }
  }
}

/**
 * Fetch contexts where user has invite permission
 *
 * Used to populate the context dropdown when creating new codes.
 *
 * @param wallet - User's wallet address
 */
export async function fetchPermittedContexts(
  wallet: string
): Promise<PermittedContextsResponse> {
  try {
    const params = new URLSearchParams()
    params.append('wallet', wallet)

    const response = await fetch(`${API_URL}/codes/permitted-contexts?${params}`)

    if (!response.ok) throw new Error('Failed to fetch permitted contexts')

    const data = await response.json()
    return {
      contexts: data.contexts || [],
      total: data.total || 0,
    }
  } catch (err) {
    console.error('Error fetching permitted contexts:', err)
    return {
      contexts: [],
      total: 0,
    }
  }
}