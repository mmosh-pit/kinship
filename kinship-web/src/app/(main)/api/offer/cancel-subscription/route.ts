import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
    const collection = db.collection("mmosh-app-offer-subscription");
    const { wallet, offer } = await req.json();

    const data = await collection
    .findOne({offer, wallet})



    if(data) {
        let currentDate = new Date();
        let endEnd = new Date(
          data.end,
        );
        if (endEnd < currentDate) {
          return NextResponse.json(
            false,
            {
              status: 200,
            },
          );
        }
        await collection.updateOne(
            {
              _id: data._id,
            },
            {
              $set: {
                status: data.status === "active" ? "cancelled": "active",
              },
            },
        );
    }

    return NextResponse.json(
        true,
        {
          status: 200,
        },
      );
}