import { db, ObjectId } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const collection = db.collection("mmosh-app-staked-history");
    const transactionCollection = db.collection("mmosh-app-transaction-history");

    const { wallet, purchaseId, historyId, royaltyLevel } = await req.json();

    const stakedHistory = await collection.find({
      purchaseId: purchaseId,
    }).toArray();

    let errorMessage = "";
    if (stakedHistory.length === 0) {
      errorMessage = "Staked entry not found.";
    }

    let stakedAmount: number = 0;
    let hasUnstaked: boolean = false;
    if (stakedHistory.length > 0) {
      for (let i = 0; i < stakedHistory[0].royalty.length; i++) {
        const element = stakedHistory[0].royalty[i];
        if (wallet === element.receiver) {
          stakedAmount += element.amount;
          hasUnstaked = element.isUnstaked;
        };
      }
    }
    if (errorMessage.length === 0 && hasUnstaked) {
      errorMessage = "User already unstaked the amount";
    }

    console.log("STAKED ERROR", errorMessage);
    if (errorMessage) {
      return NextResponse.json(
        {
          status: false,
          message: errorMessage,
          result: null,
        },
        { status: 400 }
      );
    }

    const result = await collection.updateMany(
      { purchaseId },
      {
        $set: { "royalty.$[elem].isUnstaked": true },
        $inc: { unStakedAmount: stakedAmount }
      },
      { arrayFilters: [{ "elem.receiver": wallet, "elem.royaltyLevel": royaltyLevel }] }
    );
    const result_ = await transactionCollection.updateOne(
      { _id: new ObjectId(historyId) },
      {
        $set: { isUnlocked: true, updated_date: Date.now() },
      },
    );

    return NextResponse.json(
      {
        status: true,
        message:
          "The amount has been successfully unstaked. Please go ahead and claim the amount.",
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: false,
        message: "Something went wrong; please try again later.",
      },
      { status: 500 } // changed to proper error code
    );
  }
}
