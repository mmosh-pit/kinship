import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const chats = pgTable("chats", {
  id: text("id").primaryKey(),
  owner: text("owner").references(() => users.id),
  chatAgent: jsonb("chat_agent"),
  deactivated: boolean("deactivated"),
  lastMessage: jsonb("last_message"),
  participants: jsonb("participants"),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  content: text("content"),
  type: text("type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  sender: text("sender"),
  agentId: text("agent_id"),
});
