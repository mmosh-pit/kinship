import type { Knex } from "knex";

/**
 * Add actors, challenges, and routes JSONB columns to the existing scenes table.
 * This allows storing the full game data directly in the database
 * for faster retrieval without fetching from GCS.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("scenes", (table) => {
        // Actors/NPCs for this scene
        table.jsonb("actors").defaultTo("[]");

        // Challenges for this scene
        table.jsonb("challenges").defaultTo("[]");

        // Routes from this scene (for scene transitions)
        table.jsonb("routes").defaultTo("[]");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("scenes", (table) => {
        table.dropColumn("actors");
        table.dropColumn("challenges");
        table.dropColumn("routes");
    });
}
