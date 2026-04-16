
import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-user-membership");

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  const hasMembership = await collection.find({
    wallet: wallet,
  }).sort("-created_Data").limit(1).toArray();

  if(hasMembership.length == 0) {
    return NextResponse.json("na", { status: 200 });
  }

  let membershipData = hasMembership[0]
  const now = new Date();
  const expiry = new Date(membershipData.expirydate);

  if (expiry < now) {
    return NextResponse.json("expired", { status: 200 });
  } else {
    return NextResponse.json("active", { status: 200 });
  }
}