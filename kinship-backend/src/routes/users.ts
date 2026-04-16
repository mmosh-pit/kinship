import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { eq, ne, isNotNull, ilike, or, sql } from "drizzle-orm";

export async function userRoutes(fastify: FastifyInstance) {
  // ─── GET /members — paginated member directory ─────────────────────────────
  // Mirrors Go: pkg/members/db/get_members.go
  // Only returns users who have a profileNFT (full members)
  // Supports search by name or username, ordered by seniority DESC
  fastify.get<{ Querystring: { page?: string; search?: string } }>(
    "/members",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const page = parseInt(request.query.page ?? "0", 10);
      const search = request.query.search ?? "";
      const offset = page * 20;
      const { userId } = request.user;

      const rows = search
        ? await db
            .select({
              id: users.id,
              name: users.name,
              username: users.username,
              picture: users.picture,
              email: users.email,
              seniority: users.seniority,
            })
            .from(users)
            .where(
              sql`${users.id} != ${userId}
                AND ${users.profilenft} IS NOT NULL
                AND (${users.name} ILIKE ${`%${search}%`} OR ${users.username} ILIKE ${`%${search}%`})`
            )
            .orderBy(sql`${users.seniority} DESC`)
            .limit(20)
            .offset(offset)
        : await db
            .select({
              id: users.id,
              name: users.name,
              username: users.username,
              picture: users.picture,
              email: users.email,
              seniority: users.seniority,
            })
            .from(users)
            .where(
              sql`${users.id} != ${userId} AND ${users.profilenft} IS NOT NULL`
            )
            .orderBy(sql`${users.seniority} DESC`)
            .limit(20)
            .offset(offset);

      return reply.send({ members: rows });
    }
  );
}
