import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const collection = db.collection("users");
  const botCollection = db.collection("users");

  const { wallet, pointsToAdd } = await req.json();

  const user = await collection.findOne({
    wallet,
  });

  if (!pointsToAdd) {
    return NextResponse.json("Invalid Payload", { status: 400 });
  }

  if (!user) {
    return NextResponse.json("User not found", { status: 400 });
  }

  await collection.updateOne(
    {
      _id: user._id,
    },
    {
      $inc: {
        "telegram.points": pointsToAdd,
      },
    },
  );

  await botCollection.updateOne(
    {
      telegramId: user.telegram.id,
    },
    {
      $inc: {
        points: pointsToAdd,
      },
    },
  );

  return NextResponse.json("User not found", { status: 400 });
}
