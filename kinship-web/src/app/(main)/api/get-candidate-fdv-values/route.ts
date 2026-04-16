import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");
  const directoryCollection = db.collection("mmosh-app-project-directory");

  const { searchParams } = new URL(req.url);

  const candidateId = searchParams.get("candidate") as string;

  const tokenForResults = await collection
    .find({
      "candidate.CANDIDATE_ID": candidateId,
      position: "for",
    })
    .toArray();

  const tokenAgainstResults = await collection
    .find({
      "candidate.CANDIDATE_ID": candidateId,
      position: "against",
    })
    .toArray();

  const d = new Date();
  const filterDate = new Date(d.setDate(d.getDate() - 1));

  let forResult = 0;
  let againstResult = 0;

  const highestForCoin = {
    address: "---",
    amount: 0,
    name: "---",
    symbol: "---",
    image: "",
  };

  for (let index = 0; index < tokenForResults.length; index++) {
    const element = tokenForResults[index];

    // total volume calculation
    const volumeresult = await directoryCollection
      .aggregate([
        {
          $match: {
            bonding: element.bonding,
            created_date: { $gte: filterDate },
          },
        },
        {
          $group: {
            _id: {},
            totalAmount: { $sum: "$value" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
    let totalVolume = 0;
    for (let index = 0; index < volumeresult.length; index++) {
      const volumeelement = volumeresult[index];
      totalVolume = volumeelement.totalAmount;
    }

    const priceSortFilter: any = {
      created_date: 1,
    };

    const onehourResult2 = await directoryCollection
      .find({
        bonding: element.bonding,
      })
      .sort(priceSortFilter)
      .limit(1)
      .toArray();

    let oneHourPriceEnd = 0;
    for (let index = 0; index < onehourResult2.length; index++) {
      const volumeelement = onehourResult2[index];
      oneHourPriceEnd = volumeelement.price;
    }

    const result = totalVolume * oneHourPriceEnd;

    if (result > highestForCoin.amount) {
      highestForCoin.amount = result;
      highestForCoin.name = element.name;
      highestForCoin.symbol = element.symbol;
      highestForCoin.address = element.address;
      highestForCoin.image = element.image;
    }

    forResult += result;
  }

  for (let index = 0; index < tokenAgainstResults.length; index++) {
    const element = tokenAgainstResults[index];

    // total volume calculation
    const volumeresult = await directoryCollection
      .aggregate([
        {
          $match: {
            bonding: element.bonding,
            created_date: { $gte: filterDate },
          },
        },
        {
          $group: {
            _id: {},
            totalAmount: { $sum: "$value" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();
    let totalVolume = 0;
    for (let index = 0; index < volumeresult.length; index++) {
      const volumeelement = volumeresult[index];
      totalVolume = volumeelement.totalAmount;
    }

    const priceSortFilter: any = {
      created_date: 1,
    };

    const onehourResult2 = await directoryCollection
      .find({
        bonding: element.bonding,
      })
      .sort(priceSortFilter)
      .limit(1)
      .toArray();

    let oneHourPriceEnd = 0;
    for (let index = 0; index < onehourResult2.length; index++) {
      const volumeelement = onehourResult2[index];
      oneHourPriceEnd = volumeelement.price;
    }

    againstResult += totalVolume * oneHourPriceEnd;
  }

  if (highestForCoin.address === "---") {
    const [forCoin] = tokenForResults;

    if (forCoin) {
      highestForCoin.address = forCoin.token;
      highestForCoin.name = forCoin.name;
      highestForCoin.symbol = forCoin.symbol;
      highestForCoin.image = forCoin.image;
    } else {
      const [againstCoin] = tokenAgainstResults;

      if (againstCoin) {
        highestForCoin.address = againstCoin.token;
        highestForCoin.name = againstCoin.name;
        highestForCoin.symbol = againstCoin.symbol;
        highestForCoin.image = againstCoin.image;
      }
    }
  }

  return NextResponse.json({
    againstResult,
    forResult,
    total: againstResult + forResult,
    coin: highestForCoin,
  });
}
