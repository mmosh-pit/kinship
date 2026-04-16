import { NextRequest, NextResponse } from 'next/server'
import { refreshAccessToken, getTokenInfo, isTokenExpired } from '@/lib/oauth-utils'

// POST /api/agent-tools/refresh - Refresh an expired token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, toolName } = body

    if (!agentId || !toolName) {
      return NextResponse.json(
        { error: 'agentId and toolName are required' },
        { status: 400 }
      )
    }

    // Check current token status
    const tokenInfo = await getTokenInfo(agentId, toolName)

    if (!tokenInfo) {
      return NextResponse.json(
        { error: 'No connection found for this agent and tool' },
        { status: 404 }
      )
    }

    // If token is not expired, no need to refresh
    if (!tokenInfo.isExpired) {
      return NextResponse.json({
        success: true,
        message: 'Token is still valid',
        expiresAt: tokenInfo.expiresAt,
        needsRefresh: false,
      })
    }

    // Check if we have a refresh token
    if (!tokenInfo.refreshToken) {
      return NextResponse.json({
        success: false,
        error: 'No refresh token available. User needs to reconnect.',
        needsReconnect: true,
      }, { status: 400 })
    }

    // Refresh the token
    const result = await refreshAccessToken(agentId, toolName)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Token refreshed successfully',
        expiresAt: result.expiresAt,
        needsRefresh: false,
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
        needsReconnect: true,
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Error refreshing token:', error)
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 500 }
    )
  }
}

// GET /api/agent-tools/refresh - Check token status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const toolName = searchParams.get('toolName')

    if (!agentId || !toolName) {
      return NextResponse.json(
        { error: 'agentId and toolName are required' },
        { status: 400 }
      )
    }

    const tokenInfo = await getTokenInfo(agentId, toolName)

    if (!tokenInfo) {
      return NextResponse.json({
        connected: false,
        error: 'No connection found',
      })
    }

    return NextResponse.json({
      connected: true,
      isExpired: tokenInfo.isExpired,
      expiresAt: tokenInfo.expiresAt,
      hasRefreshToken: !!tokenInfo.refreshToken,
      needsReconnect: tokenInfo.isExpired && !tokenInfo.refreshToken,
    })
  } catch (error) {
    console.error('Error checking token status:', error)
    return NextResponse.json(
      { error: 'Failed to check token status' },
      { status: 500 }
    )
  }
}
