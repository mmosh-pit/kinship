import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-media");

  const { files, projectkey } = await req.json();

  for (let index = 0; index < files.length; index++) {
    const element = files[index];
    await collection.insertOne({
      media: element,
      projectkey,
      created_date: new Date(),
      updated_date: new Date(),
    });
  }
  return NextResponse.json("", { status: 200 });
}
