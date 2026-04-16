import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  name: text("name"),
  tier: integer("tier"),
  productId: text("product_id").unique(),
  platform: text("platform"),
  benefits: jsonb("benefits"),
});

export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  packageName: text("package_name"),
  productId: text("product_id"),
  purchaseToken: text("purchase_token").unique(),
  wallet: text("wallet"),
  platform: text("platform"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
  isCanceled: boolean("is_canceled"),
});

export const coinAddresses = pgTable("coin_addresses", {
  id: serial("id").primaryKey(),
  token: text("token").unique().notNull(),
});

export const themes = pgTable("themes", {
  id: text("id").primaryKey(),
  name: text("name"),
  codeName: text("code_name"),
  backgroundColor: text("background_color"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  logo: text("logo"),
});
