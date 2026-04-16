import { NextRequest, NextResponse } from 'next/server'

// For server-side, we can use either AGENT_API_URL or NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL = process.env.AGENT_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'

export interface KnowledgeBase {
  id: string
  name: string
  namespace?: string
  projectId?: string
  platformId?: string
  description?: string
  itemCount?: number
  createdAt: string
  updatedAt: string
}

// GET /api/knowledge — List all knowledge bases
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Build query params for backend
    const backendParams = new URLSearchParams()
    const wallet = searchParams.get('wallet')
    const platformId = searchParams.get('platformId')
    const projectId = searchParams.get('projectId')
    
    if (wallet) backendParams.set('wallet', wallet)
    if (platformId) backendParams.set('platformId', platformId)
    if (projectId) backendParams.set('platformId', projectId) // Map projectId to platformId
    
    const res = await fetch(`${AGENT_API_URL}/api/knowledge?${backendParams.toString()}`)
    
    if (!res.ok) {
      console.error('Backend KB list error:', res.status)
      return NextResponse.json({ knowledgeBases: [] })
    }

    const data = await res.json()
    return NextResponse.json({ knowledgeBases: data.knowledgeBases || [] })
  } catch (error) {
    console.error('List KBs error:', error)
    return NextResponse.json({ knowledgeBases: [] })
  }
}

// POST /api/knowledge — Create a new knowledge base
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const res = await fetch(`${AGENT_API_URL}/api/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const error = await res.json()
      return NextResponse.json(
        { error: error.detail || error.error || 'Failed to create knowledge base' },
        { status: res.status }
      )
    }

    const kb = await res.json()
    return NextResponse.json(kb, { status: 201 })
  } catch (error) {
    console.error('Create KB error:', error)
    return NextResponse.json({ error: 'Failed to create knowledge base' }, { status: 500 })
  }
}
