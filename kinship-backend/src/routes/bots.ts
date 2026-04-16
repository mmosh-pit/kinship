import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { bots, activatedAgents, users } from "../db/schema/index.js";
import { eq, and, or, ilike, isNotNull } from "drizzle-orm";
import crypto from "crypto";

export async function botRoutes(fastify: FastifyInstance) {
  // ─── GET /agents — all public agents (no auth required) ───────────────────
  fastify.get("/agents", async (_request, reply) => {
    const rows = await db
      .select()
      .from(bots)
      .where(eq(bots.deactivated, false));
    return reply.send({ agents: rows });
  });

  // ─── GET /agents/active — agents activated by current user ────────────────
  fastify.get(
    "/agents/active",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const activated = await db
        .select({ agentId: activatedAgents.agentId })
        .from(activatedAgents)
        .where(eq(activatedAgents.userId, request.user.userId));

      return reply.send({ agentIds: activated.map((a) => a.agentId) });
    }
  );

  // ─── POST /agents/activate — toggle agent activation ──────────────────────
  // Mirrors Go: ActivateDeactivateAgent — checks profileNFT, toggles, creates/activates/deactivates chat
  fastify.post(
    "/agents/activate",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { agentId } = z.object({ agentId: z.string() }).parse(request.body);
      const { userId } = request.user;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return reply.status(404).send({ error: "user-not-found" });

      // Must have a profileNFT (mirrors Go's ErrUserNotSubscribed check)
      if (!user.profilenft) {
        return reply.status(403).send({ error: "user-not-subscribed" });
      }

      const [agent] = await db
        .select()
        .from(bots)
        .where(eq(bots.key, agentId))
        .limit(1);

      if (!agent) return reply.status(404).send({ error: "agent-not-found" });

      const [activatedAgent] = await db
        .select()
        .from(activatedAgents)
        .where(and(eq(activatedAgents.userId, userId), eq(activatedAgents.agentId, agentId)))
        .limit(1);

      if (!activatedAgent) {
        await db
          .insert(activatedAgents)
          .values({ agentId, userId })
          .onConflictDoNothing();
      } else {
        await db
          .delete(activatedAgents)
          .where(and(eq(activatedAgents.userId, userId), eq(activatedAgents.agentId, agentId)));
      }

      return reply.send({ activated: !activatedAgent });
    }
  );

  // ─── GET /bots — paginated, searchable list (authenticated) ───────────────
  // Wizards see all bots; members only see public ones
  fastify.get<{ Querystring: { search?: string; page?: string } }>(
    "/bots",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { search = "", page = "0" } = request.query;
      const pageNum = parseInt(page, 10);
      const offset = pageNum * 20;
      const isWizard = request.user.role === "wizard";

      let query = db
        .select()
        .from(bots)
        .limit(20)
        .offset(offset);

      if (!isWizard) {
        // Non-wizards only see public bots
        const filtered = await db
          .select()
          .from(bots)
          .where(
            search
              ? and(
                  eq(bots.privacy, "public"),
                  or(ilike(bots.name, `%${search}%`), ilike(bots.symbol, `%${search}%`))
                )
              : eq(bots.privacy, "public")
          )
          .limit(20)
          .offset(offset);
        return reply.send({ bots: filtered });
      }

      // Wizards can also search across all bots
      const rows = search
        ? await db
            .select()
            .from(bots)
            .where(or(ilike(bots.name, `%${search}%`), ilike(bots.symbol, `%${search}%`)))
            .limit(20)
            .offset(offset)
        : await query;

      return reply.send({ bots: rows });
    }
  );

  // ─── GET /my-bots — bots created by the current user ──────────────────────
  fastify.get(
    "/my-bots",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const rows = await db
        .select()
        .from(bots)
        .where(eq(bots.creator, request.user.userId));
      return reply.send({ bots: rows });
    }
  );

  // ─── POST /bots — create a bot (authenticated) ────────────────────────────
  fastify.post(
    "/bots",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = z
        .object({
          name: z.string(),
          description: z.string().optional(),
          image: z.string().optional(),
          symbol: z.string().optional(),
          key: z.string().optional(),
          systemPrompt: z.string().optional(),
          type: z.string().optional(),
          defaultModel: z.string().optional(),
          price: z.number().optional(),
          privacy: z.enum(["public", "secret", "private"]).optional(),
          distribution: z.record(z.unknown()).optional(),
          invitationPrice: z.number().optional(),
          telegram: z.string().optional(),
          twitter: z.string().optional(),
          website: z.string().optional(),
        })
        .parse(request.body);

      const id = crypto.randomUUID();
      const [bot] = await db
        .insert(bots)
        .values({
          id,
          ...body,
          creator: request.user.userId,
          creatorUsername: request.user.email,
        })
        .returning();

      return reply.status(201).send({ bot });
    }
  );

  // ─── POST /send-bot-message ────────────────────────────────────────────────
  fastify.post("/send-bot-message", async (request, reply) => {
    const { userId, message, botId } = z
      .object({
        userId: z.string(),
        message: z.string(),
        botId: z.string().optional(),
      })
      .parse(request.body);

    // TODO: look up chat by userId+botId and push message into it
    console.info(`[bot-message] userId=${userId} botId=${botId} message=${message}`);
    return reply.send({ ok: true });
  });
}
