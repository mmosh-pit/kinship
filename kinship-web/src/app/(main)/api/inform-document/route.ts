import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const documentsCollection = db.collection("inform-documents");

  const body = await req.json();

  const res = await documentsCollection.insertOne(body);

  return NextResponse.json(res.insertedId.toString());
}
