import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

import { db } from "../../lib/mongoClient";

export async function POST(req: NextRequest) {
  const directoryCollection = db.collection("mmosh-app-project-directory");
  const params = await req.json();

  const mmoshUsdcPrice = await axios.get(
    `${process.env.NEXT_PUBLIC_JUPITER_PRICE_API}?ids=${process.env.NEXT_PUBLIC_OPOS_TOKEN},${process.env.NEXT_PUBLIC_USDC_TOKEN}`,
  );

  const USDCPrice = mmoshUsdcPrice.data?.data?.MMOSH?.price || 0;

  directoryCollection.insertOne({
    basekey: params.basekey,
    basename: params.basename,
    basesymbol: params.basesymbol,
    baseimg: params.baseimg,
    bonding: params.bonding,
    targetname: params.targetname,
    targetsymbol: params.targetsymbol,
    targetimg: params.targetimg,
    value: params.value,
    price: params.price,
    usdcPrice: params.value * USDCPrice,
    type: params.type,
    wallet: params.wallet,
    created_date: new Date(),
    updated_date: new Date(),
  });

  return NextResponse.json("", { status: 200 });
}
