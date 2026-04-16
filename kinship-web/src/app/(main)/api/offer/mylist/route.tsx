import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const collection = db.collection("mmosh-app-project-offer");
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet")

    let data = []

    const inviteCollection = db.collection("mmosh-app-project-invites");
    let match = {$match: {wallet}};
    const invites = await inviteCollection
        .aggregate([
        match,
        {
            $lookup: {
            from: "mmosh-app-project-offer",
            localField: "offerkey",
            foreignField: "key",
            as: "offer",
            },
        },
        {
            $project: {
            status: 1,
            key:1,
            offer: "$offer",
            },
        },
        ])
        .toArray();

    
    for (let index = 0; index < invites.length; index++) {
        let element = {
            offer: invites[index].offer[0],
            isinvte: 1,
            status: invites[index].status,
            key: invites[index].key
        };
        data.push(element)
    }

    const list = await collection
    .find({creator: wallet})
    .sort({ created_date: -1 })
    .toArray();

    for (let index = 0; index < list.length; index++) {
        let element = {
            offer: list[index],
            isinvte: 0,
            status: 0,
            key:""
        };
        data.push(element)
    }


  return NextResponse.json(
    data,
    {
      status: 200,
    },
  );
}