import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/postgres'
import { nanoid } from 'nanoid'

/**
 * Agent Tools API Route
 * 
 * Handles non-OAuth tool connections (Telegram, Bluesky, X, Solana).
 * OAuth tools (Google, LinkedIn, Facebook) are handled entirely by the backend.
 * 
 * Reads from: tool_connections table (matches backend schema)
 */

export interface AgentToolConnection {
  id: string
  agentId: string
  toolName: string
  status: 'connected' | 'disconnected'
  connectedAs?: string
  workerAgentName?: string
  createdAt: string
  updatedAt: string
}

// GET /api/agent-tools - List agent-tool connections
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId') || undefined
    const debug = searchParams.get('debug') === 'true'

    console.log('[agent-tools GET] agentId:', agentId)

    // Debug: First check ALL rows in tool_connections
    if (debug) {
      const allRows = await query('SELECT id, worker_id, tool_name, status, external_handle FROM tool_connections LIMIT 20')
      console.log('[agent-tools DEBUG] All rows in tool_connections:', JSON.stringify(allRows, null, 2))
    }

    // Query from tool_connections table (matches backend schema)
    let sql = 'SELECT * FROM tool_connections WHERE status = $1'
    const params: any[] = ['active']
    let paramIdx = 2

    if (agentId) {
      sql += ` AND worker_id = $${paramIdx}`
      params.push(agentId)
      paramIdx++
    }

    console.log('[agent-tools GET] SQL:', sql)
    console.log('[agent-tools GET] Params:', params)

    const connections = await query(sql, params)

    console.log('[agent-tools GET] Found', connections.length, 'connections')
    console.log('[agent-tools GET] Raw connections:', JSON.stringify(connections, null, 2))

    // Format response
    const formatted = connections.map((c: any) => {
      // Parse credentials JSON if stored as string
      let creds = c.credentials_encrypted
      if (typeof creds === 'string') {
        try {
          creds = JSON.parse(creds)
        } catch {
          creds = {}
        }
      }
      creds = creds || {}

      // Use external_handle from DB, or derive from credentials
      let connectedAs = c.external_handle || ''
      
      if (!connectedAs) {
        if (c.tool_name === 'telegram') {
          connectedAs = creds.botUsername ? `@${creds.botUsername}` : (creds.botToken ? 'Bot connected' : '')
        } else if (c.tool_name === 'bluesky') {
          connectedAs = creds.handle ? `@${creds.handle}` : ''
        } else if (c.tool_name === 'x') {
          connectedAs = creds.username ? `@${creds.username}` : ''
        } else if (c.tool_name === 'solana') {
          connectedAs = creds.walletAddress ? `${creds.walletAddress.slice(0, 4)}…${creds.walletAddress.slice(-4)}` : ''
        } else if (c.tool_name === 'google' || c.tool_name === 'linkedin' || c.tool_name === 'facebook') {
          connectedAs = creds.email || creds.name || 'Connected'
        } else {
          connectedAs = creds.connectedAs || creds.email || creds.name || ''
        }
      }

      return {
        id: c.id,
        agentId: c.worker_id,
        toolName: c.tool_name,
        status: c.status === 'active' ? 'connected' : c.status,
        connectedAs,
        workerAgentName: c.worker_agent_name,
        createdAt: c.connected_at,
        updatedAt: c.connected_at,
      }
    })

    console.log('[agent-tools GET] Returning', formatted.length, 'formatted connections')

    return NextResponse.json({ connections: formatted })
  } catch (error) {
    console.error('[agent-tools GET] Error:', error)
    return NextResponse.json({ connections: [], error: String(error) })
  }
}

