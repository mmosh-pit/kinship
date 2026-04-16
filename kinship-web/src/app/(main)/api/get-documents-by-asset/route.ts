import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("inform-documents");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("address");

  const results = await collection
    .find({
      tokenAddress: param,
    })
    .toArray();

  return NextResponse.json(results);
}
