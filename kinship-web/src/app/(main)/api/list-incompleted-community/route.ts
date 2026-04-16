import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/(main)/lib/mongoClient";

export async function GET(req: NextRequest) {
  const communitiesCollection = db.collection("mmosh-app-community");

  const { searchParams } = new URL(req.url);

  const param = searchParams.get("profile");

  const existingCommunity = await communitiesCollection.findOne({
    profileAddress: param,
    completed: {
      $exists: false,
    },
  });

  return NextResponse.json(existingCommunity, { status: 200 });
}
