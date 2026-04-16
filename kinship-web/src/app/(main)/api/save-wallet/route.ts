import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("users");

  const data = await req.json();

  const user = await collection.findOne({
    wallet: data.wallet,
  });

  if (user) {
    return NextResponse.json("", {
      status: 200,
    });
  }

  await collection.insertOne({
    wallet: data.wallet,
  });

  return NextResponse.json("", { status: 200 });
}
