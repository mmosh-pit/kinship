import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-activated-agents");

  const { searchParams } = new URL(req.url);

  const param = searchParams.get("key");

  if (!param) return NextResponse.json("", { status: 400 });

  const results = await collection
    .aggregate([
      { $match: { agentId: param } },
      {
        $project: {
          userId: {
            $toObjectId: "$userId",
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $project: {
          "user.profile": 1,
        },
      },
    ])
    .toArray();

  console.log("Resulting users: ", results);

  return NextResponse.json(results.map((e) => e.user));
}
