import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-coins");

  const { name, symbol, image, key, desc, creator, projectkey, decimals, supply  } = await req.json();

  const communityCoins = await collection.findOne({
    key: key,
  });

  if (!communityCoins) {
    const result = await collection.insertOne({
        name,
        symbol,
        image,
        key,
        desc,
        creator, 
        projectkey,
        prices: [],
        pricepercentage: 0,
        coingeckoid: "",
        decimals,
        supply,
        presalediscount: [],
        created_date: new Date(),
        updated_date: new Date()
    });

    return NextResponse.json({
      id: result.insertedId.toString()
    }, { status: 200 });
  } else {
    return NextResponse.json("", { status: 200 });
  }
}

