import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { decryptData } from "@/utils/decryptData";

const isString = (v: any) => typeof v === "string";
const isNonEmptyString = (v: any) => isString(v) && v.trim().length > 0;
const isArray = (v: any) => Array.isArray(v);
const isObject = (v: any) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.com$/i.test(email);

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const errors: string[] = [];

    if (!isNonEmptyString(body.fullName)) {
      errors.push("First name is required");
    }

    if (body.fullName.length < 2 || body.fullName.length > 16) {
      errors.push("First name must be between 2 and 16 characters");
    }

    if (!isNonEmptyString(body.email) || !isValidEmail(body.email)) {
      errors.push("Valid email is required");
    }

    if (!isNonEmptyString(body.password)) {
      errors.push("Password is required");
    }

    if (!isNonEmptyString(body.password) || body.password.length < 6) {
      errors.push("Password must be at least 6 characters");
    }

    if (!isNonEmptyString(body.currentStep)) {
      errors.push("Current step is required");
    }

    if (!body.roles) {
      errors.push("Roles is required");
    } else if (!isArray(body.roles)) {
      errors.push("Roles must be an array");
    }

    if (!body.intent) {
      errors.push("Intent is required");
    } else if (!isArray(body.intent)) {
      errors.push("Intent must be an array");
    }

    if (
      body.likertAnswers === undefined ||
      (body.likertAnswers && Object.keys(body.likertAnswers).length < 48)
    ) {
      errors.push("Please rate all the questions in step5");
    }

    if (!body.challenges) {
      errors.push("Challenges is required");
    } else if (body.challenges.length < 3) {
      errors.push("Please select atleast 3 challenges");
    }

    if (!body.abilities) {
      errors.push("Abilities is required");
    } else if (body.abilities.length < 3) {
      errors.push("Please select atleast 3 abilities");
    }

    if (!body.aspirations) {
      errors.push("Aspirations is required");
    } else if (body.aspirations.length < 3) {
      errors.push("Please select atleast 3 aspirations");
    }

    if (!body.mobilePreference) {
      errors.push("Mobile preference is required");
    }

    if (!body.contactPreference) {
      errors.push("Contact preference is required");
    }

    if (body.mobileNumber && !isString(body.mobileNumber)) {
      errors.push("Invalid mobile number");
    }

    if (body.countryCode && !isString(body.countryCode)) {
      errors.push("Invalid country code");
    }

    if (!body.avatarUrl) {
      errors.push("Avater must be required");
    } else if (!isValidUrl(body.avatarUrl)) {
      errors.push("Avatar URL must be valid");
    }

    if (!isNonEmptyString(body.lastName)) {
      errors.push("Last name is required");
    }

    if (body.lastName.length < 2 || body.lastName.length > 16) {
      errors.push("Last name must be between 2 and 16 characters");
    }

    if (!isNonEmptyString(body.bio)) {
      errors.push("Bio is required");
    }

    if (body.bio.trim().length < 10 || body.bio.trim().length > 255) {
      errors.push("Bio must be between 10 and 255 characters.");
    }

    if (!body.web) {
      errors.push("Website URL is required");
    } else if (!isValidUrl(body.web)) {
      errors.push("Website URL must be valid");
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          status: false,
          message: errors[0],
          errors,
        },
        { status: 200 },
      );
    }

    const visitorCollection = db.collection("mmosh-app-visitor");
    const otpCollection = db.collection("email_verification");

    const hasVerified = await otpCollection.findOne({
      email: body.email.toLowerCase().trim(),
      hasVerifiedEmail: true,
      isMobileNumberVerified: true,
    });

    if (!hasVerified) {
      return NextResponse.json(
        {
          status: false,
          message: "Email or Mobile number not verified",
        },
        { status: 200 },
      );
    }

    const existingUser = await visitorCollection.findOne({
      email: body.email.toLowerCase(),
    });

    if (existingUser) {
      return NextResponse.json(
        {
          status: false,
          message: "User with this email already exists",
        },
        { status: 200 },
      );
    }
    const decryptedPassword = decryptData(body.password);
    const passwordHash = await bcrypt.hash(decryptedPassword, 10);

    const doc = {
      ...body,
      email: body.email.toLowerCase().trim(),
      fullName: body.fullName.trim(),
      lastName: isString(body.lastName) ? body.lastName.trim() : "",
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await visitorCollection.insertOne(doc);

    let filter: any = { email: body.email.toLowerCase().trim() };
    if (body.mobileNumber && body.countryCode) {
      filter = { mobile: body.mobileNumber, countryCode: body.countryCode };
    }

    await otpCollection.deleteMany({ email: body.email.toLowerCase().trim() });

    return NextResponse.json(
      {
        status: true,
        message: "Visitor saved successfully",
        result: {
          id: "result",
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: false,
        message: "Failed to save visitor",
      },
      { status: 500 },
    );
  }
}
