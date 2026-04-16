import { NextRequest, NextResponse } from "next/server";

import { db } from "@/app/(main)/lib/mongoClient";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-recent-coins");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("profile");

  if (!param || param === "undefined")
    return NextResponse.json([], { status: 200 });

  const result = await collection.find({ wallet: param }).toArray();

  return NextResponse.json(result, { status: 200 });
}
