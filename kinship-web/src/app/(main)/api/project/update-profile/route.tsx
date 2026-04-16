import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const teamCollection = db.collection("mmosh-app-project-profiles");

  const { wallet, projectkey, type } = await req.json();

  if(type === "reject") {
    await teamCollection.deleteOne({
        projectkey, profilekey: wallet
    });
  } else {
    let inviteData = await teamCollection.findOne({ projectkey, profilekey: wallet
, wallet});
    if(inviteData) {
        await teamCollection.updateOne(
            {
                _id: inviteData._id,
            },
            {
                $set: {
                   status: 1, 
                },
            },
        );
    }
  }
  return NextResponse.json("", { status: 200 });
}
