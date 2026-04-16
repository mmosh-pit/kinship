import { NextRequest, NextResponse } from 'next/server'

// OAuth configuration for each provider
const OAUTH_CONFIG: Record<string, {
  authUrl: string
  scopes: string[]
  extraParams?: Record<string, string>
}> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/auth',
    scopes: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
  },
  facebook: {
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    scopes: ['email', 'public_profile', 'pages_show_list', 'pages_manage_posts'],
  },
}

// GET /api/oauth/[provider] - Initiate OAuth flow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const platformId = searchParams.get('platformId')
    const popup = searchParams.get('popup') === 'true'

    // In popup mode, agentId is optional (tokens returned to parent window)
    // In normal mode, agentId is required (tokens saved directly to DB)
    if (!popup && !agentId) {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
    }

    const config = OAUTH_CONFIG[provider]
    if (!config) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
    }

    // Get client ID from environment
    const clientIdKey = `${provider.toUpperCase()}_CLIENT_ID`
    const clientId = process.env[clientIdKey]

    if (!clientId) {
      return NextResponse.json(
        { error: `OAuth not configured for ${provider}. Missing ${clientIdKey}` },
        { status: 500 }
      )
    }

    // Build callback URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`

    // Store state with agentId, platformId, and popup flag for callback
    const state = Buffer.from(JSON.stringify({ 
      agentId: agentId || undefined, 
      platformId: platformId || undefined,
      popup 
    })).toString('base64')

    // Build OAuth authorization URL
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      ...config.extraParams,
    })

    const authorizationUrl = `${config.authUrl}?${authParams.toString()}`

    // Redirect to OAuth provider
    return NextResponse.redirect(authorizationUrl)
  } catch (error) {
    console.error('OAuth initiation error:', error)
    return NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 })
  }
}
