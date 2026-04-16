import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add system_prompt column to scenes table (safe: skip if already exists)
  const hasSystemPrompt = await knex.schema.hasColumn(
    "scenes",
    "system_prompt",
  );
  const hasDescription = await knex.schema.hasColumn("scenes", "description");

  if (!hasSystemPrompt || !hasDescription) {
    await knex.schema.alterTable("scenes", (table) => {
      if (!hasSystemPrompt) table.text("system_prompt").nullable();
      if (!hasDescription) table.text("description").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("scenes", (table) => {
    table.dropColumn("system_prompt");
    table.dropColumn("description");
  });
}