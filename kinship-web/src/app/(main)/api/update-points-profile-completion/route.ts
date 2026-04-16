import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const collection = db.collection("users");
  const botCollection = db.collection("users");

  const { wallet } = await req.json();

  const user = await collection.findOne({
    wallet,
  });

  if (!user) {
    return NextResponse.json("User not found", { status: 400 });
  }

  const userSavedData = await collection
    .find({
      "telegram.id": user.telegram.id,
      profile: {
        $exists: true,
      },
    })
    .toArray();

  if (userSavedData.length > 1) {
    return NextResponse.json("", { status: 200 });
  }

  let pointsToAdd = 50;

  if (user.telegram?.id) {
    pointsToAdd += 200;
  }

  if (user.twitter?.uid) {
    pointsToAdd += 100;
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
      telegramId: Number(user.telegram.id),
    },
    {
      $inc: {
        points: pointsToAdd,
      },
    },
  );

  return NextResponse.json("", { status: 200 });
}
