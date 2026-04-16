CREATE TABLE "account_deletion_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"reason" text,
	CONSTRAINT "account_deletion_requests_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "early_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	CONSTRAINT "early_access_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "early_access_users" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"full_name" text,
	"email" text NOT NULL,
	"password_hash" text,
	"has_checked" boolean,
	"has_verified_email" boolean,
	"is_mobile_number_verified" boolean,
	"mobile_number" text,
	"country_code" text,
	"country" text,
	"mobile_preferences" text[],
	"referred_kinship_code" text,
	"no_code_checked" boolean,
	"about" text,
	"current_step" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "early_access_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_verification" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "failed_email_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"keypair" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"uuid" text,
	"picture" text,
	"banner" text,
	"name" text,
	"display_name" text,
	"last_name" text,
	"username" text,
	"websites" jsonb,
	"bio" text,
	"challenges" text,
	"email" text NOT NULL,
	"password" text,
	"telegram" jsonb,
	"sessions" jsonb,
	"bluesky" jsonb,
	"subscription" jsonb,
	"wallet" text,
	"referred_by" text,
	"onboarding_step" integer,
	"created_at" timestamp with time zone,
	"last_login" timestamp with time zone,
	"profilenft" text,
	"role" text,
	"from_bot" text,
	"deactivated" boolean,
	"seniority" integer,
	"symbol" text,
	"link" text,
	"following" integer DEFAULT 0,
	"follower" integer DEFAULT 0,
	"connection_nft" text,
	"connection_badge" text,
	"connection" integer,
	"is_private" boolean,
	"request" boolean,
	"last_activity" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text,
	"private" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "wallets_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "activated_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "activated_agents_agent_id_user_id_unique" UNIQUE("agent_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "bots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"description" text,
	"image" text,
	"symbol" text,
	"key" text,
	"price" double precision,
	"presale_start_date" text,
	"system_prompt" text,
	"creator_username" text,
	"type" text,
	"default_model" text,
	"deactivated" boolean,
	"created_at" timestamp with time zone DEFAULT now(),
	"invite_image" text,
	"lut" text,
	"seniority" integer,
	"distribution" jsonb,
	"invitation_price" double precision,
	"discount" double precision,
	"telegram" text,
	"twitter" text,
	"website" text,
	"presale_supply" integer,
	"min_presale_supply" integer,
	"presale_end_date" text,
	"dex_listing_date" text,
	"creator" text,
	"code" text,
	"privacy" text,
	"status" text,
	CONSTRAINT "bots_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "chat_bots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"type" text,
	"picture" text
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text,
	"chat_agent" jsonb,
	"deactivated" boolean,
	"last_message" jsonb,
	"participants" jsonb
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"content" text,
	"type" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"sender" text,
	"agent_id" text
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"header" text,
	"sub_header" text,
	"tags" jsonb,
	"authors" jsonb,
	"body" text,
	"slug" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "coin_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	CONSTRAINT "coin_addresses_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"package_name" text,
	"product_id" text,
	"purchase_token" text,
	"wallet" text,
	"platform" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"expired_at" timestamp with time zone,
	"is_canceled" boolean,
	CONSTRAINT "receipts_purchase_token_unique" UNIQUE("purchase_token")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"tier" integer,
	"product_id" text,
	"platform" text,
	"benefits" jsonb,
	CONSTRAINT "subscriptions_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"code_name" text,
	"background_color" text,
	"primary_color" text,
	"secondary_color" text,
	"logo" text
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"sender" text NOT NULL,
	"receiver" text NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"badge" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "linked_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"app_wallet" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"unread" integer DEFAULT 1,
	"sender" text NOT NULL,
	"receiver" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visitor_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"mobile" text,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"has_verified_email" boolean DEFAULT false,
	"is_mobile_number_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending_email_verification',
	"roles" jsonb DEFAULT '[]'::jsonb,
	"mobile_preference" jsonb DEFAULT '[]'::jsonb,
	"intent" jsonb DEFAULT '[]'::jsonb,
	"contact_preference" jsonb DEFAULT '[]'::jsonb,
	"current_step" text,
	"mobile_number" text,
	"country_code" text,
	"telegram_username" text,
	"bluesky_handle" text,
	"linkedin_profile" text,
	"refered_kinship_code" text,
	"kinship_code" text,
	"likert_answers" jsonb,
	"challenges" jsonb DEFAULT '[]'::jsonb,
	"abilities" jsonb DEFAULT '[]'::jsonb,
	"aspirations" jsonb DEFAULT '[]'::jsonb,
	"avatar" text,
	"last_name" text,
	"bio" text,
	"web" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "visitors_email_unique" UNIQUE("email"),
	CONSTRAINT "visitors_kinship_code_unique" UNIQUE("kinship_code")
);
--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;