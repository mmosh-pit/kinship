/**
 * MongoDB Connection Helper
 *
 * Provides a reusable MongoDB client connection for the application.
 * Uses connection pooling to efficiently manage database connections.
 */

import { MongoClient, Db, Document } from 'mongodb'

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'live_forge'

// Validate environment variables
if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI environment variable')
}

if (!MONGODB_DATABASE) {
  throw new Error('Please define MONGODB_DATABASE environment variable')
}

// MongoDB client options
const options = {
  maxPoolSize: 10,
  minPoolSize: 5,
  maxIdleTimeMS: 60000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
}

// Global type declaration for MongoDB client caching
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

// Cached client promise for connection reuse
let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  // In development, use a global variable to preserve the client across HMR
  if (!global._mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  // In production, create a new client
  const client = new MongoClient(MONGODB_URI, options)
  clientPromise = client.connect()
}

/**
 * Get the MongoDB client instance
 */
export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise
}

/**
 * Get a database instance
 * @param dbName Optional database name, defaults to MONGODB_DATABASE
 */
export async function getDatabase(dbName?: string): Promise<Db> {
  const client = await getMongoClient()
  return client.db(dbName || MONGODB_DATABASE)
}

/**
 * Get a collection from the database
 * @param collectionName The name of the collection
 * @param dbName Optional database name
 */
export async function getCollection<T extends Document>(
  collectionName: string,
  dbName?: string
) {
  const db = await getDatabase(dbName)
  return db.collection<T>(collectionName)
}

// Collection names as constants
export const COLLECTIONS = {
  USERS: 'mmosh-users',
  MEMBERSHIPS: 'mmosh-app-user-membership',
  AGENTS: 'agents',
  KNOWLEDGE_BASES: 'knowledge_bases',
  PROMPTS: 'prompts',
  ASSET_PACKS: 'asset_packs',
} as const

export default clientPromise
