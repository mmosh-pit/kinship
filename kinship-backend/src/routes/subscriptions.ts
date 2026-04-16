import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { subscriptions, receipts, themes } from "../db/schema/index.js";
import { eq, lt } from "drizzle-orm";
import crypto from "crypto";

// Default subscription tiers — mirrors pkg/subscriptions/app/add_subscriptions_if_not_created_already.go
// Call this on startup to seed the table if empty.
export async function seedSubscriptions() {
  const existing = await db.select({ id: subscriptions.id }).from(subscriptions).limit(1);
  if (existing.length > 0) return;

  await db.insert(subscriptions).values([
    {
      id: crypto.randomUUID(),
      name: "Guest",
      tier: 0,
      productId: "guest",
      platform: "internal",
      benefits: [],
    },
    {
      id: crypto.randomUUID(),
      name: "Member",
      tier: 1,
      productId: "member",
      platform: "internal",
      benefits: [],
    },
  ]);
}

export async function subscriptionRoutes(fastify: FastifyInstance) {
  // ─── GET /subscriptions ────────────────────────────────────────────────────
  fastify.get(
    "/subscriptions",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const rows = await db.select().from(subscriptions);
      return reply.send({ subscriptions: rows });
    }
  );

  // ─── POST /save-receipt ────────────────────────────────────────────────────
  fastify.post(
    "/save-receipt",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          packageName: z.string(),
          productId: z.string(),
          purchaseToken: z.string(),
          platform: z.enum(["apple", "google"]),
          wallet: z.string().optional(),
          expiredAt: z.string().datetime().optional(),
        })
        .parse(request.body);

      const [receipt] = await db
        .insert(receipts)
        .values({
          id: crypto.randomUUID(),
          ...body,
          expiredAt: body.expiredAt ? new Date(body.expiredAt) : null,
        })
        .onConflictDoNothing()
        .returning();

      return reply.status(201).send({ receipt: receipt ?? null });
    }
  );

  // ─── POST /verify-receipt ──────────────────────────────────────────────────
  fastify.post(
    "/verify-receipt",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { purchaseToken } = z
        .object({ purchaseToken: z.string() })
        .parse(request.body);

      const [receipt] = await db
        .select()
        .from(receipts)
        .where(eq(receipts.purchaseToken, purchaseToken))
        .limit(1);

      if (!receipt) return reply.status(404).send({ error: "receipt-not-found" });

      const valid =
        !receipt.isCanceled &&
        (!receipt.expiredAt || receipt.expiredAt > new Date());

      return reply.send({ valid, receipt });
    }
  );

  // ─── GET /available-themes ─────────────────────────────────────────────────
  fastify.get(
    "/available-themes",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const rows = await db.select().from(themes);
      return reply.send({ themes: rows });
    }
  );

  // ─── POST /theme ───────────────────────────────────────────────────────────
  fastify.post(
    "/theme",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          name: z.string(),
          codeName: z.string(),
          backgroundColor: z.string().optional(),
          primaryColor: z.string().optional(),
          secondaryColor: z.string().optional(),
          logo: z.string().optional(),
        })
        .parse(request.body);

      const [theme] = await db
        .insert(themes)
        .values({ id: crypto.randomUUID(), ...body })
        .returning();

      return reply.status(201).send({ theme });
    }
  );
}
