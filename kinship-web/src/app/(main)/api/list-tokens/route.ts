import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("search") ? searchParams.get("search") as string : "";
  const basesymbol = searchParams.get("symbol") ? searchParams.get("symbol") as string : "";
  const status = searchParams.get("status") ? searchParams.get("status") as string : "active";
  let query = {};
  console.log("param", param);
  console.log("basesymbol", basesymbol);

    if (param != "" && basesymbol) {
      query = {
        $and: [
          { "base.symbol": basesymbol, status },
          {
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
          },
        ],
      };
    } else if (param != "" && !basesymbol) {
      query = {
        $and: [
          { status },
          {
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
          },
        ],
      };
    } else if (param == "" && basesymbol) {
      query = { "base.symbol": basesymbol, status };
    } else {
      query = { status };
    }

  const result = await collection.find(query).toArray();
  return NextResponse.json([...result], {
    status: 200,
  });
}
