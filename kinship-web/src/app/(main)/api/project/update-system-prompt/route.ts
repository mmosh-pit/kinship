import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const collection = db.collection("bots");
  const chatCollection = db.collection("chats");

  const data = await req.json();

  await collection.updateOne(
    {
      key: data.project,
    },
    {
      $set: {
        system_prompt: data.systemPrompt,
      },
    },
  );

  await chatCollection.updateMany(
    {
      "chatAgent.key": data.project,
    },
    {
      $set: {
        "chatAgent.system_prompt": data.systemPrompt,
      },
    },
  );

  return NextResponse.json("", { status: 200 });
}
