import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-directory");

  const { searchParams } = new URL(req.url);
  const bonding = searchParams.get("bonding");
  const symbol = searchParams.get("symbol");
  const labels = [];

  for (let index = 0; index < 4; index++) {
    const d = new Date();
    const pastYear = d.getFullYear() - index;
    labels.push({
      label: pastYear,
      value: 0,
    });
  }

  const d = new Date();
  const pastYear = d.getFullYear() - 3;
  const buyresult = await collection
    .aggregate([
      {
        $match: bonding
          ? {
              type: "buy",
              bonding: bonding,
              created_date: { $gte: new Date(pastYear, 0, 1, 0, 0, 0) },
            }
          : {
              type: "buy",
              created_date: { $gte: new Date(pastYear, 0, 1, 0, 0, 0) },
              basesymbol: symbol?.toUpperCase()
            },
      },
      {
        $group: {
          _id: { year: { $year: "$created_date" } },
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  for (let index = 0; index < buyresult.length; index++) {
    const buyelement = buyresult[index];
    for (let index = 0; index < labels.length; index++) {
      const element = labels[index];
      if (buyelement._id.year == element.label) {
        labels[index].value = labels[index].value + buyelement.totalAmount;
      }
    }
  }

  const sellresult = await collection
    .aggregate([
      {
        $match: bonding
          ? {
              type: "sell",
              bonding: bonding,
              created_date: { $gte: new Date(pastYear, 0, 1, 0, 0, 0) },
            }
          : {
              type: "sell",
              created_date: { $gte: new Date(pastYear, 0, 1, 0, 0, 0) },
              basesymbol: symbol?.toUpperCase()
            },
      },
      {
        $group: {
          _id: { year: { $year: "$created_date" } },
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  for (let index = 0; index < sellresult.length; index++) {
    const sellelement = sellresult[index];
    for (let index = 0; index < labels.length; index++) {
      const element = labels[index];
      if (sellelement._id.year == element.label) {
        labels[index].value = labels[index].value - sellelement.totalAmount;
      }
    }
  }

  const buyfullresult = await collection
    .aggregate([
      { $match: bonding ? { type: "buy", bonding: bonding } : { type: "buy", basesymbol: symbol?.toUpperCase() } },
      {
        $group: {
          _id: { year: { $year: "$created_date" } },
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const sellfullresult = await collection
    .aggregate([
      {
        $match: bonding ? { type: "sell", bonding: bonding } : { type: "sell", basesymbol: symbol?.toUpperCase() },
      },
      {
        $group: {
          _id: { year: { $year: "$created_date" } },
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  let totalTVL = 0;

  for (let index = 0; index < buyfullresult.length; index++) {
    const element = buyfullresult[index];
    totalTVL = totalTVL + element.totalAmount;
  }

  for (let index = 0; index < sellfullresult.length; index++) {
    const element = sellfullresult[index];
    totalTVL = totalTVL - element.totalAmount;
  }

  return NextResponse.json(
    {
      labels: labels,
      total: totalTVL,
    },
    {
      status: 200,
    },
  );
}
