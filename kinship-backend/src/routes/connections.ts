import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, connections, notifications } from "../db/schema/index.js";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import crypto from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getUserByWallet(wallet: string) {
  const [user] = await db.select().from(users).where(eq(users.wallet, wallet)).limit(1);
  return user ?? null;
}

async function sendNotification(params: {
  type: string;
  message: string;
  unread: number;
  sender: string;
  receiver: string;
}) {
  // Deduplicate: only insert if same type+sender+receiver doesn't exist
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.sender, params.sender),
        eq(notifications.receiver, params.receiver),
        eq(notifications.type, params.type),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      type: params.type,
      message: params.message,
      unread: params.unread,
      sender: params.sender,
      receiver: params.receiver,
    });
  }
}

// Enrich a list of connections rows with sender/receiver user objects
async function enrichWithUsers(rows: (typeof connections.$inferSelect)[]) {
  if (!rows.length) return [];

  const walletAddrs = [...new Set(rows.flatMap((r) => [r.sender, r.receiver]))];
  const userRows = await db
    .select({ wallet: users.wallet, username: users.username, picture: users.picture, name: users.name })
    .from(users)
    .where(inArray(users.wallet, walletAddrs));

  const userMap = Object.fromEntries(userRows.map((u) => [u.wallet, u]));

  return rows.map((r) => ({
    ...r,
    sender: [userMap[r.sender] ?? { wallet: r.sender }],
    receiver: [userMap[r.receiver] ?? { wallet: r.receiver }],
  }));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function connectionsRoutes(fastify: FastifyInstance) {
  // ─── POST /send ────────────────────────────────────────────────────────────
  // Full connection state machine.
  // status: 0=request, 1=follow, 2=unlink(mutual), 3=cancel/unfollow, 4=accept, 5=decline
  fastify.post("/send", async (request, reply) => {
    const { sender, receiver, status, badge } = z
      .object({
        sender: z.string(),
        receiver: z.string(),
        status: z.number().int(),
        badge: z.string().optional(),
      })
      .parse(request.body);

    const senderUser = await getUserByWallet(sender);
    const receiverUser = await getUserByWallet(receiver);

    if (!senderUser || !receiverUser) return reply.send("");

    // ── status 2: unlink ───────────────────────────────────────────────────
    if (status === 2) {
      // Remove mutual link records
      await db
        .delete(connections)
        .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver), eq(connections.status, 2)));
      await db
        .delete(connections)
        .where(and(eq(connections.sender, receiver), eq(connections.receiver, sender), eq(connections.status, 2)));

      // Mark sender→receiver as unfollowed
      await db
        .update(connections)
        .set({ status: 3 })
        .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver)));

      // Decrement counts
      await db
        .update(users)
        .set({ follower: sql`GREATEST(COALESCE(follower, 0) - 1, 0)` })
        .where(eq(users.wallet, receiver));
      await db
        .update(users)
        .set({ following: sql`GREATEST(COALESCE(following, 0) - 1, 0)` })
        .where(eq(users.wallet, sender));

      await sendNotification({
        type: "unlink",
        message: `${senderUser.username ?? sender} unlinked from your connection`,
        unread: 1,
        sender,
        receiver,
      });
    }

    // ── status 0: request ──────────────────────────────────────────────────
    if (status === 0) {
      const [existing] = await db
        .select({ id: connections.id })
        .from(connections)
        .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver)))
        .limit(1);

      if (!existing) {
        await db.insert(connections).values({ id: crypto.randomUUID(), sender, receiver, status: 0 });
        await sendNotification({
          type: "request",
          message: `${senderUser.username ?? sender} sent you connection request`,
          unread: 0,
          sender,
          receiver,
        });
      } else {
        await db
          .update(connections)
          .set({ status: 0 })
          .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver)));
      }
    }

    // ── status 3: cancel request / unfollow ───────────────────────────────
    if (status === 3) {
      await db
        .delete(connections)
        .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver)));
    }

    // ── status 4 (accept) or 1 (follow) ───────────────────────────────────
    if (status === 4 || status === 1) {
      if (status === 4) {
        await db
          .update(connections)
          .set({ status: 1 })
          .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver)));
      } else {
        // status 1 — follow
        const [unfollowed] = await db
          .select({ id: connections.id })
          .from(connections)
          .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver), eq(connections.status, 3)))
          .limit(1);

        if (unfollowed) {
          await db
            .update(connections)
            .set({ status: 1 })
            .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver)));
        } else {
          await db.insert(connections).values({ id: crypto.randomUUID(), sender, receiver, status: 1, badge });
        }
      }

      // Increment follower/following counts
      await db
        .update(users)
        .set({ follower: sql`COALESCE(follower, 0) + 1` })
        .where(eq(users.wallet, receiver));
      await db
        .update(users)
        .set({ following: sql`COALESCE(following, 0) + 1` })
        .where(eq(users.wallet, sender));

      if (status === 4) {
        await sendNotification({
          type: "accept",
          message: `${receiverUser.username ?? receiver} accepted your connection request`,
          unread: 1,
          sender: receiver,
          receiver: sender,
        });
      } else {
        await sendNotification({
          type: "follow",
          message: `${senderUser.username ?? sender} connected with you`,
          unread: 1,
          sender,
          receiver,
        });
      }

      // If reverse follow exists (status 1), create mutual link (status 2) for both
      const [reverseFollow] = await db
        .select({ id: connections.id })
        .from(connections)
        .where(and(eq(connections.sender, receiver), eq(connections.receiver, sender), eq(connections.status, 1)))
        .limit(1);

      if (reverseFollow) {
        await db.insert(connections).values({ id: crypto.randomUUID(), sender, receiver, status: 2, badge });
        await db.insert(connections).values({ id: crypto.randomUUID(), sender: receiver, receiver: sender, status: 2, badge });
      }
    }

    // ── status 5: decline ─────────────────────────────────────────────────
    if (status === 5) {
      await db
        .delete(connections)
        .where(and(eq(connections.sender, sender), eq(connections.receiver, receiver)));

      await sendNotification({
        type: "decline",
        message: `${receiverUser.username ?? receiver} declined your connection request`,
        unread: 1,
        sender: receiver,
        receiver: sender,
      });
    }

    return reply.send("");
  });

  // ─── GET /list ─────────────────────────────────────────────────────────────
  // Active connections for a wallet (status 0 or 1).
  fastify.get("/list", async (request, reply) => {
    const { wallet } = z
      .object({ wallet: z.string() })
      .parse(request.query as Record<string, string>);

    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.receiver, wallet), inArray(connections.status, [0, 1])));

    return reply.send(await enrichWithUsers(rows));
  });

  // ─── GET /request ──────────────────────────────────────────────────────────
  // Incoming connection requests (status 0), paginated 10/page.
  fastify.get("/request", async (request, reply) => {
    const { wallet, page = "0" } = z
      .object({ wallet: z.string(), page: z.string().optional() })
      .parse(request.query as Record<string, string>);

    const offset = parseInt(page) * 10;

    const all = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.receiver, wallet), eq(connections.status, 0)));

    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.receiver, wallet), eq(connections.status, 0)))
      .limit(10)
      .offset(offset);

    return reply.send({ total: all.length, data: await enrichWithUsers(rows) });
  });

  // ─── GET /follower ─────────────────────────────────────────────────────────
  // Users who follow the given wallet (receiver=wallet, status=1), paginated.
  fastify.get("/follower", async (request, reply) => {
    const { wallet, page = "0" } = z
      .object({ wallet: z.string(), page: z.string().optional() })
      .parse(request.query as Record<string, string>);

    const offset = parseInt(page) * 10;

    const all = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.receiver, wallet), eq(connections.status, 1)));

    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.receiver, wallet), eq(connections.status, 1)))
      .limit(10)
      .offset(offset);

    return reply.send({ total: all.length, data: await enrichWithUsers(rows) });
  });

  // ─── GET /following ────────────────────────────────────────────────────────
  // Users the given wallet follows (sender=wallet, status=1), paginated.
  fastify.get("/following", async (request, reply) => {
    const { wallet, page = "0" } = z
      .object({ wallet: z.string(), page: z.string().optional() })
      .parse(request.query as Record<string, string>);

    const offset = parseInt(page) * 10;

    const all = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.sender, wallet), eq(connections.status, 1)));

    const rows = await db
      .select()
      .from(connections)
      .where(and(eq(connections.sender, wallet), eq(connections.status, 1)))
      .limit(10)
      .offset(offset);

    return reply.send({ total: all.length, data: await enrichWithUsers(rows) });
  });

  // ─── PUT /update-profile ───────────────────────────────────────────────────
  // Replace top-level profile fields on a user identified by wallet.
  fastify.put("/update-profile", async (request, reply) => {
    const { wallet, value } = z
      .object({ wallet: z.string(), value: z.record(z.unknown()) })
      .parse(request.body);

    // Only allow known user columns to be updated
    const allowed: (keyof typeof users.$inferInsert)[] = [
      "name", "displayName", "lastName", "username", "bio", "picture",
      "banner", "symbol", "link", "isPrivate", "seniority", "websites",
    ];

    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in value) patch[key] = value[key];
    }

    if (Object.keys(patch).length) {
      await db.update(users).set(patch as any).where(eq(users.wallet, wallet));
    }

    return reply.send("");
  });

  // ─── PUT /update-profile-settings ─────────────────────────────────────────
  // Toggle privacy setting for a wallet.
  fastify.put("/update-profile-settings", async (request, reply) => {
    const { wallet, isprivate } = z
      .object({ wallet: z.string(), isprivate: z.boolean() })
      .parse(request.body);

    await db.update(users).set({ isPrivate: isprivate }).where(eq(users.wallet, wallet));

    return reply.send("");
  });
}
