import { db, ObjectId } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("referral_data");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("id");

  const user = await collection.findOne(
    {
      child: new ObjectId(param?.toString()),
    },
    {
      projection: {
        parent: 1,
        child: 1
      },
    }
  );
  
  return NextResponse.json(user, {
    status: 200,
  });
}