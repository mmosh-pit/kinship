import "./types/index.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";

import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { botRoutes } from "./routes/bots.js";
import { chatRoutes } from "./routes/chat.js";
import { postRoutes } from "./routes/posts.js";
import { subscriptionRoutes } from "./routes/subscriptions.js";
import { adminRoutes } from "./routes/admin.js";
import { walletRoutes } from "./routes/wallet.js";
import { mailRoutes } from "./routes/mail.js";
import { aiRoutes } from "./routes/ai.js";
import { socialRoutes } from "./routes/social.js";
import { connectionsRoutes } from "./routes/connections.js";
import { visitorsRoutes } from "./routes/visitors.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(helmet);
  await app.register(cors, {
    origin: "*",
    credentials: true,
  });
  await app.register(websocket);
  await app.register(authPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(botRoutes);
  await app.register(chatRoutes);
  await app.register(postRoutes, { prefix: "/posts" });
  await app.register(subscriptionRoutes);
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(walletRoutes);
  await app.register(mailRoutes);
  await app.register(aiRoutes);
  await app.register(socialRoutes);
  await app.register(connectionsRoutes, { prefix: "/connections" });
  await app.register(visitorsRoutes);

  return app;
}
