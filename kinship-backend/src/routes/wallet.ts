import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { coinAddresses } from "../db/schema/index.js";

export async function walletRoutes(fastify: FastifyInstance) {
  // ─── GET /all-tokens — return all coin/token addresses ────────────────────
  fastify.get(
    "/all-tokens",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const rows = await db.select().from(coinAddresses);
      return reply.send({ tokens: rows });
    }
  );
}
