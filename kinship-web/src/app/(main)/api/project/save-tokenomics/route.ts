import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-tokenomics");

  const { type, value, cliff, vesting, projectkey} = await req.json();

  await collection.insertOne({
      type,
      value,
      cliff,
      vesting,
      projectkey
  });
  return NextResponse.json("", { status: 200 });

}