import { query, queryOne } from '@/lib/postgres'

// Token refresh endpoints for each provider
const REFRESH_CONFIG: Record<string, {
  tokenUrl: string
  clientIdEnv: string
  clientSecretEnv: string
}> = {
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  },
  linkedin: {
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
  },
  facebook: {
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    clientIdEnv: 'FACEBOOK_CLIENT_ID',
    clientSecretEnv: 'FACEBOOK_CLIENT_SECRET',
  },
}

export interface TokenInfo {
  accessToken: string
  refreshToken: string
  expiresAt: number | null
  isExpired: boolean
}

export interface RefreshResult {
  success: boolean
  accessToken?: string
  expiresAt?: number
  error?: string
}

/**
 * Check if a token is expired (with 5 minute buffer)
 */
export function isTokenExpired(expiresAt: number | null): boolean {
  if (!expiresAt) return false // No expiry set, assume valid
  const bufferMs = 5 * 60 * 1000 // 5 minutes buffer
  return Date.now() >= expiresAt - bufferMs
}

/**
 * Get token info for an agent's tool connection
 */
export async function getTokenInfo(agentId: string, toolName: string): Promise<TokenInfo | null> {
  try {
    const connection = await queryOne<any>(
      'SELECT credentials FROM agent_tools WHERE agent_id = $1 AND tool_name = $2',
      [agentId, toolName]
    )

    if (!connection) {
      return null
    }

    // Parse credentials JSON
    let creds = connection.credentials
    if (typeof creds === 'string') {
      try {
        creds = JSON.parse(creds)
      } catch {
        creds = {}
      }
    }
    creds = creds || {}

    if (!creds.accessToken) {
      return null
    }

    return {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken || '',
      expiresAt: creds.expiresAt,
      isExpired: isTokenExpired(creds.expiresAt),
    }
  } catch (error) {
    console.error('Error getting token info:', error)
    return null
  }
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(agentId: string, toolName: string): Promise<RefreshResult> {
  try {
    const connection = await queryOne<any>(
      'SELECT credentials FROM agent_tools WHERE agent_id = $1 AND tool_name = $2',
      [agentId, toolName]
    )

    if (!connection) {
      return { success: false, error: 'Connection not found' }
    }

    // Parse credentials JSON
    let creds = connection.credentials
    if (typeof creds === 'string') {
      try {
        creds = JSON.parse(creds)
      } catch {
        creds = {}
      }
    }
    creds = creds || {}

    if (!creds.refreshToken) {
      return { success: false, error: 'No refresh token available' }
    }

    const config = REFRESH_CONFIG[toolName]
    if (!config) {
      return { success: false, error: `Refresh not supported for ${toolName}` }
    }

    const clientId = process.env[config.clientIdEnv]
    const clientSecret = process.env[config.clientSecretEnv]

    if (!clientId || !clientSecret) {
      return { success: false, error: 'OAuth credentials not configured' }
    }

    // Request new access token using refresh token
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    })

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: tokenParams.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Token refresh failed for ${toolName}:`, errorText)
      return { success: false, error: 'Token refresh failed' }
    }

    const tokenData = await response.json()
    const newAccessToken = tokenData.access_token
    const newRefreshToken = tokenData.refresh_token // Some providers rotate refresh tokens
    const expiresIn = tokenData.expires_in
    const newExpiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null

    // Update credentials
    const updatedCreds = {
      ...creds,
      accessToken: newAccessToken,
      expiresAt: newExpiresAt,
    }

    // If provider returned a new refresh token, update it
    if (newRefreshToken) {
      updatedCreds.refreshToken = newRefreshToken
    }

    // Update the connection in database
    await query(
      `UPDATE agent_tools 
       SET credentials = $1, updated_at = $2
       WHERE agent_id = $3 AND tool_name = $4`,
      [JSON.stringify(updatedCreds), new Date().toISOString(), agentId, toolName]
    )

    return {
      success: true,
      accessToken: newAccessToken,
      expiresAt: newExpiresAt || undefined,
    }
  } catch (error) {
    console.error('Error refreshing token:', error)
    return { success: false, error: 'Token refresh error' }
  }
}

/**
 * Get a valid access token, refreshing if necessary
 * This is the main function your agent should use
 */
export async function getValidAccessToken(agentId: string, toolName: string): Promise<string | null> {
  try {
    const tokenInfo = await getTokenInfo(agentId, toolName)

    if (!tokenInfo) {
      console.log(`No token found for agent ${agentId}, tool ${toolName}`)
      return null
    }

    // If token is not expired, return it
    if (!tokenInfo.isExpired) {
      return tokenInfo.accessToken
    }

    // Token is expired, try to refresh
    console.log(`Token expired for agent ${agentId}, tool ${toolName}. Refreshing...`)

    if (!tokenInfo.refreshToken) {
      console.log('No refresh token available, user needs to reconnect')
      return null
    }

    const refreshResult = await refreshAccessToken(agentId, toolName)

    if (refreshResult.success && refreshResult.accessToken) {
      console.log(`Token refreshed successfully for agent ${agentId}, tool ${toolName}`)
      return refreshResult.accessToken
    }

    console.error('Token refresh failed:', refreshResult.error)
    return null
  } catch (error) {
    console.error('Error getting valid access token:', error)
    return null
  }
}

/**
 * Make an authenticated API call with automatic token refresh
 */
export async function authenticatedFetch(
  agentId: string,
  toolName: string,
  url: string,
  options: RequestInit = {}
): Promise<Response | null> {
  const accessToken = await getValidAccessToken(agentId, toolName)

  if (!accessToken) {
    console.error('No valid access token available')
    return null
  }

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)

  return fetch(url, {
    ...options,
    headers,
  })
}
