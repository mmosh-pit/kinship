import { db, ObjectId } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  const documentsCollection = db.collection("inform-documents");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("id") as string;

  await documentsCollection.deleteOne({
    _id: new ObjectId(param),
  });

  return NextResponse.json("");
}
