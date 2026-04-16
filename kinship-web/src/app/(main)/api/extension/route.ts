import Extension from "@/app/(main)/models/Extension";
import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const collection = db.collection("mmosh-extensions");
    const data: Extension = await req.json();

    // Validate required fields
    if (!data.type || !data.email || !data.password || !data.instructions) {
      return NextResponse.json(
        { error: "Missing required fields: type, email, password, instructions" },
        { status: 400 }
      );
    }

    // Validate type
    if (!['linkedin', 'bluesky', 'x'].includes(data.type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be 'linkedin', 'bluesky', or 'x'" },
        { status: 400 }
      );
    }

    // Check if extension already exists for this email, type, and botId
    const existingExtension = await collection.findOne({
      email: data.email,
      type: data.type,
      botId: data.botId,
    });

    if (existingExtension) {
      // Update existing extension
      await collection.updateOne(
        { email: data.email, type: data.type, botId: data.botId },
        {
          $set: {
            password: data.password,
            instructions: data.instructions,
            userId: data.userId,
            botId: data.botId,
            updatedAt: new Date(),
          },
        }
      );
    } else {
      // Create new extension
      const extensionData = {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await collection.insertOne(extensionData);
    }

    return NextResponse.json(
      { message: "Extension saved successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error saving extension:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const collection = db.collection("mmosh-extensions");
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const type = searchParams.get("type");
    const botId = searchParams.get("botId");

    let query: any = {};
    if (userId) query.userId = userId;
    if (type) query.type = type;
    if (botId) query.botId = botId;

    const extensions = await collection.find(query).toArray();

    return NextResponse.json(extensions, { status: 200 });
  } catch (error) {
    console.error("Error fetching extensions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
