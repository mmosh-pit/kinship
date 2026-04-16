import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-tools");

  const { searchParams } = new URL(req.url);

  const project = searchParams.get("project");
  const handle = searchParams.get("handle");

  await collection.deleteOne({
    project,
    "data.handle": handle,
  });

  return NextResponse.json("", { status: 200 });
}
