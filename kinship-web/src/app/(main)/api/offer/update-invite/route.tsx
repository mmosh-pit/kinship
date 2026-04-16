import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const inviteCollection = db.collection("mmosh-app-project-invites");

  const { wallet, offerkey, type } = await req.json();

  if(type === "reject") {
    await inviteCollection.deleteOne({
        offerkey, wallet
    });
  } else {
    let inviteData = await inviteCollection.findOne({ offerkey, wallet});
    if(inviteData) {
        await inviteCollection.updateOne(
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
