import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-profiles");

  const { profilekey, projectkey } = await req.json();

  const profileDetails = await collection.findOne({
    projectkey,
    profilekey
  });

  if (!profileDetails) {
    return NextResponse.json("", { status: 200 });
  } else {
    await collection.deleteOne({ 
        _id: profileDetails._id,
    });
    return NextResponse.json("", { status: 200 });
  }
}