/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OAUTH UTILS - EXAMPLE USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This file shows how your worker agent can use the OAuth utilities to:
 * 1. Get a valid access token (auto-refreshes if expired)
 * 2. Make authenticated API calls
 * 3. Check token status
 * 
 * Import in your agent code:
 * import { getValidAccessToken, authenticatedFetch } from '@/lib/oauth-utils'
 */

import { 
  getValidAccessToken, 
  authenticatedFetch, 
  getTokenInfo,
  refreshAccessToken 
} from '@/lib/oauth-utils'

// ─── Example 1: Get Valid Access Token ──────────────────────────────────────
// This automatically refreshes if the token is expired

async function example1_GetAccessToken() {
  const agentId = 'your-agent-id'
  const toolName = 'google' // or 'linkedin', 'facebook'

  const accessToken = await getValidAccessToken(agentId, toolName)

  if (!accessToken) {
    console.log('No valid token - user needs to reconnect')
    return
  }

  // Use the token for API calls
  console.log('Got valid access token:', accessToken.slice(0, 20) + '...')
}

// ─── Example 2: Send Email via Gmail ────────────────────────────────────────

async function example2_SendGmail() {
  const agentId = 'your-agent-id'
  
  // Get valid token (auto-refreshes if expired)
  const accessToken = await getValidAccessToken(agentId, 'google')
  
  if (!accessToken) {
    throw new Error('Google not connected or token refresh failed')
  }

  // Send email using Gmail API
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: btoa('To: someone@example.com\r\nSubject: Hello\r\n\r\nHello from your agent!')
    })
  })

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status}`)
  }

  console.log('Email sent successfully!')
}

// ─── Example 3: Post to LinkedIn ────────────────────────────────────────────

async function example3_PostToLinkedIn() {
  const agentId = 'your-agent-id'

  // Use authenticatedFetch - handles token refresh automatically
  const response = await authenticatedFetch(
    agentId,
    'linkedin',
    'https://api.linkedin.com/v2/ugcPosts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: 'urn:li:person:YOUR_PERSON_ID',
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: 'Hello from my AI agent! 🤖'
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      })
    }
  )

  if (!response) {
    throw new Error('LinkedIn not connected or token refresh failed')
  }

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status}`)
  }

  console.log('Posted to LinkedIn successfully!')
}

// ─── Example 4: Read Google Calendar Events ─────────────────────────────────

async function example4_ReadCalendar() {
  const agentId = 'your-agent-id'

  const response = await authenticatedFetch(
    agentId,
    'google',
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10'
  )

  if (!response) {
    throw new Error('Google not connected')
  }

  const data = await response.json()
  
  console.log('Upcoming events:')
  data.items?.forEach((event: any) => {
    console.log(`- ${event.summary} at ${event.start?.dateTime || event.start?.date}`)
  })
}

// ─── Example 5: Check Token Status ──────────────────────────────────────────

async function example5_CheckTokenStatus() {
  const agentId = 'your-agent-id'
  const toolName = 'google'

  const tokenInfo = await getTokenInfo(agentId, toolName)

  if (!tokenInfo) {
    console.log('Not connected to Google')
    return
  }

  console.log('Token Status:')
  console.log('- Is Expired:', tokenInfo.isExpired)
  console.log('- Expires At:', tokenInfo.expiresAt ? new Date(tokenInfo.expiresAt) : 'Never')
  console.log('- Has Refresh Token:', !!tokenInfo.refreshToken)

  if (tokenInfo.isExpired && tokenInfo.refreshToken) {
    console.log('Token expired, refreshing...')
    const result = await refreshAccessToken(agentId, toolName)
    console.log('Refresh result:', result)
  }
}

// ─── Example 6: Post to Facebook Page ───────────────────────────────────────

async function example6_PostToFacebook() {
  const agentId = 'your-agent-id'
  const pageId = 'YOUR_PAGE_ID'

  const response = await authenticatedFetch(
    agentId,
    'facebook',
    `https://graph.facebook.com/v18.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Hello from my AI agent! 🤖'
      })
    }
  )

  if (!response) {
    throw new Error('Facebook not connected')
  }

  const data = await response.json()
  console.log('Posted to Facebook:', data.id)
}

// ─── Example 7: Using in API Route ──────────────────────────────────────────

/*
// In your API route (e.g., app/api/agent/[agentId]/post/route.ts):

import { NextRequest, NextResponse } from 'next/server'
import { authenticatedFetch } from '@/lib/oauth-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const { agentId } = params
  const { platform, message } = await request.json()

  try {
    let response: Response | null = null

    if (platform === 'linkedin') {
      response = await authenticatedFetch(agentId, 'linkedin', 'https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        body: JSON.stringify({ ... })
      })
    }

    if (!response || !response.ok) {
      return NextResponse.json({ error: 'Failed to post' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error posting' }, { status: 500 })
  }
}
*/

export {
  example1_GetAccessToken,
  example2_SendGmail,
  example3_PostToLinkedIn,
  example4_ReadCalendar,
  example5_CheckTokenStatus,
  example6_PostToFacebook,
}
