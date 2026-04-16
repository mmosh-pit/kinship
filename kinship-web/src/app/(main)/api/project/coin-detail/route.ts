import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-coins");
  
  const { searchParams } = new URL(req.url);
  const coin = searchParams.get("coin");
  const result = await collection.findOne({key:coin});

  const stakeData = await db.collection("mmosh-app-project-stake").findOne({coin:coin});

  return NextResponse.json({coin: result, info: stakeData }, {
        status: 200,
  });
}
