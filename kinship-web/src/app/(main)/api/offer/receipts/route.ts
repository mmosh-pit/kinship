import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-offer-receipt");
  const { searchParams } = new URL(req.url);
  const offer = searchParams.get("offer")
  const limit = 10;
  const page = searchParams.get("page") ? Number(searchParams.get("page")) : 1
  const offset = Number(page - 1 ) * limit;

  if(!offer) {
    return NextResponse.json(
        [],
        {
        status: 200,
        },
    );
  }

  const list = await collection
  .find({offer})
  .sort({ created_date: -1 })
  .skip(offset)
  .limit(limit)
  .toArray();

  return NextResponse.json(
    list,
    {
      status: 200,
    },
  );
}