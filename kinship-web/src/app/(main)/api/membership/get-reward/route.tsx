import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const usageCollection = db.collection("mmosh-app-usage");

  const { searchParams } = new URL(req.url);

  const usageInfo = await usageCollection.find({ agentId: searchParams.get("agentId") }).toArray();
  if (usageInfo.length === 0) {
    return NextResponse.json({
      status: false,
      message: "No usage data found.",
      result: {
        reward: 0,
        withdrawal: 0
      }
    }, { status: 200 });
  }

  const totalUsage = await usageCollection.find({}).toArray();

  let totalInPool = 0;
  for (let i = 0; i < totalUsage.length; i++) {
    totalInPool += totalUsage[i].value - totalUsage[i].withdrawal;
  }
  console.log("totalInPool", totalInPool);
  return NextResponse.json({
    status: false,
    message: "usage data retrieved successfully.",
    result: {
      usage: usageInfo[0].value,
      withdrawal: usageInfo[0].withdrawal,
      tolalUsage: totalInPool,
      withdrawalAmount: usageInfo[0].withdrawalAmount || 0,
    }
  }, { status: 200 });
}