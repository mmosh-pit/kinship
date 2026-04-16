import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/mongoClient";

let cachedUsers: any[] = [];

setInterval(() => {
  cachedUsers = [];
}, 1800000);

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user");

  if (user === "undefined") {
    return NextResponse.json("", { status: 200 });
  }

  if (!user) {
    return NextResponse.json(
      {
        error: "Invalid Request",
      },
      {
        status: 400,
      },
    );
  }

  if (cachedUsers.length === 0) {
    const data = await db
      .collection("users")
      .find(
        {},
        {
          projection: {
            _id: 1,
            points: 1,
            telegramId: 1,
          },
          sort: { points: -1 },
        },
      )
      .toArray();

    if (!data) return NextResponse.json("", { status: 200 });

    cachedUsers = data;
  }

  const result = {
    rank: 0,
    points: 0,
  };

  cachedUsers.forEach((row, index) => {
    if (row.telegramId == Number(user as string)) {
      result.rank = index;
      result.points = row.points;
    }
  });

  return NextResponse.json(result, {
    status: 200,
  });
}
