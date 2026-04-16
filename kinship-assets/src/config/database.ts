import knex, { Knex } from "knex";
import dotenv from "dotenv";

dotenv.config();

const dbConfig: Knex.Config = {
  client: "pg",
  connection: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "kinship_assets",
    user: process.env.DB_USER || "kinship",
    password: process.env.DB_PASSWORD || "",
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: "./dist/db/migrations",
    loadExtensions: [".js"]
  },
};

const db = knex(dbConfig);

export { db, dbConfig };
export default db;
