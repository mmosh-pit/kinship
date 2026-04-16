import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function DELETE(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-tools");

  const { searchParams } = new URL(req.url);

  const project = searchParams.get("project");
  const handle = searchParams.get("handle");
  const type = searchParams.get("type");
  const docId = searchParams.get("docId");

  await collection.deleteOne({
    project,
    "data.handle": handle,
  });

  if (type === "telegram") {
    await axios.post(`${process.env.NODE_BOT_PUBLIC_URL}/remove-bot`,{
        id: docId,
      }, {
      headers: {
        "Content-Type": "application/json",
      }
    })
  }

  return NextResponse.json("", { status: 200 });
}
