import { NextRequest, NextResponse } from 'next/server'

// For server-side, we can use either AGENT_API_URL or NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL = process.env.AGENT_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'

// GET /api/agents - List all agents
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Build query params for backend
    const backendParams = new URLSearchParams()
    const wallet = searchParams.get('wallet')
    const platformId = searchParams.get('platformId')
    const type = searchParams.get('type')
    const includeWorkers = searchParams.get('includeWorkers')
    
    if (wallet) backendParams.set('wallet', wallet)
    if (platformId) backendParams.set('platformId', platformId)
    if (type) backendParams.set('type', type)
    if (includeWorkers) backendParams.set('includeWorkers', includeWorkers)
    
    const res = await fetch(`${AGENT_API_URL}/api/agents?${backendParams.toString()}`)
    
    if (!res.ok) {
      console.error('Backend agents list error:', res.status)
      return NextResponse.json({ agents: [] })
    }

    const data = await res.json()
    return NextResponse.json({ agents: data.agents || [] })
  } catch (error) {
    console.error('Error listing agents:', error)
    return NextResponse.json(
      { error: 'Failed to list agents' },
      { status: 500 }
    )
  }
}

// POST /api/agents - Create new agent (proxies to backend)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type } = body
    
    // Route to the appropriate backend endpoint
    const endpoint = type === 'presence' 
      ? `${AGENT_API_URL}/api/agents/presence`
      : `${AGENT_API_URL}/api/agents/worker`
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const error = await res.json()
      return NextResponse.json(
        { 
          error: error.detail || error.error || 'Failed to create agent',
          code: error.code 
        },
        { status: res.status }
      )
    }

    const agent = await res.json()
    return NextResponse.json({ agent }, { status: 201 })
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    )
  }
}
