import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  uuid: text("uuid"),
  picture: text("picture"),
  banner: text("banner"),
  name: text("name"),
  displayName: text("display_name"),
  lastName: text("last_name"),
  username: text("username"),
  websites: jsonb("websites"),
  bio: text("bio"),
  challenges: text("challenges"),
  email: text("email").unique().notNull(),
  password: text("password"),
  telegram: jsonb("telegram"),
  sessions: jsonb("sessions"),
  bluesky: jsonb("bluesky"),
  subscription: jsonb("subscription"),
  wallet: text("wallet"),
  referredBy: text("referred_by"),
  onboardingStep: integer("onboarding_step"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  profilenft: text("profilenft"),
  role: text("role"),
  fromBot: text("from_bot"),
  deactivated: boolean("deactivated"),
  seniority: integer("seniority"),
  symbol: text("symbol"),
  link: text("link"),
  following: integer("following").default(0),
  follower: integer("follower").default(0),
  connectionNft: text("connection_nft"),
  connectionBadge: text("connection_badge"),
  connection: integer("connection"),
  isPrivate: boolean("is_private"),
  request: boolean("request"),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
});

export const emailVerification = pgTable("email_verification", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code: integer("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  address: text("address"),
  private: text("private"),
  email: text("email").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const failedEmailAttempts = pgTable("failed_email_attempts", {
  id: serial("id").primaryKey(),
  email: text("email"),
  keypair: text("keypair"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const earlyAccess = pgTable("early_access", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
});

export const earlyAccessUsers = pgTable("early_access_users", {
  id: text("id").primaryKey(),
  firstName: text("first_name"),
  fullName: text("full_name"),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash"),
  hasChecked: boolean("has_checked"),
  hasVerifiedEmail: boolean("has_verified_email"),
  isMobileNumberVerified: boolean("is_mobile_number_verified"),
  mobileNumber: text("mobile_number"),
  countryCode: text("country_code"),
  country: text("country"),
  mobilePreferences: text("mobile_preferences").array(),
  referredKinshipCode: text("referred_kinship_code"),
  noCodeChecked: boolean("no_code_checked"),
  about: text("about"),
  currentStep: text("current_step"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  reason: text("reason"),
});
