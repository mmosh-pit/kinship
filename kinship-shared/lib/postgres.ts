/**
 * PostgreSQL Connection Helper
 *
 * Provides a reusable PostgreSQL client connection for the application.
 * Uses connection pooling to efficiently manage database connections.
 */

import { Pool, PoolClient } from 'pg'

// Environment variables
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/kinship_studio'

// Validate environment variables
if (!DATABASE_URL) {
  throw new Error('Please define DATABASE_URL environment variable')
}

// Global type declaration for PostgreSQL pool caching
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

// Cached pool for connection reuse
let pool: Pool

if (process.env.NODE_ENV === 'development') {
  // In development, use a global variable to preserve the pool across HMR
  if (!global._pgPool) {
    global._pgPool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  }
  pool = global._pgPool
} else {
  // In production, create a new pool
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
}

/**
 * Get the PostgreSQL pool instance
 */
export function getPool(): Pool {
  return pool
}

/**
 * Execute a query
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

/**
 * Execute a query and return the first row
 */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const result = await pool.query(text, params)
  return (result.rows[0] as T) || null
}

/**
 * Get a client for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect()
}

// Table names as constants
export const TABLES = {
  USERS: 'users',
  MEMBERSHIPS: 'user_memberships',
  AGENTS: 'agents',
  KNOWLEDGE_BASES: 'knowledge_bases',
  PROMPTS: 'prompts',
  ASSET_PACKS: 'asset_packs',
  AGENT_TOOLS: 'agent_tools',
  CHAT_SESSIONS: 'chat_sessions',
  CHAT_MESSAGES: 'chat_messages',
} as const

export default pool
