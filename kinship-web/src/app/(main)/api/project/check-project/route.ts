import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("bots");

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");

  const project = await collection.findOne(
    {
      symbol: symbol,
    }
  );

  return NextResponse.json(!!project, {
    status: 200,
  });
}
