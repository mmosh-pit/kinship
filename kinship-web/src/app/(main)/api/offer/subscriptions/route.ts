import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-offer-subscription");
  const { searchParams } = new URL(req.url);
  const offer = searchParams.get("offer")
  const wallet = searchParams.get("wallet")

  if(!offer && !wallet) {
    return NextResponse.json(
        null,
        {
        status: 200,
        },
    );
  }

  const data = await collection
  .findOne({offer, wallet})

  return NextResponse.json(
    data,
    {
      status: 200,
    },
  );
}