// POST /api/agent-tools - Connect or disconnect non-OAuth tools
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, toolName, action, connectedAs, credentials } = body

    console.log('[agent-tools POST] Request:', { agentId, toolName, action })

    if (!agentId || !toolName) {
      return NextResponse.json(
        { error: 'agentId and toolName are required' },
        { status: 400 }
      )
    }

    // Check agent exists and is a worker
    const agent = await queryOne<any>(
      'SELECT id, type, name FROM agents WHERE id = $1',
      [agentId]
    )

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.type?.toUpperCase() !== 'WORKER') {
      return NextResponse.json(
        { error: 'Only Worker agents can connect to tools.', code: 'WORKER_ONLY' },
        { status: 403 }
      )
    }

    const workerAgentName = agent.name
    const now = new Date()

    // ─── DISCONNECT ──────────────────────────────────────────────────────────────
    if (action === 'disconnect') {
      await query(
        `UPDATE tool_connections SET status = 'disconnected' WHERE worker_id = $1 AND tool_name = $2`,
        [agentId, toolName]
      )
      
      // Remove from agent's tools array
      try {
        const agentResult = await queryOne<any>('SELECT tools FROM agents WHERE id = $1', [agentId])
        const currentTools = agentResult?.tools || []
        if (currentTools.includes(toolName)) {
          await query(
            'UPDATE agents SET tools = $1, updated_at = $2 WHERE id = $3',
            [currentTools.filter((t: string) => t !== toolName), now, agentId]
          )
        }
      } catch (err) {
        console.error('Failed to update agent tools array:', err)
      }
      
      return NextResponse.json({ success: true, deleted: true })
    }

    // ─── CONNECT (non-OAuth tools only) ──────────────────────────────────────────
    if (action === 'connect') {
      
      // Telegram Bot
      if (toolName === 'telegram') {
        const botToken = credentials?.token
        if (!botToken) {
          return NextResponse.json({ error: 'Bot token is required' }, { status: 400 })
        }

        const botTokenRegex = /^\d+:[A-Za-z0-9_-]+$/
        if (!botTokenRegex.test(botToken)) {
          return NextResponse.json({ error: 'Invalid bot token format' }, { status: 400 })
        }

        try {
          const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
          if (!telegramResponse.ok) {
            return NextResponse.json({ error: 'Invalid Telegram bot token' }, { status: 400 })
          }
          const telegramResult = await telegramResponse.json()
          if (!telegramResult.ok) {
            return NextResponse.json({ error: telegramResult.description || 'Telegram API error' }, { status: 400 })
          }

          const credentialsData = JSON.stringify({
            botToken,
            botUsername: telegramResult.result.username,
            botId: telegramResult.result.id,
            botName: telegramResult.result.first_name,
          })
          const externalHandle = `@${telegramResult.result.username}`
          
          await upsertConnection(agentId, toolName, credentialsData, workerAgentName, telegramResult.result.id.toString(), externalHandle, now)

          return NextResponse.json({
            success: true,
            connection: { agentId, toolName, status: 'connected', connectedAs: externalHandle, workerAgentName },
          })
        } catch (err) {
          console.error('Telegram validation error:', err)
          return NextResponse.json({ error: 'Failed to validate Telegram bot token' }, { status: 400 })
        }
      }

      // Bluesky
      if (toolName === 'bluesky') {
        const handle = credentials?.username
        const password = credentials?.password
        if (!handle || !password) {
          return NextResponse.json({ error: 'Handle and app password are required' }, { status: 400 })
        }

        try {
          const bskyResponse = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: handle, password }),
          })
          if (!bskyResponse.ok) {
            const errorData = await bskyResponse.json().catch(() => ({}))
            return NextResponse.json({ error: errorData.message || 'Invalid Bluesky credentials' }, { status: 400 })
          }
          const bskyResult = await bskyResponse.json()

          const credentialsData = JSON.stringify({
            handle: bskyResult.handle,
            did: bskyResult.did,
            accessJwt: bskyResult.accessJwt,
            refreshJwt: bskyResult.refreshJwt,
          })
          const externalHandle = `@${bskyResult.handle}`
          
          await upsertConnection(agentId, toolName, credentialsData, workerAgentName, bskyResult.did, externalHandle, now)

          return NextResponse.json({
            success: true,
            connection: { agentId, toolName, status: 'connected', connectedAs: externalHandle, workerAgentName },
          })
        } catch (err) {
          console.error('Bluesky validation error:', err)
          return NextResponse.json({ error: 'Failed to validate Bluesky credentials' }, { status: 400 })
        }
      }

      // X (Twitter)
      if (toolName === 'x') {
        const username = credentials?.username
        const password = credentials?.password
        if (!username || !password) {
          return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
        }

        const credentialsData = JSON.stringify({ username, password })
        const externalHandle = `@${username}`
        await upsertConnection(agentId, toolName, credentialsData, workerAgentName, null, externalHandle, now)

        return NextResponse.json({
          success: true,
          connection: { agentId, toolName, status: 'connected', connectedAs: externalHandle, workerAgentName },
        })
      }

      // Solana Wallet
      if (toolName === 'solana') {
        const walletAddress = credentials?.walletAddress
        if (!walletAddress) {
          return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
        }
        if (walletAddress.length < 32 || walletAddress.length > 44 || !/^[A-Za-z0-9]+$/.test(walletAddress)) {
          return NextResponse.json({ error: 'Invalid Solana wallet address' }, { status: 400 })
        }

        const credentialsData = JSON.stringify({ walletAddress })
        const externalHandle = `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
        await upsertConnection(agentId, toolName, credentialsData, workerAgentName, walletAddress, externalHandle, now)

        return NextResponse.json({
          success: true,
          connection: { agentId, toolName, status: 'connected', connectedAs: externalHandle, workerAgentName },
        })
      }

      // OAuth tools should NOT be handled here - they go through backend
      if (['google', 'linkedin', 'facebook'].includes(toolName)) {
        return NextResponse.json(
          { error: 'OAuth tools must be connected through the backend OAuth flow' },
          { status: 400 }
        )
      }

      // Default (generic)
      const credentialsData = JSON.stringify({ ...credentials, connectedAs: connectedAs || '' })
      await upsertConnection(agentId, toolName, credentialsData, workerAgentName, null, connectedAs, now)

      return NextResponse.json({
        success: true,
        connection: { agentId, toolName, status: 'connected', connectedAs, workerAgentName },
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use: connect or disconnect' }, { status: 400 })
  } catch (error) {
    console.error('Error managing agent-tool connection:', error)
    return NextResponse.json({ error: 'Failed to manage connection' }, { status: 500 })
  }
}

// Helper to upsert connection
async function upsertConnection(
  agentId: string,
  toolName: string,
  credentials: string,
  workerAgentName: string | null,
  externalUserId: string | null,
  externalHandle: string | null,
  now: Date
) {
  const existing = await queryOne(
    'SELECT id FROM tool_connections WHERE worker_id = $1 AND tool_name = $2',
    [agentId, toolName]
  )

  if (existing) {
    await query(
      `UPDATE tool_connections 
       SET status = $1, credentials_encrypted = $2, worker_agent_name = $3,
           external_user_id = $4, external_handle = $5, connected_at = $6
       WHERE worker_id = $7 AND tool_name = $8`,
      ['active', credentials, workerAgentName, externalUserId, externalHandle, now, agentId, toolName]
    )
  } else {
    const id = `conn_${nanoid(12)}`
    await query(
      `INSERT INTO tool_connections 
       (id, worker_id, tool_name, credentials_encrypted, status, external_user_id, external_handle, worker_agent_name, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, agentId, toolName, credentials, 'active', externalUserId, externalHandle, workerAgentName, now]
    )
  }
  
  // Update agent's tools array
  try {
    const agentResult = await queryOne<any>('SELECT tools FROM agents WHERE id = $1', [agentId])
    const currentTools = agentResult?.tools || []
    if (!currentTools.includes(toolName)) {
      await query(
        'UPDATE agents SET tools = $1, updated_at = $2 WHERE id = $3',
        [[...currentTools, toolName], now, agentId]
      )
    }
  } catch (err) {
    console.error('Failed to update agent tools array:', err)
  }
}
