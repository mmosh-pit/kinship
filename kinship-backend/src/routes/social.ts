import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { users, waitlist, notifications, linkedWallets } from "../db/schema/index.js";
import { eq, inArray, sql } from "drizzle-orm";
import crypto from "crypto";
import { sendKartraNotification } from "../services/kartra.js";

export async function socialRoutes(fastify: FastifyInstance) {
  // ─── GET /get-geo-location ─────────────────────────────────────────────────
  // Resolves caller IP to country/region/city via ipapi.co.
  fastify.get("/get-geo-location", async (request, reply) => {
    const forwarded = request.headers["x-forwarded-for"] as string | undefined;
    let ip = forwarded
      ? forwarded.split(",")[0].replace("::ffff:", "").trim()
      : (request.ip ?? "127.0.0.1");
    if (ip === "::1") ip = "127.0.0.1";

    try {
      const res = await fetch(`https://ipapi.co/${ip}/json/`);
      const geo: any = await res.json();
      return reply.send({
        country: geo.country_name ?? "Unknown",
        region: geo.region ?? "Unknown",
        city: geo.city ?? "Unknown",
        ip,
      });
    } catch {
      return reply.send({ country: "Unknown", region: "Unknown", city: "Unknown", ip: "0.0.0.0" });
    }
  });

  // ─── PUT /log-data ─────────────────────────────────────────────────────────
  // Server-side logging sink — no persistence.
  fastify.put("/log-data", async (request, reply) => {
    const { data } = (request.body as any) ?? {};
    fastify.log.warn({ logData: data }, "log-data");
    return reply.send("");
  });

  // ─── PUT /update-user-activity ─────────────────────────────────────────────
  // Stamps `last_activity` on the user identified by wallet address.
  fastify.put("/update-user-activity", async (request, reply) => {
    const { wallet } = z.object({ wallet: z.string() }).parse(request.body);

    await db
      .update(users)
      .set({ lastActivity: new Date() })
      .where(eq(users.wallet, wallet));

    return reply.send("");
  });

  // ─── GET /get-wallet-by-telegram ──────────────────────────────────────────
  // Returns the user whose `telegram.id` matches `?telegramId=`.
  fastify.get("/get-wallet-by-telegram", async (request, reply) => {
    const { telegramId } = z
      .object({ telegramId: z.string() })
      .parse(request.query as Record<string, string>);

    const [user] = await db
      .select()
      .from(users)
      .where(sql`(${users.telegram}->>'id')::integer = ${Number(telegramId)}`)
      .limit(1);

    return reply.send(user ?? null);
  });

  // ─── POST /save-waitlist ───────────────────────────────────────────────────
  // Deduplicates by email, inserts into waitlist, tags in Kartra CRM.
  fastify.post("/save-waitlist", async (request, reply) => {
    const { name, email } = z
      .object({ name: z.string(), email: z.string().email() })
      .parse(request.body);

    const [existing] = await db
      .select({ id: waitlist.id })
      .from(waitlist)
      .where(eq(waitlist.email, email))
      .limit(1);

    if (!existing) {
      await db
        .insert(waitlist)
        .values({ id: crypto.randomUUID(), name, email })
        .onConflictDoNothing();

      sendKartraNotification("KS CODE WAITLIST", name, "", email).catch(console.error);
    }

    return reply.send("");
  });

  // ─── GET /notifications ────────────────────────────────────────────────────
  // Returns unread count + last 100 notifications (joined with sender/receiver
  // user rows) for the given wallet address.
  fastify.get("/notifications", async (request, reply) => {
    const { wallet } = z
      .object({ wallet: z.string() })
      .parse(request.query as Record<string, string>);

    const rows = await db.select().from(notifications).where(eq(notifications.receiver, wallet));

    const unreadCount = rows.filter((n) => n.unread === 1).length;

    // Enrich with user objects — batch-load unique wallets
    const walletAddrs = [
      ...new Set(rows.flatMap((n) => [n.sender, n.receiver])),
    ];

    const enrichedUsers = walletAddrs.length
      ? await db
          .select({ wallet: users.wallet, username: users.username, picture: users.picture, name: users.name })
          .from(users)
          .where(inArray(users.wallet, walletAddrs))
      : [];

    const userMap = Object.fromEntries(enrichedUsers.map((u) => [u.wallet, u]));

    const enriched = rows
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, unreadCount > 100 ? unreadCount : 100)
      .map((n) => ({
        ...n,
        sender: userMap[n.sender] ?? { wallet: n.sender },
        receiver: userMap[n.receiver] ?? { wallet: n.receiver },
      }));

    return reply.send({ unread: unreadCount, data: enriched });
  });

  // ─── POST /link-wallet ─────────────────────────────────────────────────────
  // Records a wallet ↔ app-wallet association (idempotent).
  fastify.post("/link-wallet", async (request, reply) => {
    const { wallet, appWallet } = z
      .object({ wallet: z.string(), appWallet: z.string() })
      .parse(request.body);

    await db
      .insert(linkedWallets)
      .values({ id: crypto.randomUUID(), wallet, appWallet })
      .onConflictDoNothing();

    return reply.send("");
  });
}
