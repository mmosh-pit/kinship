import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-liquidity");

  const { sol, usdc, mmosh, projectkey  } = await req.json();

  const liquidityDetails = await collection.findOne({
    projectkey: projectkey,
  });

  if (!liquidityDetails) {
    await collection.insertOne({
        sol,
        usdc,
        mmosh,
        projectkey
    });
    return NextResponse.json("", { status: 200 });
  } else {
    return NextResponse.json("", { status: 200 });
  }
}