import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("users");

  const data = await collection
    .find(
      { wallet: { $exists: true } },
      {
        projection: {
          royalty: 1,
          _id: 0,
        },
      },
    )
    .toArray();

  const totalValues = {
    royalties: 0,
    members: data.length,
  };

  data.forEach((val) => {
    totalValues.royalties += val.royalty || 0;
  });

  return NextResponse.json(totalValues, {
    status: 200,
  });
}
