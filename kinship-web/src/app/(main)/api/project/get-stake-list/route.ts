import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const collection = db.collection("mmosh-app-stake");

    const { searchParams } = new URL(req.url);
    const project = searchParams.get("project");
    const receiver = searchParams.get("receiver");
    const expiry = new Date(new Date().toUTCString()).valueOf();

    const lists = await collection.find(
      {
        "project": project,
        "receiver": receiver,
        "expiry": {$lt: expiry},
        "staketype": {$ne: "presale"}
      },
    ).toArray();

    const presale = await collection.findOne(
      {
        "project": project,
        "staketype": "presale"
      },
    );
  
    return NextResponse.json({
      stake: lists,
      presale
    }, {
      status: 200,
    });
}
  