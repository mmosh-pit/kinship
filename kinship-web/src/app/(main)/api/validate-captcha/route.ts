import { db } from "@/app/(main)/lib/mongoClient";
import { RecaptchaEnterpriseServiceClient } from "@google-cloud/recaptcha-enterprise";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Create the reCAPTCHA client.
  // TODO: Cache the client generation code (recommended) or call client.close() before exiting the method.

  const collection = db.collection("users");

  const { token, wallet } = await req.json();

  const { projectID, recaptchaKey } = {
    projectID: process.env.NEXT_PUBLIC_PROJECT_ID!,
    recaptchaKey: process.env.NEXT_PUBLIC_RECAPTCHA_KEY!,
  };

  const client = new RecaptchaEnterpriseServiceClient({
    credentials: {
      client_email: process.env.CLIENT_EMAIL,
      client_secret: "",
      client_id: process.env.CLIENT_ID,
      private_key: process.env.PRIVATE_KEY!.split(String.raw`\n`).join("\n"),
      private_key_id: process.env.PRIVATE_KEY_ID,
      type: "service_account",
      universe_domain: "googleapis.com",
    },
    projectId: projectID,
  });
  const projectPath = client.projectPath(projectID);

  // Build the assessment request.
  const request = {
    assessment: {
      event: {
        token: token,
        siteKey: recaptchaKey,
      },
    },
    parent: projectPath,
  };

  const [response] = await client.createAssessment(request);

  // Check if the token is valid.
  if (!response.tokenProperties?.valid) {
    return NextResponse.json("", { status: 400 });
  }

  // Check if the expected action was executed.
  // The `action` property is set by user client in the grecaptcha.enterprise.execute() method.

  const user = await collection.findOne({
    wallet,
  });

  if (user) {
    await collection.updateOne(
      {
        _id: user._id,
      },
      {
        $set: {
          score: response.riskAnalysis?.score,
        },
      },
    );
  }

  return NextResponse.json(response.riskAnalysis?.score, {
    status: 200,
  });
}
