
import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-user-membership");

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  const membershipInfo = await collection.find({
    wallet: wallet,
  }).sort("-created_Data").limit(1).toArray();

  if (membershipInfo.length == 0) {
    return NextResponse.json({}, { status: 200 });
  }

  let membershipData = membershipInfo[0]
  const now = new Date();
  const expiry = new Date(membershipData.expirydate);

  membershipInfo[0].status = expiry < now ? "expired" : "active"

  if (expiry < now) {
    return NextResponse.json({}, { status: 200 });
  } else {
    return NextResponse.json(membershipInfo[0], { status: 200 });
  }
}