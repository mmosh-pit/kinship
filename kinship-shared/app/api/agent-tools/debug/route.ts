import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'

/**
 * Debug endpoint to check tool_connections table directly
 * 
 * GET /api/agent-tools/debug
 */
export async function GET(request: NextRequest) {
  try {
    // Get all rows from tool_connections
    const allConnections = await query(
      'SELECT id, worker_id, tool_name, status, external_handle, external_user_id, worker_agent_name, connected_at FROM tool_connections ORDER BY connected_at DESC LIMIT 50'
    )

    // Get table structure
    const tableInfo = await query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'tool_connections' ORDER BY ordinal_position"
    )

    // Check if table exists
    const tableExists = await query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tool_connections') as exists"
    )

    return NextResponse.json({
      tableExists: tableExists[0]?.exists,
      tableStructure: tableInfo,
      totalRows: allConnections.length,
      connections: allConnections,
    })
  } catch (error) {
    console.error('[debug] Error:', error)
    return NextResponse.json({ 
      error: String(error),
      message: 'Failed to query tool_connections table'
    }, { status: 500 })
  }
}
