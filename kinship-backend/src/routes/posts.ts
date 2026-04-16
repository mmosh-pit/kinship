import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { posts } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

const postBody = z.object({
  header: z.string(),
  subHeader: z.string().optional(),
  body: z.string(),
  slug: z.string(),
  tags: z.array(z.string()).optional(),
  authors: z.array(z.string()).optional(),
});

export async function postRoutes(fastify: FastifyInstance) {
  // ─── GET /posts ────────────────────────────────────────────────────────────
  fastify.get(
    "/",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const rows = await db.select().from(posts);
      return reply.send({ posts: rows });
    }
  );

  // ─── GET /posts/slug?slug=<slug> ──────────────────────────────────────────
  // Go uses query param: GET /posts/slug?slug=my-post
  fastify.get<{ Querystring: { slug?: string } }>(
    "/slug",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { slug } = request.query;
      if (!slug) return reply.status(400).send({ error: "slug required" });

      const [post] = await db
        .select()
        .from(posts)
        .where(eq(posts.slug, slug))
        .limit(1);

      if (!post) return reply.status(404).send({ error: "post-not-found" });
      return reply.send({ post });
    }
  );

  // ─── GET /posts/author?username=<username> ────────────────────────────────
  fastify.get<{ Querystring: { username?: string } }>(
    "/author",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { username } = request.query;
      if (!username) return reply.status(400).send({ error: "username required" });

      // Filter posts where authors JSONB array contains the username
      const rows = await db
        .select()
        .from(posts)
        .where(sql`${posts.authors} @> ${JSON.stringify([username])}::jsonb`);

      return reply.send({ posts: rows });
    }
  );

  // ─── POST /posts ───────────────────────────────────────────────────────────
  fastify.post(
    "/",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = postBody.parse(request.body);
      const [post] = await db
        .insert(posts)
        .values({ id: crypto.randomUUID(), ...body })
        .returning();
      return reply.status(201).send({ post });
    }
  );
}
