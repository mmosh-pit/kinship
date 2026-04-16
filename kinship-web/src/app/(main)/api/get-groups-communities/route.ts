import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-group-community");

  const { searchParams } = new URL(req.url);
  const skip = searchParams.get("skip");
  const searchText = searchParams.get("search") as string;

  const filter: any = {};

  if (searchText) {
    searchText.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");

    filter["$or"] = [
      {
        name: { $regex: searchText, $options: "i" },
      },
      {
        description: { $regex: searchText, $options: "i" },
      },
    ];
  }

  const result = await collection
    .find(filter)
    .skip(Number(skip))
    .limit(50)
    .toArray();

  return NextResponse.json(result);
}
