import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Connection, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { web3Consts } from "@/anchor/web3Consts";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");
  const directoryCollection = db.collection("mmosh-app-directory");
  const tokenPriceCollection = db.collection("mmosh-app-token-price");

  const { searchParams } = new URL(req.url);

  const keyword = searchParams.get("keyword");
  const limit = 20;
  const offset = Number(searchParams.get("page")) * limit;

  const volumeParam = searchParams.get("volume");

  const volume = volumeParam || "1h";

  const basesymbol = searchParams.get("symbol");

  const wallet = new NodeWallet(new Keypair());
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
    confirmTransactionInitialTimeout: 120000,
  });

  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });

  anchor.setProvider(env);
  const curveConn = new CurveConn(env, web3Consts.programID);
  let finalResult: any = [];

  let filter: any = {};

  if (keyword) {
    filter = {
      $and: [
        {
          $or: [
            {
              targetname: {
                $regex: new RegExp(keyword, "ig"),
              },
            },
            {
              targetsymbol: {
                $regex: new RegExp(keyword, "ig"),
              },
            },
          ],
        },
      ],
    };
  }

  if (basesymbol !== "All") {
    if (filter.$and) {
      filter.$and = [...filter.$and, { basesymbol: basesymbol }];
    } else {
      filter.$and = [{ basesymbol: basesymbol }];
    }
  }

  const d = new Date();
  let filterDate;

  if (volume === "1h") {
    filterDate = new Date(d.setHours(d.getHours() - 1));
  } else if (volume === "1d") {
    filterDate = new Date(d.setDate(d.getDate() - 1));
  } else if (volume === "1w") {
    filterDate = new Date(d.setDate(d.getDate() - 7));
  } else if (volume === "1m") {
    filterDate = new Date(d.setMonth(d.getMonth() - 1));
  } else if (volume === "1y") {
    filterDate = new Date(d.setFullYear(d.getFullYear() - 1));
  }

  if (filter.$and) {
    filter.$and = [...filter.$and, { created_date: { $gte: filterDate } }];
  } else {
    filter.$and = [{ created_date: { $gte: filterDate } }];
  }

  const volumeresult = await directoryCollection
    .aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: "$bonding",
          totalAmount: { $sum: "$value" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          targetname: 1,
          targetsymbol: 1,
          targetimg: 1,
          basesymbol: 1,
          totalAmount: 1,
        },
      },
    ])
    .sort({ totalAmount: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  for (let index = 0; index < volumeresult.length; index++) {
    const element = volumeresult[index];
    const details = await collection.findOne({ bonding: element._id });
    if (!details) {
      continue;
    }

    // last hour price
    const onehourResult1 = await directoryCollection
      .find({
        bonding: element._id,
        created_date: {
          $lte: new Date(new Date().setHours(new Date().getHours() - 1)),
        },
      })
      .sort({ created_date: -1 })
      .limit(1)
      .toArray();

    const onehourResult2 = await directoryCollection
      .find({
        bonding: element._id,
      })
      .sort({ created_date: -1 })
      .limit(1)
      .toArray();

    let oneHourPriceStart = 0;
    for (let index = 0; index < onehourResult1.length; index++) {
      const volumeelement = onehourResult1[index];
      oneHourPriceStart = volumeelement.price;
    }

    let oneHourPriceEnd = 0;
    for (let index = 0; index < onehourResult2.length; index++) {
      const volumeelement = onehourResult2[index];
      oneHourPriceEnd = volumeelement.price;
    }

    // last day price
    const oneDatResult1 = await directoryCollection
      .find({
        bonding: element._id,
        created_date: {
          $lte: new Date(new Date().setDate(new Date().getDate() - 1)),
        },
      })
      .sort({ created_date: -1 })
      .limit(1)
      .toArray();

    const oneDatResult2 = await directoryCollection
      .find({
        bonding: element._id,
      })
      .sort({ created_date: -1 })
      .limit(1)
      .toArray();

    let oneDayPriceStart = 0;
    for (let index = 0; index < oneDatResult1.length; index++) {
      const volumeelement = oneDatResult1[index];
      oneDayPriceStart = volumeelement.price;
    }

    let oneDayPriceEnd = 0;
    for (let index = 0; index < oneDatResult2.length; index++) {
      const volumeelement = oneDatResult2[index];
      oneDayPriceEnd = volumeelement.price;
    }

    let supply: any = await getSupply(element._id, curveConn);
    let priceresult = await tokenPriceCollection
      .find({ key: element._id })
      .limit(1)
      .sort({ created_date: -1 })
      .toArray();
    let price = 0;
    if (priceresult.length > 0) {
      price = priceresult[0].price;
    }

    const labels = [];
    for (let index = 0; index < 7; index++) {
      let volType = new Date(new Date().setDate(new Date().getDate() - index));
      labels.push({
        label: volType.toLocaleString("en-us", {
          month: "short",
          day: "numeric",
        }),
        value: 0,
      });
    }

    const buyresult = await directoryCollection
      .aggregate([
        {
          $match: {
            created_date: { $gte: new Date(d.setDate(d.getDate() - 13)) },
          },
        },
        {
          $group: {
            _id: { year: { date: "$created_date" } },
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

        if (
          new Date(buyelement._id.year.date).toLocaleString("en-us", {
            month: "short",
            day: "numeric",
          }) == element.label
        ) {
          labels[index].value = labels[index].value + buyelement.totalAmount;
        }
      }
    }

    finalResult.push({
      name: details.name,
      symbol: details.symbol,
      image: details.image,
      bonding: element._id,
      volume: element.totalAmount,
      basesymbol: details.basesymbol,
      oneHourPriceStart,
      oneHourPriceEnd,
      oneDayPriceStart,
      oneDayPriceEnd,
      supply,
      lastprice: price,
      priceLastSevenDays: labels,
    });
  }

  return NextResponse.json(finalResult, {
    status: 200,
  });
}

const getSupply = async (bonding: any, curveConn: CurveConn) => {
  try {
    const bondingResult = await curveConn.getTokenBonding(
      new anchor.web3.PublicKey(bonding),
    );
    if (bondingResult) {
      return (
        bondingResult.supplyFromBonding.toNumber() /
        web3Consts.LAMPORTS_PER_OPOS
      );
    } else {
      return 0;
    }
  } catch (error) {
    console.log("error ", error);
    return 0;
  }
};
