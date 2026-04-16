import { NextRequest, NextResponse } from 'next/server'

// For server-side, we can use either AGENT_API_URL or NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL = process.env.AGENT_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'

// GET /api/agents/[id] - Get single agent
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const url = `${AGENT_API_URL}/api/agents/${id}`
    
    console.log(`[agents/${id}] Fetching from: ${url}`)
    
    const res = await fetch(url)
    
    console.log(`[agents/${id}] Backend response status: ${res.status}`)
    
    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Agent not found' },
          { status: 404 }
        )
      }
      const errorText = await res.text()
      console.error(`[agents/${id}] Backend error: ${errorText}`)
      throw new Error(`Backend returned ${res.status}: ${errorText}`)
    }

    const agent = await res.json()
    console.log(`[agents/${id}] Successfully fetched agent: ${agent.name}`)
    return NextResponse.json({ agent })
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PUT /api/agents/[id] - Update agent
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    
    console.log(`[agents/${id}] Updating with:`, JSON.stringify(body).slice(0, 200))
    
    const res = await fetch(`${AGENT_API_URL}/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    if (!res.ok) {
      const error = await res.json()
      console.error(`[agents/${id}] Update error:`, error)
      return NextResponse.json(
        { error: error.detail || error.error || 'Failed to update agent' },
        { status: res.status }
      )
    }

    const agent = await res.json()
    return NextResponse.json({ agent })
  } catch (error) {
    console.error('Error updating agent:', error)
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    )
  }
}

// DELETE /api/agents/[id] - Delete agent
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    
    const res = await fetch(`${AGENT_API_URL}/api/agents/${id}`, {
      method: 'DELETE',
    })
    
    if (!res.ok && res.status !== 204) {
      const error = await res.json()
      return NextResponse.json(
        { error: error.detail || error.error || 'Failed to delete agent' },
        { status: res.status }
      )
    }

    return NextResponse.json({ success: true, deleted: id })
  } catch (error) {
    console.error('Error deleting agent:', error)
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    )
  }
}
