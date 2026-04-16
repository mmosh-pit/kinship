import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

interface UserRegistrationBody {
  fullName: string;
  email: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const validation = validateRequestBody(body);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          status: false,
          message: "Validation failed",
          errors: validation.errors,
          result: null,
        },
        { status: 400 },
      );
    }

    const { fullName, email } = validation.data!;

    const collection = db.collection("mmosh-app-visitor");
    const existingUser = await collection.findOne({ email });

    if (existingUser) {
      return NextResponse.json(
        {
          status: false,
          message: "User with this email already exists",
          result: null,
        },
        { status: 409 },
      );
    }

    // Generate OTP
    const otp = generateSecureOTP();
    const hashedOTP = await bcrypt.hash(otp, 10);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Insert user
    const userDocument = {
      fullName,
      email,
      status: "pending_email_verification",
      otpHash: hashedOTP,
      roles: [],
      mobilePreference: [],
      intent: [],
      contactPreference: [],
      currentStep: "catfawn/step2",
      mobileNumber: null,
      telegramUsername: null,
      blueskyHandle: null,
      linkedinProfile: null,
      referedKinshipCode: null,
      kinshipCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt,
    };

    const result = await collection.insertOne(userDocument);

    // Send OTP Email via Mailjet
    // await sendCodeEmail(email, otp);
    console.log("=========== OTP CHANGE ============", otp);

    return NextResponse.json(
      {
        status: true,
        message: "User registered successfully. OTP sent to email.",
        result: {
          userId: result.insertedId,
          email,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in registration:", error);

    return NextResponse.json(
      { status: false, message: "Internal server error", result: null },
      { status: 500 },
    );
  }
}

async function sendCodeEmail(email: string, code: string) {
  const msg = {
    to: email,
    from: {
      email: "security@kinship.systems",
      name: "Kinship Intelligence",
    },
    subject: "Your Verification Code",
    html: `
      Hey there,<br /><br />
      Here is your verification code to complete your early access registration:<br /><br />
      <strong style="font-size: 22px; letter-spacing: 3px;">${code}</strong><br /><br />
      This code is valid for the next 15 minutes.<br /><br />
      Thank you for joining the Kinship Intelligence Early Access Circle!<br /><br />
      Warm regards,<br />
      <strong>Kinship Team</strong>
    `,
  };

  await sgMail.send(msg);
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateSecureOTP(): string {
  const buffer = crypto.randomBytes(6);
  const randomNumber = buffer.readUInt32BE(0);
  return ((randomNumber % 900000) + 100000).toString();
}

function validateRequestBody(body: any): {
  isValid: boolean;
  errors: string[];
  data?: UserRegistrationBody;
} {
  const errors: string[] = [];

  if (!body.fullName || typeof body.fullName !== "string") {
    errors.push("fullName is required and must be a string");
  } else if (body.fullName.trim().length < 2) {
    errors.push("fullName must be at least 2 characters long");
  }

  if (!body.email || typeof body.email !== "string") {
    errors.push("email is required and must be a string");
  } else if (!isValidEmail(body.email)) {
    errors.push("email must be valid");
  }

  if (errors.length) return { isValid: false, errors };

  return {
    isValid: true,
    errors: [],
    data: {
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
    },
  };
}
