import type { FastifyInstance } from "fastify";

// GET /ai/realtime-token — mirrors pkg/ai/app/get_realtime_token.go
// Returns an ephemeral OpenAI Realtime session token for voice/RT features
export async function aiRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/ai/realtime-token",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const key = process.env.OPEN_AI_KEY;
      if (!key) return reply.status(500).send({ error: "OpenAI key not configured" });

      const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2025-06-03",
          voice: "verse",
        }),
      });

      if (!res.ok) return reply.status(401).send({ error: "unauthorized" });

      const data = await res.json();
      return reply.send(data);
    }
  );
}
