import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-staked-history");

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet") || "";
  const result = await collection.find({ "royalty.receiver": wallet }).toArray();
  return NextResponse.json(result, {
    status: 200,
  });
}