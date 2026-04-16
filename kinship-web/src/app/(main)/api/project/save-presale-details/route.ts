import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-presale-details");
  const { presaleStartDate, lockPeriod, discount, presaleMinimum, presaleMaximum, purchaseMinimum, purchaseMaximum, totalSold, launchPrice, launchMarketCap, key, wallet } = await req.json();
  const result = await collection.insertOne({
    presaleStartDate,
    lockPeriod,
    discount,
    presaleMinimum,
    presaleMaximum,
    purchaseMinimum,
    purchaseMaximum,
    totalSold,
    launchPrice,
    launchMarketCap,
    key,
    wallet,
    created_date: new Date(),
    updated_date: new Date()
  });
  console.log("===== API RESULT CHECK =====", result.insertedId.toString());
  return NextResponse.json({
    id: result.insertedId.toString()
  }, { status: 200 });
}