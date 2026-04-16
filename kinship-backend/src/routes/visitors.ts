import type { FastifyInstance } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "../db/client.js";
import {
  visitors,
  visitorOtps,
  earlyAccessUsers,
  users,
} from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import { createWallet } from "../services/wallet.js";

const ARGON2_USERS_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 2,
  hashLength: 32,
};

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

function getTwilioClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );
}

// AES-CBC decrypt — mirrors the Next.js decryptData utility
function decryptData(data: string): string {
  try {
    const key = crypto
      .createHash("sha512")
      .update(process.env.SECRET_KEY!)
      .digest("hex")
      .substring(0, 32);
    const iv = crypto
      .createHash("sha512")
      .update(process.env.SECRET_IV!)
      .digest("hex")
      .substring(0, 16);
    const decipher = crypto.createDecipheriv(
      process.env.ENCRYPTION_METHOD ?? "aes-256-cbc",
      key,
      iv,
    );
    const hex = Buffer.from(data, "base64").toString("hex");
    return decipher.update(hex, "hex", "utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
}

function generateSecureOTP(): string {
  const randomNumber = crypto.randomBytes(6).readUInt32BE(0);
  return ((randomNumber % 900000) + 100000).toString();
}

async function sendOTPEmail(email: string, otp: string) {
  await sgMail.send({
    to: email,
    from: { email: "security@kinship.systems", name: "Kinship Intelligence" },
    subject: "Your Verification Code",
    html: `Hello,<br/><br/>Your verification code is:<br/><br/><strong style="font-size:22px;letter-spacing:3px;">${otp}</strong><br/><br/>This code is valid for 15 minutes.<br/><br/>— Kinship Team`,
  });
}

async function sendOTPSMS(
  mobile: string,
  countryCode: string,
  otp: string,
): Promise<boolean> {
  try {
    await getTwilioClient().messages.create({
      body: `Your Kinship Intelligence verification code is ${otp}. It expires in 15 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: `+${countryCode}${mobile}`,
    });
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function visitorsRoutes(fastify: FastifyInstance) {
  // ─── POST /visitors — register visitor ────────────────────────────────────
  fastify.post("/visitors", async (request, reply) => {
    const { firstName, email } = z
      .object({ firstName: z.string().min(2), email: z.string().email() })
      .parse(request.body);

    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.email, normalizedEmail))
      .limit(1);
    if (existing) {
      return reply.status(409).send({
        status: false,
        message: "User with this email already exists",
        result: null,
      });
    }

    const otp = generateSecureOTP();
    const otpHash = await argon2.hash(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db
      .insert(visitorOtps)
      .values({ email: normalizedEmail, otpHash, expiresAt });
    await db.insert(visitors).values({
      id: crypto.randomUUID(),
      firstName: firstName.trim(),
      email: normalizedEmail,
      status: "pending_email_verification",
      currentStep: "catfawn/step2",
    });

    console.log("=========== OTP ============", otp);

    return reply.status(201).send({
      status: true,
      message: "User registered successfully. OTP sent to email.",
      result: { email: normalizedEmail },
    });
  });

  // ─── POST /visitors/generate-otp ──────────────────────────────────────────
  fastify.post("/visitors/generate-otp", async (request, reply) => {
    const body = z
      .union([
        z.object({ type: z.literal("email"), email: z.string().email() }),
        z.object({
          type: z.literal("sms"),
          mobile: z.string(),
          countryCode: z.string(),
          email: z.string().email().optional(),
        }),
      ])
      .parse(request.body);

    if (body.type === "email") {
      const email = body.email.toLowerCase().trim();
      const [existing] = await db
        .select({ id: visitors.id })
        .from(visitors)
        .where(eq(visitors.email, email))
        .limit(1);
      if (existing)
        return reply.send({
          status: false,
          message: "Email already exists",
          result: null,
        });
    }

    if (body.type === "sms") {
      const [existing] = await db
        .select({ id: visitors.id })
        .from(visitors)
        .where(eq(visitors.mobileNumber, body.mobile.trim()))
        .limit(1);
      if (existing)
        return reply.send({
          status: false,
          message: "Mobile number already exists",
          result: null,
        });
    }

    const [existingOtp] = await db
      .select()
      .from(visitorOtps)
      .where(
        body.type === "email"
          ? eq(visitorOtps.email, body.email.toLowerCase().trim())
          : eq(visitorOtps.mobile, body.mobile.trim()),
      )
      .limit(1);

    if (existingOtp?.expiresAt && new Date() < existingOtp.expiresAt) {
      const remaining = Math.ceil(
        (existingOtp.expiresAt.getTime() - Date.now()) / 60000,
      );
      return reply.send({
        status: true,
        message:
          body.type === "email"
            ? "OTP already sent. Please check your email."
            : "OTP already sent. Please check your phone message.",
        result: {
          destination: body.type === "email" ? body.email : body.mobile,
          expiresInMinutes: remaining,
        },
      });
    }

    const otp = generateSecureOTP();
    const otpHash = await argon2.hash(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    console.log("Saving OTP Hash: ", otpHash);
    console.log("OTP being saved: ", otp);

    if (body.type === "email") {
      const email = body.email.toLowerCase().trim();
      await sendOTPEmail(email, otp);
      if (existingOtp) {
        await db
          .update(visitorOtps)
          .set({ otpHash, expiresAt, updatedAt: new Date() })
          .where(eq(visitorOtps.id, existingOtp.id));
      } else {
        await db.insert(visitorOtps).values({ email, otpHash, expiresAt });
      }
    }

    if (body.type === "sms") {
      const sent = await sendOTPSMS(
        body.mobile.trim(),
        body.countryCode.trim(),
        otp,
      );
      if (!sent)
        return reply.send({
          status: false,
          message: "Failed to send OTP via SMS",
          result: null,
        });

      const email = body.email?.toLowerCase().trim();
      if (existingOtp) {
        await db
          .update(visitorOtps)
          .set({
            otpHash,
            expiresAt,
            mobile: body.mobile.trim(),
            email,
            updatedAt: new Date(),
          })
          .where(eq(visitorOtps.id, existingOtp.id));
      } else {
        await db
          .insert(visitorOtps)
          .values({ mobile: body.mobile.trim(), email, otpHash, expiresAt });
      }
    }

    return reply.send({
      status: true,
      message: `OTP sent successfully via ${body.type}`,
      result: {
        destination: body.type === "email" ? body.email : body.mobile,
        expiresInMinutes: 15,
      },
    });
  });

  // ─── POST /visitors/resend-otp ─────────────────────────────────────────────
  fastify.post("/visitors/resend-otp", async (request, reply) => {
    const body = z
      .union([
        z.object({ type: z.literal("email"), email: z.string().email() }),
        z.object({
          type: z.literal("sms"),
          mobile: z.string(),
          countryCode: z.string(),
          email: z.string().email().optional(),
        }),
      ])
      .parse(request.body);

    const [existingOtp] = await db
      .select()
      .from(visitorOtps)
      .where(
        body.type === "email"
          ? eq(visitorOtps.email, body.email.toLowerCase().trim())
          : eq(visitorOtps.mobile, body.mobile.trim()),
      )
      .limit(1);

    if (existingOtp?.expiresAt && new Date() < existingOtp.expiresAt) {
      const remaining = Math.ceil(
        (existingOtp.expiresAt.getTime() - Date.now()) / 60000,
      );
      return reply.send({
        status: true,
        code: "OTP_ALREADY_SENT",
        message:
          body.type === "email"
            ? "OTP already sent. Please check your email."
            : "OTP already sent. Please check your phone messages.",
        result: {
          destination: body.type === "email" ? body.email : body.mobile,
          expiresInMinutes: remaining,
        },
      });
    }

    const otp = generateSecureOTP();
    const otpHash = await argon2.hash(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    if (body.type === "email") {
      const email = body.email.toLowerCase().trim();
      if (existingOtp) {
        await db
          .update(visitorOtps)
          .set({ otpHash, expiresAt, updatedAt: new Date() })
          .where(eq(visitorOtps.id, existingOtp.id));
      } else {
        await db.insert(visitorOtps).values({ email, otpHash, expiresAt });
      }
      await sendOTPEmail(email, otp);
    }

    if (body.type === "sms") {
      const email = body.email?.toLowerCase().trim();
      if (existingOtp) {
        await db
          .update(visitorOtps)
          .set({
            otpHash,
            expiresAt,
            mobile: body.mobile.trim(),
            email,
            updatedAt: new Date(),
          })
          .where(eq(visitorOtps.id, existingOtp.id));
      } else {
        await db
          .insert(visitorOtps)
          .values({ mobile: body.mobile.trim(), email, otpHash, expiresAt });
      }
      const sent = await sendOTPSMS(
        body.mobile.trim(),
        body.countryCode.trim(),
        otp,
      );
      if (!sent)
        return reply.send({
          status: false,
          message: "Failed to send OTP via SMS",
          result: null,
        });
    }

    return reply.send({
      status: true,
      code: "OTP_SENT",
      message: `OTP resent successfully via ${body.type}`,
      result: {
        destination: body.type === "email" ? body.email : body.mobile,
        expiresInMinutes: 15,
      },
    });
  });

  // ─── POST /visitors/verify-otp ─────────────────────────────────────────────
  fastify.post("/visitors/verify-otp", async (request, reply) => {
    const { email, mobile, otp, type } = z
      .object({
        email: z.string().email().optional(),
        mobile: z.string().optional(),
        otp: z.string().regex(/^\d{6}$/),
        type: z.enum(["email", "sms"]).optional(),
      })
      .parse(request.body);

    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedMobile = mobile;

    const [record] =
      type === "email"
        ? await db
          .select()
          .from(visitorOtps)
          .where(eq(visitorOtps.email, normalizedEmail!))
          .limit(1)
        : await db
          .select()
          .from(visitorOtps)
          .where(eq(visitorOtps.mobile, normalizedMobile!))
          .limit(1);

    if (!record)
      return reply.send({
        status: false,
        message: "Invalid OTP",
        result: null,
      });

    if (!record.otpHash || !record.expiresAt) {
      await db.delete(visitorOtps).where(eq(visitorOtps.id, record.id));
      return reply.send({
        status: false,
        message: "OTP data is invalid or missing",
        result: null,
      });
    }

    if (new Date() > record.expiresAt) {
      await db.delete(visitorOtps).where(eq(visitorOtps.id, record.id));
      return reply.send({
        status: false,
        message: "OTP has expired. Please request a new one.",
        result: null,
      });
    }

    const isValid = await argon2.verify(record.otpHash, otp);
    console.log("Validating otp with hash: ", record.otpHash);
    console.log("OTP to validate: ", otp);
    if (!isValid)
      return reply.send({
        status: false,
        message: "Invalid OTP",
        result: null,
      });

    const update =
      type === "sms"
        ? { isMobileNumberVerified: true }
        : { hasVerifiedEmail: true };
    await db
      .update(visitorOtps)
      .set(update)
      .where(eq(visitorOtps.id, record.id));

    return reply.send({
      status: true,
      message: "OTP verified successfully",
      result: { email: normalizedEmail, isVerified: true },
    });
  });

  // ─── POST /visitors/has-code-exist ────────────────────────────────────────
  fastify.post("/visitors/has-code-exist", async (request, reply) => {
    const { code } = z.object({ code: z.string() }).parse(request.body);

    const [existing] = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.kinshipCode, code.trim()))
      .limit(1);

    return reply.send({ status: true, result: { exists: !!existing } });
  });

  // ─── POST /visitors/save — full profile ───────────────────────────────────
  fastify.post("/visitors/save", async (request, reply) => {
    const body = z
      .object({
        firstName: z.string().min(2).max(16),
        lastName: z.string().min(2).max(16),
        email: z.string().email(),
        password: z.string().min(1),
        currentStep: z.string().min(1),
        roles: z.array(z.string()),
        intent: z.array(z.string()),
        mobilePreference: z.unknown(),
        contactPreference: z.unknown(),
        likertAnswers: z
          .record(z.string())
          .refine(
            (a) => Object.keys(a).length >= 48,
            "Please rate all questions in step5",
          ),
        challenges: z
          .array(z.string())
          .min(3, "Please select at least 3 challenges"),
        abilities: z
          .array(z.string())
          .min(3, "Please select at least 3 abilities"),
        aspirations: z
          .array(z.string())
          .min(3, "Please select at least 3 aspirations"),
        avatarUrl: z.string().url(),
        bio: z.string().min(10).max(255),
        web: z.string().url(),
        mobileNumber: z.string().optional(),
        countryCode: z.string().optional(),
      })
      .parse(request.body);

    const normalizedEmail = body.email.toLowerCase().trim();

    const [verified] = await db
      .select()
      .from(visitorOtps)
      .where(eq(visitorOtps.email, normalizedEmail))
      .limit(1);

    if (!verified?.hasVerifiedEmail || !verified.isMobileNumberVerified) {
      return reply.send({
        status: false,
        message: "Email or Mobile number not verified",
      });
    }

    const [existing] = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.email, normalizedEmail))
      .limit(1);
    if (existing)
      return reply.send({
        status: false,
        message: "User with this email already exists",
      });

    const decrypted = decryptData(body.password);
    const passwordHash = await argon2.hash(decrypted);

    await db.insert(visitors).values({
      id: crypto.randomUUID(),
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: normalizedEmail,
      passwordHash,
      bio: body.bio.trim(),
      web: body.web.trim(),
      avatar: body.avatarUrl,
      roles: body.roles,
      intent: body.intent,
      mobilePreference: body.mobilePreference,
      contactPreference: body.contactPreference,
      likertAnswers: body.likertAnswers,
      challenges: body.challenges,
      abilities: body.abilities,
      aspirations: body.aspirations,
      currentStep: body.currentStep,
      mobileNumber: body.mobileNumber,
      countryCode: body.countryCode,
    });

    await db.delete(visitorOtps).where(eq(visitorOtps.email, normalizedEmail));

    return reply.status(201).send({
      status: true,
      message: "Visitor saved successfully",
      result: { id: "result" },
    });
  });

  // ─── POST /visitors/upsert-early-access — progressive partial save ─────────
  fastify.post("/visitors/upsert-early-access", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        firstName: z.string().min(1).optional(),
        hasChecked: z.boolean().optional(),
        hasVerifiedEmail: z.boolean().optional(),
        isMobileNumberVerified: z.boolean().optional(),
        mobileNumber: z.string().nullable().optional(),
        countryCode: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        mobilePreferences: z.array(z.string()).optional(),
        currentStep: z.string().optional(),
        password: z.string().optional(),
      })
      .parse(request.body);

    const normalizedEmail = body.email.toLowerCase().trim();
    const now = new Date();

    const insertValues: Record<string, unknown> = {
      id: crypto.randomBytes(12).toString("hex"),
      email: normalizedEmail,
      updatedAt: now,
    };
    const updateSet: Record<string, unknown> = { updatedAt: now };

    if (body.firstName !== undefined) {
      insertValues.firstName = body.firstName.trim();
      updateSet.firstName = body.firstName.trim();
    }
    if (body.hasChecked !== undefined) {
      insertValues.hasChecked = body.hasChecked;
      updateSet.hasChecked = body.hasChecked;
    }
    if (body.hasVerifiedEmail !== undefined) {
      insertValues.hasVerifiedEmail = body.hasVerifiedEmail;
      updateSet.hasVerifiedEmail = body.hasVerifiedEmail;
    }
    if (body.isMobileNumberVerified !== undefined) {
      insertValues.isMobileNumberVerified = body.isMobileNumberVerified;
      updateSet.isMobileNumberVerified = body.isMobileNumberVerified;
    }
    if (body.mobileNumber !== undefined) {
      insertValues.mobileNumber = body.mobileNumber;
      updateSet.mobileNumber = body.mobileNumber;
    }
    if (body.countryCode !== undefined) {
      insertValues.countryCode = body.countryCode;
      updateSet.countryCode = body.countryCode;
    }
    if (body.country !== undefined) {
      insertValues.country = body.country;
      updateSet.country = body.country;
    }
    if (body.mobilePreferences !== undefined) {
      insertValues.mobilePreferences = body.mobilePreferences;
      updateSet.mobilePreferences = body.mobilePreferences;
    }
    if (body.currentStep !== undefined) {
      insertValues.currentStep = body.currentStep;
      updateSet.currentStep = body.currentStep;
    }
    if (body.password) {
      const decrypted = decryptData(body.password);
      if (decrypted) {
        const passwordHash = await argon2.hash(decrypted);
        insertValues.passwordHash = passwordHash;
        updateSet.passwordHash = passwordHash;
      }
    }

    await db
      .insert(earlyAccessUsers)
      .values(insertValues as typeof earlyAccessUsers.$inferInsert)
      .onConflictDoUpdate({
        target: earlyAccessUsers.email,
        set: updateSet as any,
      });

    return reply.send({ status: true, message: "Early access data saved" });
  });

  // ─── POST /visitors/save-early-access ─────────────────────────────────────
  fastify.post("/visitors/save-early-access", async (request, reply) => {
    const body = z
      .object({
        fullName: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(1),
        currentStep: z.string().min(1),
        hasChecked: z.boolean().optional(),
        hasVerifiedEmail: z.boolean().optional(),
        isMobileNumberVerified: z.boolean().optional(),
        mobileNumber: z.string().nullable().optional(),
        countryCode: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        mobilePreferences: z.array(z.string()).optional(),
        referedKinshipCode: z.string().optional(),
        noCodeChecked: z.boolean().optional(),
        about: z.string().nullable().optional(),
      })
      .parse(request.body);

    const normalizedEmail = body.email.toLowerCase().trim();

    const decrypted = decryptData(body.password);
    const passwordHash = await argon2.hash(decrypted);

    const values = {
      id: crypto.randomBytes(12).toString("hex"),
      firstName: body.fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      hasChecked: body.hasChecked ?? false,
      hasVerifiedEmail: body.hasVerifiedEmail ?? false,
      isMobileNumberVerified: body.isMobileNumberVerified ?? false,
      mobileNumber: body.mobileNumber ?? null,
      countryCode: body.countryCode ?? null,
      country: body.country ?? null,
      mobilePreferences: body.mobilePreferences ?? [],
      referredKinshipCode: body.referedKinshipCode ?? "",
      noCodeChecked: body.noCodeChecked ?? false,
      about: body.about ?? null,
      currentStep: body.currentStep,
      updatedAt: new Date(),
    };

    await db
      .insert(earlyAccessUsers)
      .values(values)
      .onConflictDoUpdate({
        target: earlyAccessUsers.email,
        set: {
          firstName: values.firstName,
          passwordHash: values.passwordHash,
          hasChecked: values.hasChecked,
          hasVerifiedEmail: values.hasVerifiedEmail,
          isMobileNumberVerified: values.isMobileNumberVerified,
          mobileNumber: values.mobileNumber,
          countryCode: values.countryCode,
          country: values.country,
          mobilePreferences: values.mobilePreferences,
          referredKinshipCode: values.referredKinshipCode,
          noCodeChecked: values.noCodeChecked,
          about: values.about,
          currentStep: values.currentStep,
          updatedAt: values.updatedAt,
        },
      });

    // Create or retrieve the user account and issue a JWT
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    let token: string;
    let safeUser: Record<string, unknown>;

    if (existingUser) {
      const { password: _pw, ...safe } = existingUser;
      safeUser = safe as Record<string, unknown>;
      token = fastify.jwt.sign({
        userId: existingUser.id,
        email: existingUser.email,
        role: existingUser.role ?? "member",
      });
    } else {
      let address = "";
      try {
        address = await createWallet(normalizedEmail);
      } catch (err) {
        console.error("[save-early-access] Wallet creation failed:", err);
      }

      const userPassword = await argon2.hash(decrypted, ARGON2_USERS_OPTS);
      const userId = crypto.randomUUID();

      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          email: normalizedEmail,
          password: userPassword,
          name: body.fullName.trim(),
          uuid: crypto.randomUUID(),
          wallet: address,
          picture: "https://storage.googleapis.com/mmosh-assets/default.png",
          role: "member",
          fromBot: "KIN",
          onboardingStep: 0,
        })
        .returning();

      token = fastify.jwt.sign({
        userId,
        email: normalizedEmail,
        role: "member",
      });
      const { password: _pw, ...safe } = newUser;
      safeUser = safe as Record<string, unknown>;
    }

    return reply.status(201).send({ status: true, token, user: safeUser });
  });

  // ─── PATCH /visitors/update-visitors ──────────────────────────────────────
  fastify.patch("/visitors/update-visitors", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        currentStep: z.string().min(1),
        roles: z.array(z.string()).optional(),
        mobilePreference: z.array(z.string()).optional(),
        intent: z.array(z.string()).optional(),
        contactPreference: z.array(z.string()).optional(),
        mobileNumber: z.string().min(8).optional(),
        telegramUsername: z.string().optional(),
        blueskyHandle: z.string().optional(),
        linkedinProfile: z.string().optional(),
        likertAnswers: z.record(z.string()).optional(),
        challenges: z.array(z.string()).optional(),
        abilities: z.array(z.string()).optional(),
        aspirations: z.array(z.string()).optional(),
        referedKinshipCode: z
          .string()
          .regex(/^[A-Za-z0-9]{6}$/)
          .optional(),
        kinshipCode: z
          .string()
          .regex(/^[A-Za-z0-9]{3,20}$/)
          .optional(),
        avatar: z.string().url().optional(),
        lastName: z.string().optional(),
        bio: z.string().optional(),
        web: z.string().url().optional(),
      })
      .parse(request.body);

    const normalizedEmail = body.email.toLowerCase().trim();

    const [visitor] = await db
      .select()
      .from(visitors)
      .where(eq(visitors.email, normalizedEmail))
      .limit(1);
    if (!visitor)
      return reply
        .status(404)
        .send({ status: false, message: "User not found", result: null });

    if (body.kinshipCode) {
      const [taken] = await db
        .select({ id: visitors.id })
        .from(visitors)
        .where(eq(visitors.kinshipCode, body.kinshipCode))
        .limit(1);
      if (taken) {
        return reply.status(409).send({
          status: false,
          message: "This Kinship Code is already taken. Please choose another.",
          result: null,
        });
      }
    }

    const update: Record<string, unknown> = {
      currentStep: body.currentStep,
      updatedAt: new Date(),
    };

    if (body.roles !== undefined) update.roles = body.roles;
    if (body.mobilePreference !== undefined)
      update.mobilePreference = body.mobilePreference;
    if (body.intent !== undefined) update.intent = body.intent;
    if (body.contactPreference !== undefined)
      update.contactPreference = body.contactPreference;
    if (body.mobileNumber !== undefined)
      update.mobileNumber = body.mobileNumber;
    if (body.telegramUsername !== undefined)
      update.telegramUsername = body.telegramUsername;
    if (body.blueskyHandle !== undefined)
      update.blueskyHandle = body.blueskyHandle;
    if (body.linkedinProfile !== undefined)
      update.linkedinProfile = body.linkedinProfile;
    if (body.challenges !== undefined) update.challenges = body.challenges;
    if (body.abilities !== undefined) update.abilities = body.abilities;
    if (body.aspirations !== undefined) update.aspirations = body.aspirations;
    if (body.referedKinshipCode !== undefined)
      update.referedKinshipCode = body.referedKinshipCode;
    if (body.kinshipCode !== undefined) update.kinshipCode = body.kinshipCode;
    if (body.avatar !== undefined) update.avatar = body.avatar;
    if (body.lastName !== undefined) update.lastName = body.lastName.trim();
    if (body.bio !== undefined) update.bio = body.bio.trim();
    if (body.web !== undefined) update.web = body.web.trim();
    if (body.likertAnswers !== undefined) {
      update.likertAnswers = {
        ...((visitor.likertAnswers as object) ?? {}),
        ...body.likertAnswers,
      };
    }

    // Step 12: send SMS OTP for mobile verification
    if (body.currentStep === "catfawn/step12" && body.mobileNumber) {
      const otp = generateSecureOTP();
      update.status = "pending_mobile_verification";
      const otpHash = await argon2.hash(otp);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.insert(visitorOtps).values({
        email: normalizedEmail,
        mobile: body.mobileNumber,
        otpHash,
        expiresAt,
      });
      await sendOTPSMS(body.mobileNumber, visitor.countryCode ?? "1", otp);
    }

    await db
      .update(visitors)
      .set(update)
      .where(eq(visitors.email, normalizedEmail));

    return reply.send({
      status: true,
      message: "User updated successfully",
      result: { email: normalizedEmail },
    });
  });
}
