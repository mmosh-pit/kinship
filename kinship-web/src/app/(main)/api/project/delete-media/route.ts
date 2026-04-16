import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-media");

  const { searchParams } = new URL(req.url);

  const key = searchParams.get("project");
  const id = searchParams.get("id");

  await collection.deleteOne({
    projectkey: key,
    "media.id": id,
  });

  return NextResponse.json("", { status: 200 });
}
