import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const presaleCollection = db.collection("mmosh-app-presale-details");

  const { key, token } = await req.json();
  console.log("----- TOKEN -----", token);

  const result = await presaleCollection.updateOne(
    { key },
    { $inc: { totalSold: token } }
  );

  return NextResponse.json("", { status: 200 });
}
