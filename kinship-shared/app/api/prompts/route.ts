import { NextRequest, NextResponse } from 'next/server'

// For server-side, we can use either AGENT_API_URL or NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL = process.env.AGENT_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'

export interface Prompt {
  id: string
  name: string
  content?: string
  projectId?: string
  platformId?: string
  type?: 'global' | 'scene' | 'npc'
  createdAt: string
  updatedAt: string
}

// GET /api/prompts — List all prompts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Build query params for backend
    const backendParams = new URLSearchParams()
    const wallet = searchParams.get('wallet')
    const platformId = searchParams.get('platformId')
    const projectId = searchParams.get('projectId')
    const type = searchParams.get('type')
    
    if (wallet) backendParams.set('wallet', wallet)
    if (platformId) backendParams.set('platformId', platformId)
    if (projectId) backendParams.set('platformId', projectId) // Map projectId to platformId
    if (type) backendParams.set('category', type) // Map type to category
    
    const res = await fetch(`${AGENT_API_URL}/api/prompts?${backendParams.toString()}`)
    
    if (!res.ok) {
      console.error('Backend prompts list error:', res.status)
      return NextResponse.json({ prompts: [] })
    }

    const data = await res.json()
    return NextResponse.json({ prompts: data.prompts || [] })
  } catch (error) {
    console.error('List prompts error:', error)
    return NextResponse.json({ prompts: [] })
  }
}

// POST /api/prompts — Create a new prompt
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const res = await fetch(`${AGENT_API_URL}/api/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const error = await res.json()
      return NextResponse.json(
        { error: error.detail || error.error || 'Failed to create prompt' },
        { status: res.status }
      )
    }

    const prompt = await res.json()
    return NextResponse.json(prompt, { status: 201 })
  } catch (error) {
    console.error('Create prompt error:', error)
    return NextResponse.json({ error: 'Failed to create prompt' }, { status: 500 })
  }
}
