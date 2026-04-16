import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

// Registers @fastify/jwt and exposes a preHandler for protected routes.
//
// Usage on a route:
//   { preHandler: [fastify.authenticate] }
//
// Usage on a route prefix:
//   fastify.addHook('preHandler', fastify.authenticate)

async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(import("@fastify/jwt"), {
    secret: process.env.JWT_SECRET!,
  });

  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
      }
    }
  );
}

export default fp(authPlugin);

// Augment Fastify instance type
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
