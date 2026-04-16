import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const presaleCollection = db.collection("mmosh-app-presale-details");
  const coinsCollection = db.collection("mmosh-app-project-coins");

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ status: false, message: "Missing userId" }, { status: 400 });
  }
  const allPresales = await presaleCollection.find({}).toArray();
  const now = Date.now();
  const futurePresales = allPresales
    .filter(p => {
      // const presaleStartTime = new Date(p.presaleStartDate).getTime();
      // const lockPeriodTime = new Date(p.lockPeriod).getTime();

      const isFutureLock = p.lockPeriod > now;
      const hasPresaleStarted = p.presaleStartDate <= now;

      return isFutureLock && hasPresaleStarted;
    })
    .sort((a, b) => new Date(a.lockPeriod).getTime() - new Date(b.lockPeriod).getTime());

  const presaleResult = await Promise.all(
    futurePresales.map(async (presale) => {
      const coin = await coinsCollection.findOne({ key: presale.key });
      return {
        presaleDetail: presale,
        coinDetail: coin || {}
      };
    })
  );

  return NextResponse.json(
    {
      status: presaleResult.length > 0,
      result: presaleResult,
    },
    { status: 200 }
  );
}
