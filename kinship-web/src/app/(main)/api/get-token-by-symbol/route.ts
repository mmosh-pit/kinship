import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("symbol");

  if (!param) {
    return NextResponse.json("Invalid request", { status: 400 });
  }

  const token = await collection.findOne({
    symbol: {
      $regex: new RegExp(param, "ig"),
    },
  });

  if (!token) {
    return NextResponse.json("", { status: 400 });
  }

  return NextResponse.json(token, {
    status: 200,
  });
}
