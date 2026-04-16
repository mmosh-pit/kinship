import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");

  const { searchParams } = new URL(req.url);
  const skip = searchParams.get("skip");
  const searchText = searchParams.get("search") as string;

  const filter: any = {};

  if (searchText) {
    searchText.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");

    filter["$or"] = [
      {
        "target.name": { $regex: searchText, $options: "i" },
      },
      {
        "target.desc": { $regex: searchText, $options: "i" },
      },
    ];
  }

  const tokens = await collection
    .find(filter)
    .skip(Number(skip))
    // .limit(15)
    .toArray();

  return NextResponse.json(tokens, {
    status: 200,
  });
}
