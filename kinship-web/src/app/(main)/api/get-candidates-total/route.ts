import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("candidates");

  const candidates = await collection.countDocuments();

  return NextResponse.json(candidates);
}
