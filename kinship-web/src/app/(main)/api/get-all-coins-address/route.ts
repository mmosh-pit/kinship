import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");

  const token = await collection
    .find(
      {},
      {
        projection: {
          token: 1,
        },
      },
    )
    .toArray();

  return NextResponse.json(token, {
    status: 200,
  });
}
