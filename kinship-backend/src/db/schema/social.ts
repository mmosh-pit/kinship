import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const waitlist = pgTable("waitlist", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// sender/receiver are wallet addresses
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  unread: integer("unread").default(1),
  sender: text("sender").notNull(),
  receiver: text("receiver").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// status: 0=requested, 1=following, 2=linked(mutual), 3=unfollowed, 4=accept, 5=decline
export const connections = pgTable("connections", {
  id: text("id").primaryKey(),
  sender: text("sender").notNull(),   // wallet address
  receiver: text("receiver").notNull(), // wallet address
  status: integer("status").notNull().default(0),
  badge: text("badge"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const linkedWallets = pgTable("linked_wallets", {
  id: text("id").primaryKey(),
  wallet: text("wallet").notNull(),
  appWallet: text("app_wallet").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
