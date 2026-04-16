import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-group-community");

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") as string;

  const result = await collection.findOne({
    symbol,
  });

  return NextResponse.json(!!result);
}
