import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "../db/client.js";
import { users, bots } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

// Admin preHandler: JWT must be valid AND role must be "wizard"
// (mirrors Go's isAdmin route flag + ValidateAuth wizard check)
function requireWizard(fastify: FastifyInstance) {
  return [
    fastify.authenticate,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.user.role !== "wizard") {
        return reply.status(403).send({ error: "forbidden" });
      }
    },
  ];
}

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 2,
  hashLength: 32,
};

export async function adminRoutes(fastify: FastifyInstance) {
  // ─── POST /admin/login ────────────────────────────────────────────────────
  fastify.post("/login", async (request, reply) => {
    const { handle, password } = z
      .object({ handle: z.string(), password: z.string() })
      .parse(request.body);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, handle))
      .limit(1);

    if (!user || user.role !== "wizard") {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const valid = await argon2.verify(user.password!, password);
    if (!valid) return reply.status(401).send({ error: "unauthorized" });

    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      role: "wizard",
    });

    return reply.send({ token });
  });

  // ─── GET /admin/is-auth ───────────────────────────────────────────────────
  fastify.get(
    "/is-auth",
    { preHandler: requireWizard(fastify) },
    async (request, reply) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.user.userId))
        .limit(1);
      if (!user) return reply.status(404).send({ error: "user-not-found" });
      const { password: _pw, ...safeUser } = user;
      return reply.send({ user: safeUser });
    }
  );

  // ─── GET /admin/users — paginated user list ───────────────────────────────
  fastify.get<{ Querystring: { page?: string } }>(
    "/users",
    { preHandler: requireWizard(fastify) },
    async (request, reply) => {
      const page = parseInt(request.query.page ?? "0", 10);
      const rows = await db
        .select()
        .from(users)
        .limit(50)
        .offset(page * 50);

      return reply.send({
        users: rows.map(({ password: _pw, ...u }) => u),
      });
    }
  );

  // ─── GET /admin/user/:userId ──────────────────────────────────────────────
  fastify.get<{ Params: { userId: string } }>(
    "/user/:userId",
    { preHandler: requireWizard(fastify) },
    async (request, reply) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.params.userId))
        .limit(1);
      if (!user) return reply.status(404).send({ error: "user-not-found" });
      const { password: _pw, ...safeUser } = user;
      return reply.send({ user: safeUser });
    }
  );

  // ─── PATCH /admin/user/:userId ────────────────────────────────────────────
  fastify.patch<{ Params: { userId: string } }>(
    "/user/:userId",
    { preHandler: requireWizard(fastify) },
    async (request, reply) => {
      const data = z
        .object({
          name: z.string().optional(),
          username: z.string().optional(),
          email: z.string().email().optional(),
          role: z.string().optional(),
          bio: z.string().optional(),
          picture: z.string().optional(),
          profilenft: z.string().optional(),
          seniority: z.number().optional(),
          deactivated: z.boolean().optional(),
        })
        .parse(request.body);

      await db
        .update(users)
        .set(data)
        .where(eq(users.id, request.params.userId));

      return reply.send({ ok: true });
    }
  );

  // ─── PATCH /admin/user/:userId/reset-password ─────────────────────────────
  fastify.patch<{ Params: { userId: string } }>(
    "/user/:userId/reset-password",
    { preHandler: requireWizard(fastify) },
    async (request, reply) => {
      const { newPassword } = z
        .object({ newPassword: z.string() })
        .parse(request.body);

      await db
        .update(users)
        .set({ password: await argon2.hash(newPassword, ARGON2_OPTS) })
        .where(eq(users.id, request.params.userId));

      return reply.send({ ok: true });
    }
  );

  // ─── DELETE /admin/user/:userId/delete ───────────────────────────────────
  fastify.delete<{ Params: { userId: string } }>(
    "/user/:userId/delete",
    { preHandler: requireWizard(fastify) },
    async (request, reply) => {
      await db.delete(users).where(eq(users.id, request.params.userId));
      return reply.send({ ok: true });
    }
  );

  // ─── GET /admin/bots ──────────────────────────────────────────────────────
  fastify.get(
    "/bots",
    { preHandler: requireWizard(fastify) },
    async (_request, reply) => {
      const rows = await db.select().from(bots);
      return reply.send({ bots: rows });
    }
  );

  // ─── PATCH /admin/bots/:botId ─────────────────────────────────────────────
  fastify.patch<{ Params: { botId: string } }>(
    "/bots/:botId",
    { preHandler: requireWizard(fastify) },
    async (request, reply) => {
      const data = z
        .object({
          name: z.string().optional(),
          description: z.string().optional(),
          image: z.string().optional(),
          systemPrompt: z.string().optional(),
          defaultModel: z.string().optional(),
          price: z.number().optional(),
          deactivated: z.boolean().optional(),
          privacy: z.string().optional(),
        })
        .parse(request.body);

      await db
        .update(bots)
        .set(data)
        .where(eq(bots.id, request.params.botId));

      return reply.send({ ok: true });
    }
  );
}
