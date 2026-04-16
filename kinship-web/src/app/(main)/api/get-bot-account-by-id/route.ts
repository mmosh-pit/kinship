import { db, ObjectId } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("users");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("id");

  const user = await collection.findOne(
    {
      _id: new ObjectId(param?.toString()),
    },
    {
      projection: {
        _id: 1,
        username: 1,
        firstName: 1,
        lastName: 1,
        addressPublicKey: 1,
        addressPrivateKey: 1,
        image: 1,
        bio: 1,
        referredUsers: 1,
        telegramId: 1,
        points: 1,
      },
    }
  );
  
  return NextResponse.json(user, {
    status: 200,
  });
}