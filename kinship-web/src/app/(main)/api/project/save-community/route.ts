import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-community");

  const { communitykey, projectkey, name  } = await req.json();

  const communityDetails = await collection.findOne({
    projectkey: projectkey,
    communitykey,
  });

  if (!communityDetails) {
    await collection.insertOne({
        name,
        communitykey,
        projectkey
    });
    return NextResponse.json("", { status: 200 });
  } else {
    return NextResponse.json("", { status: 200 });
  }
}