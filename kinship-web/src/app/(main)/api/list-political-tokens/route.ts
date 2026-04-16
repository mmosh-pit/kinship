import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("search") as string;

  if (param != "") {
    let search = {
      $or: [
        {
          "target.name": {
            $regex: new RegExp(param, "ig"),
          },
        },
        {
          symbol: {
            $regex: new RegExp(param, "ig"),
          },
        },
        {
          token: {
            $regex: new RegExp(param, "ig"),
          },
        },
      ],
    };
    const result = await collection.find(search).limit(100).toArray();
    return NextResponse.json([...result], {
      status: 200,
    });
  } else {
    const result = await collection.find().toArray();
    return NextResponse.json([...result], {
      status: 200,
    });
  }
}
