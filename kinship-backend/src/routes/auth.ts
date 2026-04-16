import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "../db/client.js";
import {
  users,
  emailVerification,
  earlyAccess,
  accountDeletionRequests,
} from "../db/schema/index.js";
import { eq, or } from "drizzle-orm";
import crypto from "crypto";
import { createWallet } from "../services/wallet.js";
import { sendVerificationCode, sendForgotPasswordCode, sendAccountDeletionNotification } from "../services/email.js";
import { sendKartraNotification } from "../services/kartra.js";
import { ok } from "../utils/response.js";

// Argon2id params matching the Go backend
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 * 1024
  timeCost: 3,
  parallelism: 2,
  hashLength: 32,
};

function generateCode(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

// AES-CBC encryption for private keys — mirrors pkg/common/utils/private_key_encryption.go
export function encryptPrivateKey(plaintext: string): string {
  const key = Buffer.from(process.env.SECRET_KEY!, "utf8").subarray(0, 32);
  const iv = Buffer.from(process.env.SECRET_IV!, "utf8").subarray(0, 16);
  const padLen = 16 - (plaintext.length % 16);
  const padded = Buffer.concat([
    Buffer.from(plaintext),
    Buffer.alloc(padLen, padLen),
  ]);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("hex");
}

export async function authRoutes(fastify: FastifyInstance) {
  // ─── POST /early — early access waitlist ──────────────────────────────────
  fastify.post(
    "/early",
    async (request, reply) => {
      const { name, email } = z
        .object({ name: z.string(), email: z.string().email() })
        .parse(request.body);

      const existing = await db
        .select({ id: earlyAccess.id })
        .from(earlyAccess)
        .where(eq(earlyAccess.email, email))
        .limit(1);

      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0 || existingUser.length > 0) {
        return reply.status(409).send({ error: "already-registered" });
      }

      await db.insert(earlyAccess).values({ name, email });

      // Fire and forget — non-blocking
      sendKartraNotification("kinship_bots_waitlist", name, "", email).catch(console.error);

      return reply.send({ ok: true });
    }
  );

  // ─── POST /request-code — signup email verification ───────────────────────
  // User must NOT yet exist. Sends a 6-digit code via email.
  fastify.post("/request-code", async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: "user-exists" });
    }

    const code = generateCode();

    // Deduplicate — retry if code already exists
    const dup = await db
      .select()
      .from(emailVerification)
      .where(eq(emailVerification.code, code))
      .limit(1);

    if (dup.length > 0) {
      // Simulate recursive retry by re-entering
      return reply.send(await sendNewCode(email));
    }

    await db.insert(emailVerification).values({ email, code });

    await sendVerificationCode(email, code);

    return reply.send({ ok: true });
  });

  // ─── POST /forgot-password-verification — request or verify reset code ────
  // No body.code → sends a code (user must exist)
  // With body.code + body.newPassword → verifies code and resets password
  fastify.post("/forgot-password-verification", async (request, reply) => {
    const body = z
      .union([
        z.object({ email: z.string().email() }),
        z.object({ email: z.string().email(), code: z.number(), newPassword: z.string() }),
      ])
      .parse(request.body);

    if (!("code" in body)) {
      // Send a reset code
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, body.email))
        .limit(1);

      if (!user) return reply.status(404).send({ error: "user-not-exists" });

      const code = generateCode();
      const dup = await db
        .select()
        .from(emailVerification)
        .where(eq(emailVerification.code, code))
        .limit(1);

      if (dup.length === 0) {
        await db.insert(emailVerification).values({ email: body.email, code });
        await sendForgotPasswordCode(body.email, code);
      }

      return reply.send({ ok: true });
    }

    // Verify code and reset password
    const [verification] = await db
      .select()
      .from(emailVerification)
      .where(eq(emailVerification.email, body.email))
      .limit(1);

    if (!verification || verification.code !== body.code) {
      return reply.status(400).send({ error: "invalid-code" });
    }

    const hashed = await argon2.hash(body.newPassword, ARGON2_OPTS);

    await db
      .update(users)
      .set({ password: hashed })
      .where(eq(users.email, body.email));

    await db
      .delete(emailVerification)
      .where(eq(emailVerification.email, body.email));

    return reply.send({ ok: true });
  });

  // ─── POST /signup ──────────────────────────────────────────────────────────
  fastify.post("/signup", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string(),
        name: z.string(),
        code: z.number(),
        from_bot: z.string().optional(),
      })
      .parse(request.body);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    if (existing) return reply.status(409).send({ error: "user-exists" });

    // Verify email code
    const [verification] = await db
      .select()
      .from(emailVerification)
      .where(eq(emailVerification.email, body.email))
      .limit(1);

    if (!verification || verification.code !== body.code) {
      return reply.status(400).send({ error: "invalid-code" });
    }

    await db.delete(emailVerification).where(eq(emailVerification.code, body.code));

    // Create wallet (non-blocking failure allowed — wallet may already exist)
    let address = "";
    try {
      address = await createWallet(body.email);
    } catch (err) {
      console.error("[signup] Wallet creation failed:", err);
    }

    const password = await argon2.hash(body.password, ARGON2_OPTS);
    const id = crypto.randomUUID();
    const bot = body.from_bot || "KIN";

    const [user] = await db
      .insert(users)
      .values({
        id,
        email: body.email,
        password,
        name: body.name,
        uuid: crypto.randomUUID(),
        wallet: address,
        picture: "https://storage.googleapis.com/mmosh-assets/default.png",
        role: "member",
        fromBot: bot,
        onboardingStep: 0,
      })
      .returning();

    const token = fastify.jwt.sign({ userId: id, email: body.email, role: "member" });

    const tag = bot === "FDN" ? "full_disclosure_bot" : "Kinship_Bots_Sign_Up";
    sendKartraNotification(tag, body.name, "", body.email).catch(console.error);

    const { password: _pw, ...safeUser } = user;
    return reply.status(201).send(ok({ token, user: safeUser }));
  });

  // ─── POST /login ───────────────────────────────────────────────────────────
  // `handle` accepts email or username (mirrors Go's GetUserByHandle)
  fastify.post("/login", async (request, reply) => {
    const { handle, password } = z
      .object({ handle: z.string(), password: z.string() })
      .parse(request.body);

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, handle), eq(users.username, handle)))
      .limit(1);

    if (!user) return reply.status(400).send({ error: "invalid-credentials" });

    const valid = await argon2.verify(user.password!, password);
    if (!valid) return reply.status(400).send({ error: "invalid-credentials" });

    if (user.deactivated) return reply.status(403).send({ error: "account-deactivated" });

    // Ensure wallet exists (idempotent)
    createWallet(user.email).catch(console.error);

    const token = fastify.jwt.sign({
      userId: user.id,
      email: user.email,
      role: user.role ?? "member",
    });

    const { password: _pw, ...safeUser } = user;
    return reply.send(ok({ token, user: safeUser }));
  });

  // ─── POST /change-password (authenticated) ────────────────────────────────
  fastify.post(
    "/change-password",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { oldPassword, newPassword } = z
        .object({ oldPassword: z.string(), newPassword: z.string() })
        .parse(request.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.user.userId))
        .limit(1);

      if (!user || !(await argon2.verify(user.password!, oldPassword))) {
        return reply.status(400).send({ error: "invalid-credentials" });
      }

      await db
        .update(users)
        .set({ password: await argon2.hash(newPassword, ARGON2_OPTS) })
        .where(eq(users.id, request.user.userId));

      return reply.send({ ok: true });
    }
  );

  // ─── GET /is-auth (authenticated) ─────────────────────────────────────────
  fastify.get(
    "/is-auth",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.user.userId))
        .limit(1);

      if (!user) return reply.status(404).send({ error: "user-not-found" });

      const { password: _pw, ...safeUser } = user;
      // Expose `ID` (uppercase) for middleware.ts compatibility: data?.data?.user?.ID
      return reply.send(ok({ is_auth: true, user: { ID: user.id, ...safeUser } }));
    }
  );

  // ─── DELETE|PUT /logout (authenticated) ──────────────────────────────────
  // JWT is stateless — client discards the token. Accepts both methods since the
  // Next.js proxy historically used PUT, but DELETE is the REST convention.
  const logoutHandler = async (_request: any, reply: any) => reply.send({ ok: true });
  fastify.delete("/logout", { preHandler: [fastify.authenticate] }, logoutHandler);
  fastify.put("/logout", { preHandler: [fastify.authenticate] }, logoutHandler);

  // ─── GET /address (authenticated) ─────────────────────────────────────────
  fastify.get(
    "/address",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const [user] = await db
        .select({ wallet: users.wallet })
        .from(users)
        .where(eq(users.id, request.user.userId))
        .limit(1);

      return reply.send({ address: user?.wallet ?? null });
    }
  );

  // ─── POST /sign (authenticated) — transaction signing via wallet service ──
  fastify.post(
    "/sign",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { transaction } = z
        .object({ transaction: z.string() })
        .parse(request.body);

      const baseUrl = process.env.WALLET_BACKEND_URL;
      const res = await fetch(`${baseUrl}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction, userId: request.user.userId }),
      });

      if (!res.ok) return reply.status(500).send({ error: "signing-failed" });

      const data = await res.json();
      return reply.send(data);
    }
  );

  // ─── PUT /referred (authenticated) ────────────────────────────────────────
  fastify.put(
    "/referred",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { user: referrerUsername } = z
        .object({ user: z.string() })
        .parse(request.body);

      const [referrer] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, referrerUsername))
        .limit(1);

      if (!referrer) return reply.status(404).send({ error: "user-not-found" });

      await db
        .update(users)
        .set({ referredBy: referrer.id })
        .where(eq(users.id, request.user.userId));

      return reply.send({ ok: true });
    }
  );

  // ─── PUT /onboarding-step (authenticated) ─────────────────────────────────
  fastify.put(
    "/onboarding-step",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { step } = z.object({ step: z.number().int() }).parse(request.body);
      await db
        .update(users)
        .set({ onboardingStep: step })
        .where(eq(users.id, request.user.userId));
      return reply.send({ ok: true });
    }
  );

  // ─── PUT /update-profile-data (authenticated) ─────────────────────────────
  fastify.put(
    "/update-profile-data",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const data = z
        .object({
          name: z.string().optional(),
          displayName: z.string().optional(),
          lastName: z.string().optional(),
          username: z.string().optional(),
          bio: z.string().optional(),
          picture: z.string().optional(),
          banner: z.string().optional(),
          websites: z.array(z.unknown()).optional(),
          symbol: z.string().optional(),
          link: z.string().optional(),
          isPrivate: z.boolean().optional(),
          profilenft: z.string().optional(),
          seniority: z.number().optional(),
        })
        .parse(request.body);

      await db
        .update(users)
        .set(data)
        .where(eq(users.id, request.user.userId));

      return reply.send({ ok: true });
    }
  );

  // ─── POST /bluesky (authenticated) ────────────────────────────────────────
  fastify.post(
    "/bluesky",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { handle, password } = z
        .object({ handle: z.string(), password: z.string() })
        .parse(request.body);

      // Validate Bluesky credentials against AT Protocol
      const valid = await isValidBlueskyConnection(handle, password);
      if (!valid) return reply.status(400).send({ error: "invalid-bluesky" });

      await db
        .update(users)
        .set({ bluesky: { handle, password } })
        .where(eq(users.id, request.user.userId));

      return reply.send({ ok: true });
    }
  );

  // ─── DELETE /bluesky (authenticated) ──────────────────────────────────────
  fastify.delete(
    "/bluesky",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      await db
        .update(users)
        .set({ bluesky: null })
        .where(eq(users.id, request.user.userId));
      return reply.send({ ok: true });
    }
  );

  // ─── POST /telegram (authenticated) ───────────────────────────────────────
  fastify.post(
    "/telegram",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const data = z
        .object({
          id: z.number(),
          firstName: z.string().optional(),
          username: z.string().optional(),
        })
        .parse(request.body);

      await db
        .update(users)
        .set({ telegram: data })
        .where(eq(users.id, request.user.userId));

      return reply.send({ ok: true });
    }
  );

  // ─── DELETE /telegram (authenticated) ─────────────────────────────────────
  fastify.delete(
    "/telegram",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      await db
        .update(users)
        .set({ telegram: null })
        .where(eq(users.id, request.user.userId));
      return reply.send({ ok: true });
    }
  );

  // ─── POST /reset-password ─────────────────────────────────────────────────
  // Takes { code, password } — looks up email from the verification code, then
  // resets the password. Mirrors the Next.js /api/reset-password route.
  fastify.post("/reset-password", async (request, reply) => {
    const { code, password } = z
      .object({ code: z.number().int(), password: z.string() })
      .parse(request.body);

    const [verification] = await db
      .select()
      .from(emailVerification)
      .where(eq(emailVerification.code, code))
      .limit(1);

    if (!verification) return reply.status(400).send({ error: "invalid-code" });

    const hashed = await argon2.hash(password, ARGON2_OPTS);

    await db
      .update(users)
      .set({ password: hashed })
      .where(eq(users.email, verification.email));

    await db
      .delete(emailVerification)
      .where(eq(emailVerification.id, verification.id));

    return reply.send({ ok: true });
  });

  // ─── GET /check-username ──────────────────────────────────────────────────
  // Returns true if the username is already taken, false otherwise.
  fastify.get("/check-username", async (request, reply) => {
    const { username } = z
      .object({ username: z.string() })
      .parse(request.query as Record<string, string>);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return reply.send(!!existing);
  });

  // ─── GET /is-admin ────────────────────────────────────────────────────────
  // Returns { result: boolean } — checks if the wallet's owner has role "wizard".
  fastify.get("/is-admin", async (request, reply) => {
    const { wallet } = z
      .object({ wallet: z.string() })
      .parse(request.query as Record<string, string>);

    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.wallet, wallet))
      .limit(1);

    return reply.send({ result: user?.role === "wizard" });
  });

  // ─── POST /account-deletion ────────────────────────────────────────────────
  fastify.post("/account-deletion", async (request, reply) => {
    const body = z
      .object({
        name: z.string(),
        email: z.string().email(),
        reason: z.string().optional(),
      })
      .parse(request.body);

    const existing = await db
      .select({ id: accountDeletionRequests.id })
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.email, body.email))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(accountDeletionRequests).values(body);
      await sendAccountDeletionNotification(body.email, body.reason ?? "");
    }

    return reply.send({ ok: true });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendNewCode(email: string): Promise<{ ok: boolean }> {
  const code = generateCode();
  await db.insert(emailVerification).values({ email, code });
  await sendVerificationCode(email, code);
  return { ok: true };
}

async function isValidBlueskyConnection(
  identifier: string,
  password: string
): Promise<boolean> {
  if (!identifier || !password) return false;
  try {
    const res = await fetch(
      "https://bsky.social/xrpc/com.atproto.server.createSession",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
