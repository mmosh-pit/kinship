
import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-user-membership");

  const { 
    membership,
    membershiptype,
    price,
    expirydate,
    wallet
} = await req.json();

  const membershipData = await collection.findOne({
    wallet: wallet,
  });

  if (!membershipData) {
    await collection.insertOne({
        membership,
        membershiptype,
        price,
        expirydate,
        wallet,
        created_date: new Date(),
        updated_date: new Date(),
    });
    return NextResponse.json("", { status: 200 });
  } else {
    return NextResponse.json("", { status: 200 });
  }
}