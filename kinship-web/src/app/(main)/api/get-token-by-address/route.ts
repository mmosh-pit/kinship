import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("token");

  const token = await collection.findOne({ "target.token": param });
  if (token) {
    return NextResponse.json(token, {
      status: 200,
    });
  } else {
    return NextResponse.json(null, {
      status: 200,
    });
  }
}
