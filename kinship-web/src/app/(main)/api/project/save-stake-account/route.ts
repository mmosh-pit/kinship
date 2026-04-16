import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-stake");

  const { 
    key,
    project,
    mint,
    receiver,
    value,
    expiry,
    staketype
  } = 
    await req.json();

  const stakeAccount = await collection.findOne({
    key: key,
  });

  if (!stakeAccount) {
    await collection.insertOne({ key, project, mint, receiver, value, expiry, staketype, is_redeemed: false});
    return NextResponse.json("", { status: 200 });
  } else {
    return NextResponse.json("", { status: 200 });
  }
}