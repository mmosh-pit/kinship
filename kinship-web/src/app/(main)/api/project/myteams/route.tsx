import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/mongoClient";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");

  let match = {$match: {profilekey: wallet}};
  const connections = await db
    .collection("mmosh-app-project-profiles")
    .aggregate([
     match,
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "wallet",
          as: "sender",
        },
      },
      {
        $lookup: {
          from: "bots",
          localField: "projectkey",
          foreignField: "key",
          as: "project",
        },
      },
      {
        $project: {
          role: 1,
          status: 1,
          key: 1,
          project: "$project",
          sender: "$sender",
        },
      },
    ])
    .toArray();

    return NextResponse.json(connections, {
       status: 200,
    });
}