import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-directory");

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ? searchParams.get("type") : "day";
  const bonding = searchParams.get("bonding");
  const symbol = searchParams.get("symbol")

  const labels = [];
  for (let index = 0; index < 7; index++) {
    let volType;
    if (type === "day") {
      volType = new Date(new Date().setDate(new Date().getDate() - index));
      labels.push({
        label: volType.toLocaleString("en-us", {
          month: "short",
          day: "numeric",
        }),
        value: 0,
      });
    } else if (type === "week") {
      volType = new Date(new Date().setDate(new Date().getDate() - index * 7));
      labels.push({
        label: volType.toLocaleString("en-us", {
          month: "short",
          day: "numeric",
        }),
        value: 0,
      });
    } else if (type === "month") {
      volType = new Date(new Date().setMonth(new Date().getMonth() - index));
      labels.push({
        label: volType.toLocaleString("en-us", {
          month: "short",
          year: "numeric",
        }),
        value: 0,
      });
    } else if (type === "year") {
      volType = new Date().getFullYear() - index;
      labels.push({
        label: volType,
        value: 0,
      });
    }
  }

  const d = new Date();
  let filterDate;
  let idFitler;

  if (type === "day") {
    filterDate = new Date(d.setDate(d.getDate() - 13));
    idFitler = { year: { date: "$created_date" } };
  } else if (type === "week") {
    filterDate = new Date(d.setDate(d.getDate() - 13 * 7));
    idFitler = { year: { date: "$created_date" } };
  } else if (type === "month") {
    filterDate = new Date(d.setMonth(d.getMonth() - 13));
    idFitler = {
      year: { $year: "$created_date" },
      month: { $month: "$created_date" },
    };
  } else if (type === "year") {
    idFitler = { year: { $year: "$created_date" } };
    filterDate = new Date(d.setFullYear(d.getFullYear() - 13));
  }

  const matchCondition: any = {};

  if (bonding) {
    matchCondition.bonding = bonding;
  }

  if(symbol) {
    matchCondition.basesymbol = symbol.toUpperCase()
  }

  const buyresult = await collection
    .aggregate([
      { $match: { ...matchCondition, created_date: { $gte: filterDate } } },
      {
        $group: {
          _id: idFitler,
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
      if (type == "day") {
        if (
          new Date(buyelement._id.year.date).toLocaleString("en-us", {
            month: "short",
            day: "numeric",
          }) == element.label
        ) {
          labels[index].value = labels[index].value + buyelement.totalAmount;
        }
      } else if (type == "month") {
        if (
          new Date(
            buyelement._id.year + "-" + buyelement._id.month + "-01",
          ).toLocaleString("en-us", { month: "short", year: "numeric" }) ==
          element.label
        ) {
          labels[index].value = labels[index].value + buyelement.totalAmount;
        }
      } else {
        if (buyelement._id.year == element.label) {
          labels[index].value = labels[index].value + buyelement.totalAmount;
        }
      }
    }
  }

  const buyfullresult = await collection
    .aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: { year: {} },
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
