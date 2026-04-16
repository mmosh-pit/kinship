import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import { getLineage } from "@/app/(main)/lib/forge/createProfile";
import axios from "axios";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const collection = db.collection("mmosh-app-staked-history");
  const userCollection = db.collection("users");
  const { stakedAmount, userAddeess, purchaseId } = await req.json();
  const username = await getUserName(userAddeess);
  const { origin } = new URL(req.url);
  if (!stakedAmount || !userAddeess || !purchaseId) {
    return NextResponse.json(
      {
        status: false,
        message: "All params are required.",
        result: null,
      },
      { status: 400 }
    );
  }
  const user = await userCollection.findOne({
    wallet: userAddeess,
  });
  if (!user) {
    return NextResponse.json(
      {
        status: false,
        message: "User not found.",
        result: null,
      },
      { status: 400 }
    );
  }

  let cost = (stakedAmount * 10 ** 6 * 85) / 100;
  let lineage = await getLineage(userAddeess);
  const royalty = [
    // {
    //   receiver: process.env.NEXT_PUBLIC_PTV_WALLET_KEY,
    //   amount: cost * (25 / 100),
    //   isClaimed: false,
    // },
    {
      receiver: lineage.parent,
      amount: cost * (20 / 100),
      isClaimed: false,
      isUnstaked: false,
      royaltyLevel: 0,
    },
    {
      receiver: lineage.gparent,
      amount: cost * (10 / 100),
      isClaimed: false,
      isUnstaked: false,
      royaltyLevel: 1,
    },
    {
      receiver: lineage.ggparent,
      amount: cost * (3 / 100),
      isClaimed: false,
      isUnstaked: false,
      royaltyLevel: 2,
    },
    {
      receiver: lineage.gggparent,
      amount: cost * (2 / 100),
      isClaimed: false,
      isUnstaked: false,
      royaltyLevel: 3,
    },
  ];
  const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
  await collection.insertOne({
    category: "royalties",
    stakedAmount: cost,
    purchaseId: purchaseId,
    wallet: userAddeess,
    royalty: royalty,
    created_date: Date.now() + ninetyDaysInMs,
  });
  const params = {
    transactionType: "membership_royalty",
    membershipRoyalty: {
      royalty: royalty,
      referrerName: username,
      isStaked: true,
      isUnlocked: false,
      purchaseId: purchaseId,
    },
  };
  const res = await axios.post(`${origin}/api/history/save`, params, {
    headers: {
      Authorization: authHeader,
    },
  });
  return NextResponse.json(
    {
      status: true,
      message: "Funds successfully disbursed to lineage",
      result: "",
    },
    { status: 200 }
  );
}

const getUserName = async (wallet: string) => {
  const usersCollection = db.collection("users");
  let username = "unknown user";
  const parentDetails = await usersCollection.findOne({ wallet: wallet });
  if (parentDetails !== null) {
    username = parentDetails.guest_data ? parentDetails.guest_data.username || parentDetails.name : parentDetails.name;
  }
  return username;
};
