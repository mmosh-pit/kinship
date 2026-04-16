require('dotenv').config()
export const config: any = {
    network: process.env.NETWORK || "devnet",
    port: process.env.PORT || 8080,
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.kinship.codes",
    MongoUri: process.env.MONGO_URI || "mongodb://localhost:27017?retryWrites=true&w=majority",
    DatabaseName: process.env.DATABASE_NAME || "live_forge",
    RPC_URL: process.env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=e28687eb-0946-4d1b-9205-31804b14cf39",
    JUPITER_RPC_URL: process.env.JUPITER_RPC_URL || "https://token.jup.ag/"
}