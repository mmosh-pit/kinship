import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-token-price");

  const { searchParams } = new URL(req.url);
  let price = 0;
  try {
    const key = searchParams.get("key");
    let priceresult = await collection
      .find({ key: key })
      .limit(1)
      .sort({ created_date: -1 })
      .toArray();
    if (priceresult.length > 0) {
      price = priceresult[0].price;
    }
    return NextResponse.json(
      {
        price: price,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.log("error ", error);
    return NextResponse.json(
      {
        price: price,
      },
      {
        status: 200,
      },
    );
  }
}
