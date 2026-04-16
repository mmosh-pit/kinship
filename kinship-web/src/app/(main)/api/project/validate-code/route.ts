import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const code = searchParams.get("code");

  const result = await db.collection("bots").findOne({
    symbol,
    code,
  });

  return NextResponse.json(!!result);
}
