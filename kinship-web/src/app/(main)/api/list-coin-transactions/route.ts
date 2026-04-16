import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");
  const directoryCollection = db.collection("mmosh-app-directory");
  const { searchParams } = new URL(req.url);
  const bonding = searchParams.get("bonding");
  const limit = 10;
  const offset = Number(searchParams.get("page")) * limit;

  const history = await directoryCollection
    .find({ bonding: bonding })
    .sort({ created_date: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();
  const token = await collection.find({ bonding: bonding }).toArray();

  const filterDay = new Date(new Date().setDate(new Date().getDate() - 1));
  let dayVolume = 0;
  const dayvolumeResult = await directoryCollection
    .aggregate([
      { $match: { bonding: bonding, created_date: { $gte: filterDay } } },
      {
        $group: {
          _id: { year: {} },
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  if (dayvolumeResult.length > 0) {
    dayVolume = dayvolumeResult[0].totalAmount;
  }

  const filterMonth = new Date(new Date().setMonth(new Date().getMonth() - 1));
  let monthVolume = 0;
  const monthvolumeResult = await directoryCollection
    .aggregate([
      { $match: { bonding: bonding, created_date: { $gte: filterMonth } } },
      {
        $group: {
          _id: { year: {} },
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  if (monthvolumeResult.length > 0) {
    monthVolume = monthvolumeResult[0].totalAmount;
  }

  const filterYear = new Date(new Date().setMonth(new Date().getMonth() - 1));
  let yearVolume = 0;
  const yearvolumeResult = await directoryCollection
    .aggregate([
      { $match: { bonding: bonding, created_date: { $gte: filterYear } } },
      {
        $group: {
          _id: { year: {} },
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  if (yearvolumeResult.length > 0) {
    yearVolume = yearvolumeResult[0].totalAmount;
  }

  return NextResponse.json(
    {
      history: history,
      token: token,
      day: dayVolume,
      month: monthVolume,
      year: yearVolume,
    },
    {
      status: 200,
    },
  );
}
