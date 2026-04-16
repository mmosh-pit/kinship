import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-staked-history");

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json(
      {
        status: false,
        message: "Wallet address is required.",
        result: {
          rewardAmount: 0,
          climedAmount: 0,
        },
      },
      { status: 400 }
    );
  }

  const result = await collection
    .find({ "royalty.receiver": wallet })
    .toArray();

  if (result.length === 0) {
    return NextResponse.json(
      {
        status: false,
        message: "No usage data found.",
        result: {
          rewardAmount: 0,
          climedAmount: 0,
        },
      },
      { status: 200 }
    );
  }

  let rewardAmount: number = 0;
  let climedAmount: number = 0;
  for (let i = 0; i < result.length; i++) {
    const element = result[i];
    for (let j = 0; j < element.royalty.length; j++) {
      const royaltyElement = element.royalty[j];
      if (wallet === royaltyElement.receiver && royaltyElement.isUnstaked && !royaltyElement.isClaimed) {
        rewardAmount += royaltyElement.amount;
      }
      if (wallet === royaltyElement.receiver && royaltyElement.isClaimed) {
        climedAmount += royaltyElement.amount;
      }
    }
  }
  return NextResponse.json(
    {
      status: true,
      message: "staked data retrieved successfully.",
      result: {
        rewardAmount: rewardAmount,
        climedAmount: climedAmount,
      },
    },
    { status: 200 }
  );
}
