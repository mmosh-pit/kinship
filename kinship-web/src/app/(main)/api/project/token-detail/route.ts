import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") as string;
  const collection = db.collection("mmosh-app-project-coins");
  const result = await collection.findOne({symbol});
  return NextResponse.json(result, {
        status: 200,
  });
}
