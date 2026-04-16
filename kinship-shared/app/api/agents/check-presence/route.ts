import { NextRequest, NextResponse } from 'next/server'

// For server-side, we can use either AGENT_API_URL or NEXT_PUBLIC_AGENT_API_URL
const AGENT_API_URL = process.env.AGENT_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8000'

// GET /api/agents/check-presence?wallet=xxx
// Returns whether the wallet already has a presence (supervisor) agent
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const wallet = searchParams.get('wallet')

    if (!wallet) {
      return NextResponse.json(
        { error: 'wallet is required' },
        { status: 400 }
      )
    }

    const res = await fetch(`${AGENT_API_URL}/api/agents/check-presence?wallet=${encodeURIComponent(wallet)}`)
    
    if (!res.ok) {
      const error = await res.json()
      return NextResponse.json(
        { error: error.detail || 'Failed to check presence' },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error checking presence:', error)
    return NextResponse.json(
      { error: 'Failed to check presence' },
      { status: 500 }
    )
  }
}
