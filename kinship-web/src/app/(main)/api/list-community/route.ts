import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/mongoClient";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const skip = searchParams.get("skip");

  if (!skip) {
    return NextResponse.json("Invalid Payload", { status: 400 });
  }

  const data = await db
    .collection("mmosh-app-community")
    .find(
      {
        completed: true,
      },
      {
        skip: Number(skip),
        limit: 10,
      },
    )
    .toArray();

  const result = {
    community: data,
  };

  return NextResponse.json(result, {
    status: 200,
  });
}
