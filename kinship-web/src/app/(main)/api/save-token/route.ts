import { CoinDetail } from "@/app/(main)/models/coin";
import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const tokenCollection = db.collection("mmosh-app-tokens");
  const data: CoinDetail = await req.json();

  const token = await tokenCollection.findOne({
    token: data.token,
  });

  if (token) {
    return NextResponse.json("", { status: 200 });
  }

  let params:any = data;
  params.created_date = new Date();
  params.updated_date = new Date();

  tokenCollection.insertOne(params);
  return NextResponse.json("", { status: 200 });
}
