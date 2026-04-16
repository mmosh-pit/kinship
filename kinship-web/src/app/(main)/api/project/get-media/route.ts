import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-media");

  const { searchParams } = new URL(req.url);

  const projectkey = searchParams.get("project");

  const result = await collection
    .find({
      projectkey,
    })
    .toArray();

  return NextResponse.json(result, { status: 200 });
}
