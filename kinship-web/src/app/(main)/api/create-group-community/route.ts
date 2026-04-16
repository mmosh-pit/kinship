import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-group-community");

  const data = await req.json();

  await collection.insertOne(data);

  return NextResponse.json("");
}
