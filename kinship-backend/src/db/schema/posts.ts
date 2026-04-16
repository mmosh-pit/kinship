import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  header: text("header"),
  subHeader: text("sub_header"),
  tags: jsonb("tags"),
  authors: jsonb("authors"),
  body: text("body"),
  slug: text("slug").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
