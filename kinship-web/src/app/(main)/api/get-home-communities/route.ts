import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const projectCollection = db.collection("mmosh-app-projects");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("search");
  const skip = searchParams.get("skip");

  if (!skip) return NextResponse.json("Invalid Payload", { status: 400 });

  let searchCondition = {};

  if (param) {
    searchCondition = {
      $or: [
        {
          name: {
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
  }

  const result = await projectCollection
    .find(searchCondition, {
      projection: {
        name: 1,
        desc: 1,
        image: 1,
        coinimage: 1,
      },
    })
    .skip(Number(skip))
    .limit(15)
    .toArray();

  return NextResponse.json(result, {
    status: 200,
  });
}
