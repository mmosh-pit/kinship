import { boolean, jsonb, pgTable, serial, text, timestamp, doublePrecision, integer, unique } from "drizzle-orm/pg-core";

export const bots = pgTable("bots", {
  id: text("id").primaryKey(),
  name: text("name"),
  description: text("description"),
  image: text("image"),
  symbol: text("symbol"),
  key: text("key").unique(),
  price: doublePrecision("price"),
  presaleStartDate: text("presale_start_date"),
  systemPrompt: text("system_prompt"),
  creatorUsername: text("creator_username"),
  type: text("type"),
  defaultModel: text("default_model"),
  deactivated: boolean("deactivated"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  inviteImage: text("invite_image"),
  lut: text("lut"),
  seniority: integer("seniority"),
  distribution: jsonb("distribution"),
  invitationPrice: doublePrecision("invitation_price"),
  discount: doublePrecision("discount"),
  telegram: text("telegram"),
  twitter: text("twitter"),
  website: text("website"),
  presaleSupply: integer("presale_supply"),
  minPresaleSupply: integer("min_presale_supply"),
  presaleEndDate: text("presale_end_date"),
  dexListingDate: text("dex_listing_date"),
  creator: text("creator"),
  code: text("code"),
  privacy: text("privacy"),
  status: text("status"),
});

export const activatedAgents = pgTable("activated_agents", {
  id: serial("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  userId: text("user_id").notNull(),
}, (table) => ({
  uniq: unique().on(table.agentId, table.userId),
}));

export const chatBots = pgTable("chat_bots", {
  id: text("id").primaryKey(),
  name: text("name"),
  type: text("type"),
  picture: text("picture"),
});
