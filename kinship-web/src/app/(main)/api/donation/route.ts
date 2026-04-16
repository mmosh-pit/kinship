import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  const result = await db
    .collection("mmosh-app-donation-profile").findOne({wallet});
  if(result) {
    return NextResponse.json({status: true, data: result}, { status: 200 });
  } else {
    return NextResponse.json({status: false}, { status: 200 });
  }

}
