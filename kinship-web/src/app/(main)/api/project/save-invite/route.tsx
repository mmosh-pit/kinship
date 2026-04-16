import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-invites");

  const { wallet, value, projectkey, offerkey, key } = await req.json();

  const profileDetails = await collection.findOne({
    projectkey: projectkey,
    wallet
  });

  if (!profileDetails) {
    await collection.insertOne({
        wallet,
        value,
        offerkey,
        projectkey,
        key,
        status: 0
    });
    return NextResponse.json("", { status: 200 });
  } else {
    await collection.updateOne(
      {
        _id: profileDetails._id,
      },
      {
        $set: {
          value
        },
      },
    );
    return NextResponse.json("", { status: 200 });
  }
}