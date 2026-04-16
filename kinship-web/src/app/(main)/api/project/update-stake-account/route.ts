import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";


export async function PUT(req: NextRequest) {
  const collection = db.collection("mmosh-app-stake");

  const { key } = await req.json();

  const stakeAccount = await collection.findOne({
    key,
  });

  if (stakeAccount) {
    await collection.updateOne(
      {
        _id: stakeAccount._id,
      },
      {
        $set: {
            is_redeemed: true,
        },
      },
    );
    return NextResponse.json("", { status: 200 });
  }

  return NextResponse.json("Stake account not found", { status: 400 });
}
