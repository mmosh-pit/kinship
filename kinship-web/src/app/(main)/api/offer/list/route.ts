import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-offer");
  const { searchParams } = new URL(req.url);
  const limit = 8;
  const page = searchParams.get("page") ? Number(searchParams.get("page")) : 1
  const offset = Number(page - 1 ) * limit;

  const list = await collection
  .find()
  .sort({ created_date: -1 })
  .skip(offset)
  .limit(limit)
  .toArray();

  return NextResponse.json(
    list,
    {
      status: 200,
    },
  );
}