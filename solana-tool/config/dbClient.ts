import { MongoClient } from "mongodb";
import { config } from "./config";

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