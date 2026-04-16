import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-activated-agents");
  const offerCollection = db.collection("mmosh-app-project-offer");

  const { searchParams } = new URL(req.url);

  const param = searchParams.get("key");

  if (!param) return NextResponse.json("", { status: 400 });

  const count = await collection.countDocuments({
    agentId: param,
  });

  const offerCount = await offerCollection.countDocuments({
    project: param,
  });

  return NextResponse.json({
    subscribers: count,
    offers: offerCount,
    teams: 0,
  });
}
