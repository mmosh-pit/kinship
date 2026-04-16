require('dotenv').config()
export const config: any = {
    port: process.env.PORT || 5000,
    MongoUri: process.env.MONGO_URI || "mongodb://localhost:27017?retryWrites=true&w=majority",
    DatabaseName: process.env.DATABASE_NAME || "live_forge",
    blueSkyBaseRpcUrl: process.env.BLUE_SKY_BASE_RPC_URL || "https://bsky.social/xrpc",
    nextPublicBackendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.kinship.codes",
    // PostgreSQL for tool_connections
    postgresUrl: process.env.POSTGRES_URL || "postgresql://postgres:postgres@localhost:5432/kinship_studio",
    // Encryption secret key for decrypting credentials
    encryptionSecretKey: process.env.ENCRYPTION_SECRET_KEY || "default-secret-key-change-me",
}
