import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/(main)/lib/mongoClient";
import { UserCheckpointRequest } from "@/app/(main)/types/usercheckpoints-master";
export async function GET(req: Request) {
  try {
    const userId = req.headers.get("user");

    if (!userId) {
      return NextResponse.json({ success: false, message: "userId required" }, { status: 400 });
    }

    const collection = db.collection("user_checkpoints_master");

    const userData = await collection.findOne({ userId });

    return NextResponse.json({ success: true, data: userData?.selections ?? [] });

  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch selections" },
      { status: 500 }
    );
  }
}


export async function POST(req: Request) {
  try {
    const body: UserCheckpointRequest = await req.json();
    const { selections } = body;
    const user_id = req.headers.get("user");

    if (!user_id || !Array.isArray(selections)) {
      return NextResponse.json(
        { success: false, message: "user_id and selections[] required" },
        { status: 400 }
      );
    }

    const collection = db.collection("user_checkpoints_master");

    // Ensure user document exists
    await collection.updateOne(
      { user_id },
      {
        $setOnInsert: {
          user_id,
          selections: [],
          created_at: new Date()
        }
      },
      { upsert: true }
    );

    // Merge each selection
    for (const { type, category, tag, checkpoint_id } of selections) {
      // Check if selection already exists
      const exists = await collection.findOne({
        user_id,
        selections: { $elemMatch: { type, category, tag, checkpoint_id } }
      });

      // If exists, skip
      if (exists) continue;

      // Otherwise push new selection
      await collection.updateOne(
        { user_id },
        {
          $push: {
            selections: {
              type,
              category,
              tag,
              progress_plan: [],
              status: "active",
              checkpoint_id,
              created_at: new Date()
            }
          },
          $set: { updated_at: new Date() }
        }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("POST Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to store selections" },
      { status: 500 }
    );
  }
}