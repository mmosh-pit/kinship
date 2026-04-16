import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-coins");
  const result = await collection.find({symbol:{$ne: "MMOSH"}}).toArray();
  return NextResponse.json([...result], {
        status: 200,
  });
}
