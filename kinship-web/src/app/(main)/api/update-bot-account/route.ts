import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const collection = db.collection("users");

  const { field, value, telegramId } = await req.json();

  const user = await collection.findOne({
    telegramId: Number(telegramId)
  });

  if (user) {
    await collection.updateOne(
      {
        _id: user._id,
      },
      {
        $inc: {
          [field]: value,
        },
      },
    );
    return NextResponse.json("", { status: 200 });
  }

  return NextResponse.json("User not found", { status: 400 });
}