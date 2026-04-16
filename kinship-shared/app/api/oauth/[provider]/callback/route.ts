import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/postgres'
import { nanoid } from 'nanoid'

const TOKEN_CONFIG: Record<string, {
  tokenUrl: string
  userInfoUrl?: string
}> = {
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  },
  linkedin: {
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
  },
  facebook: {
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email',
  },
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

    // Decode state
    let stateData: { agentId?: string; platformId?: string; popup?: boolean } = {}
    if (state) {
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString())
      } catch {
        // Invalid state
      }
    }

    const { agentId, platformId, popup } = stateData

    // Handle errors
    if (error) {
      if (popup) {
        return new NextResponse(getPopupErrorHtml(provider, 'OAuth authorization was denied'), {
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return NextResponse.redirect(`${baseUrl}/empower?error=oauth_denied&provider=${provider}`)
    }

    if (!code) {
      if (popup) {
        return new NextResponse(getPopupErrorHtml(provider, 'Missing authorization code'), {
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return NextResponse.redirect(`${baseUrl}/empower?error=missing_params`)
    }

    const config = TOKEN_CONFIG[provider]
    if (!config) {
      if (popup) {
        return new NextResponse(getPopupErrorHtml(provider, 'Unknown provider'), {
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return NextResponse.redirect(`${baseUrl}/empower?error=unknown_provider`)
    }

    // Get OAuth credentials
    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`]
    const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]

    if (!clientId || !clientSecret) {
      if (popup) {
        return new NextResponse(getPopupErrorHtml(provider, 'OAuth not configured'), {
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return NextResponse.redirect(`${baseUrl}/empower?error=oauth_not_configured`)
    }

    const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })

    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: tokenParams.toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error(`Token exchange failed for ${provider}:`, errorText)
      if (popup) {
        return new NextResponse(getPopupErrorHtml(provider, 'Failed to exchange token'), {
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return NextResponse.redirect(`${baseUrl}/empower?error=token_exchange_failed`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token

    // Get user info
    let userEmail = ''
    let userName = ''
    let externalUserId = ''

    if (config.userInfoUrl && accessToken) {
      try {
        const userInfoResponse = await fetch(config.userInfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json()
          userEmail = userInfo.email || ''
          userName = userInfo.name || userInfo.given_name || ''
          externalUserId = userInfo.id || userInfo.sub || ''
        }
      } catch (err) {
        console.error(`Failed to fetch user info for ${provider}:`, err)
      }
    }

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null

    // Build credentials to store
    const credentialsData = JSON.stringify({
      accessToken,
      refreshToken: refreshToken || '',
      expiresAt,
      email: userEmail,
      name: userName,
    })

    // ─── SAVE TO DATABASE (BOTH POPUP AND NORMAL MODE) ─────────────────────────
    // Save to tool_connections table (matches backend schema)
    if (agentId) {
      try {
        const now = new Date()

        // Fetch agent name for worker_agent_name field
        let workerAgentName = null
        const agentRow = await queryOne<any>(
          'SELECT name FROM agents WHERE id = $1',
          [agentId]
        )
        workerAgentName = agentRow?.name || null

        // Use email directly as external_handle (no @ prefix for emails)
        const externalHandle = userEmail || userName || null

        const existing = await queryOne(
          'SELECT id FROM tool_connections WHERE worker_id = $1 AND tool_name = $2',
          [agentId, provider]
        )

        if (existing) {
          await query(
            `UPDATE tool_connections 
             SET status = $1, 
                 credentials_encrypted = $2, 
                 worker_agent_name = $3,
                 external_user_id = $4,
                 external_handle = $5,
                 connected_at = $6
             WHERE worker_id = $7 AND tool_name = $8`,
            ['active', credentialsData, workerAgentName, externalUserId || null, externalHandle, now, agentId, provider]
          )
        } else {
          const id = `conn_${nanoid(12)}`
          await query(
            `INSERT INTO tool_connections 
             (id, worker_id, tool_name, credentials_encrypted, status, external_user_id, external_handle, worker_agent_name, connected_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, agentId, provider, credentialsData, 'active', externalUserId || null, externalHandle, workerAgentName, now]
          )
        }

        // Also update the agent's tools array
        const agentResult = await queryOne<any>(
          'SELECT tools FROM agents WHERE id = $1',
          [agentId]
        )
        const currentTools = agentResult?.tools || []
        if (!currentTools.includes(provider)) {
          await query(
            'UPDATE agents SET tools = $1, updated_at = $2 WHERE id = $3',
            [[...currentTools, provider], now, agentId]
          )
        }

        console.log(`[OAuth] Saved ${provider} connection for agent ${agentId}`)
      } catch (dbError) {
        console.error('[OAuth] Database error:', dbError)
        if (popup) {
          return new NextResponse(getPopupErrorHtml(provider, 'Failed to save connection'), {
            headers: { 'Content-Type': 'text/html' },
          })
        }
        return NextResponse.redirect(`${baseUrl}/empower?error=database_error`)
      }
    }

    // ─── RETURN RESPONSE ─────────────────────────────────────────────────────────
    if (popup) {
      const credentials = {
        accessToken,
        refreshToken: refreshToken || '',
        expiresAt,
        email: userEmail,
        name: userName,
      }
      return new NextResponse(getPopupSuccessHtml(provider, credentials, userEmail || userName), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return NextResponse.redirect(`${baseUrl}/empower?success=connected&provider=${provider}`)
  } catch (error) {
    console.error('OAuth callback error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    return NextResponse.redirect(`${baseUrl}/empower?error=callback_failed`)
  }
}

// HTML for popup success - sends tokens to parent and closes
function getPopupSuccessHtml(provider: string, credentials: object, displayName: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Connected!</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      height: 100vh; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white; 
    }
    .container { 
      text-align: center; 
      padding: 32px;
      max-width: 320px;
    }
    .success-icon {
      width: 64px;
      height: 64px;
      background: rgba(34, 197, 94, 0.15);
      border: 2px solid rgba(34, 197, 94, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      animation: scaleIn 0.3s ease-out;
    }
    .success-icon svg {
      width: 32px;
      height: 32px;
      color: #22c55e;
    }
    @keyframes scaleIn {
      from { transform: scale(0.5); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    h2 { 
      font-size: 20px; 
      font-weight: 600; 
      margin-bottom: 8px;
      color: #fff;
    }
    .account { 
      font-size: 14px; 
      color: rgba(255,255,255,0.7); 
      margin-bottom: 16px;
    }
    .status { 
      font-size: 13px; 
      color: rgba(255,255,255,0.5);
    }
    .dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: #22c55e;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 1s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h2>Connected!</h2>
    <p class="account">${displayName ? displayName.replace(/'/g, "\\'") : provider}</p>
    <p class="status"><span class="dot"></span>Closing window...</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'oauth_success',
        provider: '${provider}',
        credentials: ${JSON.stringify(credentials)},
        displayName: '${displayName.replace(/'/g, "\\'")}'
      }, '*');
    }
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`
}

// HTML for popup error
function getPopupErrorHtml(provider: string, errorMessage: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      height: 100vh; 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white; 
    }
    .container { 
      text-align: center; 
      padding: 32px;
      max-width: 320px;
    }
    .error-icon {
      width: 64px;
      height: 64px;
      background: rgba(239, 68, 68, 0.15);
      border: 2px solid rgba(239, 68, 68, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      animation: shake 0.4s ease-out;
    }
    .error-icon svg {
      width: 32px;
      height: 32px;
      color: #ef4444;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    h2 { 
      font-size: 20px; 
      font-weight: 600; 
      margin-bottom: 8px;
      color: #fff;
    }
    .message { 
      font-size: 14px; 
      color: rgba(255,255,255,0.7); 
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .status { 
      font-size: 13px; 
      color: rgba(255,255,255,0.5);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
    <h2>Connection Failed</h2>
    <p class="message">${errorMessage.replace(/'/g, "\\'")}</p>
    <p class="status">Closing window...</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'oauth_error',
        provider: '${provider}',
        error: '${errorMessage.replace(/'/g, "\\'")}'
      }, '*');
    }
    setTimeout(() => window.close(), 2500);
  </script>
</body>
</html>`
}
