/**
 * Database migration runner
 * 
 * Runs Knex migrations and optionally fixes .ts to .js extension issues.
 * 
 * Run with: npx ts-node src/db/migrate.ts
 * Or after build: node dist/db/migrate.js
 */

import { db } from "../config/database";
import logger from "../utils/logger";

async function checkTableExists(tableName: string): Promise<boolean> {
  const result = await db.raw(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ?
    )
  `, [tableName]);
  return result.rows[0].exists;
}

async function fixTsExtensions() {
  // Check if knex_migrations table exists
  const tableExists = await checkTableExists("knex_migrations");
  
  if (!tableExists) {
    logger.info("knex_migrations table does not exist yet. Skipping extension fix.");
    return;
  }

  // Check for .ts extensions
  const before = await db("knex_migrations")
    .select("name")
    .where("name", "like", "%.ts");

  if (before.length === 0) {
    logger.info("No .ts extensions found in knex_migrations. Nothing to fix.");
    return;
  }

  logger.info(`Found ${before.length} migrations with .ts extension:`);
  before.forEach((row) => logger.info(`  - ${row.name}`));

  // Update .ts to .js
  const updated = await db("knex_migrations")
    .where("name", "like", "%.ts")
    .update({
      name: db.raw("REPLACE(name, '.ts', '.js')"),
    });

  logger.info(`Updated ${updated} migration records from .ts to .js`);
}

async function runMigrations() {
  try {
    logger.info("Starting database migrations...");

    // First, fix any .ts extension issues if the table exists
    logger.info("Checking knex_migrations table for .ts extensions...");
    await fixTsExtensions();

    // Run pending migrations
    logger.info("Running pending migrations...");
    const [batchNo, migrations] = await db.migrate.latest();

    if (migrations.length === 0) {
      logger.info("Database is already up to date.");
    } else {
      logger.info(`Batch ${batchNo} completed. Ran ${migrations.length} migration(s):`);
      migrations.forEach((migration: string) => logger.info(`  - ${migration}`));
    }

    // Show current migration status
    const currentVersion = await db.migrate.currentVersion();
    logger.info(`Current database version: ${currentVersion}`);

    logger.info("Migration complete!");
  } catch (error) {
    logger.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Handle rollback command
const command = process.argv[2];

if (command === "rollback") {
  (async () => {
    try {
      logger.info("Rolling back last migration batch...");
      const [batchNo, migrations] = await db.migrate.rollback();
      
      if (migrations.length === 0) {
        logger.info("No migrations to rollback.");
      } else {
        logger.info(`Batch ${batchNo} rolled back. Reverted ${migrations.length} migration(s):`);
        migrations.forEach((migration: string) => logger.info(`  - ${migration}`));
      }
    } catch (error) {
      logger.error("Rollback failed:", error);
      process.exit(1);
    } finally {
      await db.destroy();
    }
  })();
} else {
  runMigrations();
}