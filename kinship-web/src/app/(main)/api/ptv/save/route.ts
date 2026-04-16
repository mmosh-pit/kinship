import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-ptv");
  const projectCollection = db.collection("bots");

  const { coin, reward, wallet } = await req.json();

  const ptv = await collection.findOne({
    wallet,
  });

  if (!ptv) {
    await collection.insertOne({
      wallet,
      coin,
      reward: reward,
      claimed: 0,
      available: 0,
      swapped: 0,
      created_date: new Date(),
      updated_date: new Date(),
    });
  } else {
      await collection.updateOne(
        {
          _id: ptv._id,
        },
        {
          $set: {
            reward: ptv.reward + reward,
          },
        },
      );
  }
  return NextResponse.json("", { status: 200 });
}

