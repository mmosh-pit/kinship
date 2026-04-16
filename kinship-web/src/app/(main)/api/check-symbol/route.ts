import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("users");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("username");

  const user = await collection.findOne(
    {
      "profile.symbol": param,
    },
    {
      collation: {
        locale: "en",
        strength: 2,
      },
    },
  );

  return NextResponse.json(!!user, {
    status: 200,
  });
}
