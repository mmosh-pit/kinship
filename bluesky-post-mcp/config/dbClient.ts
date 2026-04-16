import { MongoClient } from "mongodb";
import { Pool } from "pg";
import { config } from "./config";

// MongoDB connection (existing)
const uri = config.MongoUri;
const client = new MongoClient(uri);

export const connectToDatabase = async () => {
    try {
        await client.connect();
        console.log("Connected to MongoDB");
        const db = client.db(config.DatabaseName);
        return db;
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}

// PostgreSQL connection (new - for tool_connections)
const pgPool = new Pool({
    connectionString: config.postgresUrl,
});

export const connectToPostgres = async () => {
    try {
        const pgClient = await pgPool.connect();
        console.log("Connected to PostgreSQL");
        pgClient.release();
        return pgPool;
    } catch (error) {
        console.error("Error connecting to PostgreSQL:", error);
        throw error;
    }
}

export { pgPool };
