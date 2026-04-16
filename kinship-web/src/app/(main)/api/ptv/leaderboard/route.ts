import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as string;
  const search = searchParams.get("searchText") as string;
  let match = {$match: {}};
  if(search && type) {
    match = {
        $match: {
          $and: [
            {type: type},
            {
              $or: [
                { name: { $regex: new RegExp(search, "ig") } },
              ],
            }
          ]
        },
    }
  } else {
    if(type) {
      match = { $match: { type: type } }
    }
  
  }


  const result = await db
    .collection("mmosh-app-ptv")
    .aggregate([
     match,
      {
        $lookup: {
          from: "users",
          localField: "wallet",
          foreignField: "wallet",
          as: "profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "coin",
          foreignField: "key",
          as: "coins",
        },
      },
      {
        $project: {
          reward: 1,
          claimed: 1,
          coin: 1,
          profiles: "$profiles",
          coins: "$coins",
        },
      },
      { $addFields: { "totalearned": { $sum: [ "$reward" ] } } },
      { $sort: { "totalearned": -1 } }
    ])
    .limit(100)
    .toArray();
  return NextResponse.json(result, { status: 200 });
}
