import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const { coin, address, method, value, wallet } = await req.json();
    const collection = db.collection("mmosh-app-ptv");

    const ptvData = await collection.findOne(
        {
          wallet,
          coin
        },
    );

    if(ptvData) {
        if(method === "buy") {
            let swapped = 0;
            let available = 0;
              if((ptvData.reward - ptvData.swapped) > value) {
                  swapped = ptvData.swapped + value
                  available = ptvData.available
              } else {
                  let remainswapped = (value - (ptvData.reward - ptvData.swapped))
                  swapped =  ptvData.swapped + remainswapped
                  available = ptvData.available - (value - remainswapped)
              }
              await collection.updateOne(
                  {
                    _id: ptvData._id,
                  },
                  {
                    $set: {
                      available: available,
                      swapped: swapped,
                    },
                  },
              );
        } else if(method === "unstake") {

            await collection.updateOne(
              {
                _id: ptvData._id,
              },
              {
                $set: {
                  available: 0,
                  claimed: ptvData.claimed + ptvData.available
                },
              },
            );
          
        } else {
            let available = ptvData.available + value
            await collection.updateOne(
                {
                  _id: ptvData._id,
                },
                {
                  $set: {
                    available: available,
                  },
                },
            );
            
        }
    }
    return NextResponse.json("", { status: 200 });
}