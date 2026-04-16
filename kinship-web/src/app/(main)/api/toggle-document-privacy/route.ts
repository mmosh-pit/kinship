import { db, ObjectId } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  const documentsCollection = db.collection("inform-documents");

  const body = await req.json();

  await documentsCollection.updateOne({
    _id: new ObjectId(body.docId),
  }, {
    $set: {
      isPrivate: body.isPrivate,
    },
  });

  return NextResponse.json("");
}
