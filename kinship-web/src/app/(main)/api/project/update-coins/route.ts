import { db, ObjectId } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-coins");

  const { id, presalediscount } = await req.json();
  const objectId = new ObjectId(id);
  const result = await collection.updateOne(
    {
      _id: objectId
    },
    {
      $set: {
        presalediscount: presalediscount
      },
    },
  );
  console.log("===== UPDATE COINS RESULT =====", result);
  return NextResponse.json("", { status: 200 });
}