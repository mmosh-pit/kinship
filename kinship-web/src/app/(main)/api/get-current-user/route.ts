import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { db } from "@/app/(main)/lib/mongoClient";

export async function GET(req: NextRequest) {
  const collection = db.collection("users");

  const cookieStore = await cookies();

  const session = cookieStore.get("session");

  if (!session) {
    return NextResponse.json(null);
  }

  const user = await collection.findOne({
    sessions: session?.value,
  });

  return NextResponse.json(user);
}
