import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }



  const { searchParams } = new URL(req.url);
  const skip = searchParams.get("skip");
  const wallet = searchParams.get("wallet");

  if (!skip) {
    return NextResponse.json("Invalid Payload", { status: 400 });
  }

  let match = {$match: {wallet}};

  const result = await db
    .collection("mmosh-app-donation-history")
    .aggregate([
     match,
     {
        $lookup: {
            from: "mmosh-app-tokens",
            localField: "token",
            foreignField: "token",
            as: "token",
      },
    },
      {
        $project: {
          amount: 1,
          usdvalue: 1,
          created_date: 1,
          wallet: 1,
          token: "$token",
        },
      },
      {$sort: {created_date: -1}},
    ])
    .skip(Number(skip))
    .limit(10)
    .toArray();
  return NextResponse.json(result, { status: 200 });
}
