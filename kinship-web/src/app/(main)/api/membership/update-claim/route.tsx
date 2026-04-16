import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-usage");
  const stakedCollection = db.collection("mmosh-app-staked-history");

  const { agentId, withdrawal, withdrawalAmount, isRoyalty, wallet } =
    await req.json();
  if (isRoyalty) {
    const result = await stakedCollection.updateMany(
      {},
      {
        $set: { "royalty.$[elem].isClaimed": true },
      },
      { arrayFilters: [{ "elem.receiver": wallet }] }
    );
    console.log("stake update result", result);
  } else {
    await collection.updateOne(
      { agentId: agentId },
      {
        $inc: {
          withdrawal: withdrawal,
          withdrawalAmount: withdrawalAmount,
        },
      }
    );
  }

  return NextResponse.json("", { status: 200 });
}
