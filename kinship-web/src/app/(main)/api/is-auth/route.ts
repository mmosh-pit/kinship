import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { db } from "@/app/(main)/lib/mongoClient";

export async function GET(req: NextRequest) {
  const collection = db.collection("users");

  const cookieStore = await cookies();

  const session = cookieStore.get("session");

  if (session === null) {
    return NextResponse.json(false);
  }

  console.log("Checking if User is auth with session: ", session?.value);

  const user = await collection.findOne({
    sessions: session?.value,
  });

  console.log("User: ", user);

  return NextResponse.json(user !== null);
}
