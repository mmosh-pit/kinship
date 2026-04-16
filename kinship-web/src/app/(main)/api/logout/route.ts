import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { db } from "@/app/(main)/lib/mongoClient";

export async function PUT(req: NextRequest) {
  const collection = db.collection("users");

  const cookieStore = await cookies();

  const session = cookieStore.get("session");

  if (!session) return NextResponse.json("");

  const user = await collection.findOne({
    sessions: session?.value,
  });

  if (user == null) return NextResponse.json("");

  await collection.updateOne(
    {
      _id: user._id,
    },
    {
      $pull: {
        session: session?.value,
      },
    },
  );

  cookieStore.delete("session");

  return NextResponse.json("");
}
