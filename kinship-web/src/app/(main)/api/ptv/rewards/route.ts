import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-ptv");

  const { searchParams } = new URL(req.url);
  const coin = searchParams.get("coin");
  const wallet = searchParams.get("wallet");

  const ptvData = await collection.findOne({
    wallet,
    coin
  });

  let claimable = 0;
  let unstakable = 0;
  let unstaked = 0;
  let total = 0;
  let swapped = 0;
  if (ptvData) {
      claimable = ptvData.reward - ptvData.swapped;
      unstakable = ptvData.available;
      unstaked = ptvData.claimed;
      total = ptvData.reward - ptvData.swapped + ptvData.available;
      swapped = ptvData.swapped;
  }

  let claimField = "$claimed";
  let availableField = "$available";
  let rewardField = "$reward";

  const claimTotal = await collection
    .aggregate([{ $group: { _id: null, sum: { $sum: claimField } } }])
    .toArray();

  const rewardTotal = await collection
    .aggregate([{ $group: { _id: null, sum: { $sum: rewardField } } }])
    .toArray();

  const availableTotal = await collection
    .aggregate([{ $group: { _id: null, sum: { $sum: availableField } } }])
    .toArray();

  return NextResponse.json(
    {
      totalclaim: claimTotal[0]?.sum || 0,
      totalunclaimed:
        (rewardTotal[0]?.sum || 0) - (availableTotal[0]?.sum || 0),
      totalavailable: rewardTotal[0]?.sum || 0,
      claimable: claimable,
      unstakable: unstakable,
      total: total,
      unstaked: unstaked,
      swapped,
    },
    {
      status: 200,
    },
  );
}
