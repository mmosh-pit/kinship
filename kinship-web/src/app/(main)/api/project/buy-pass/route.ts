import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
    const collection = db.collection("mmosh-app-project-pass");
  
    const { key } = await req.json();
  
    const passAccount = await collection.findOne({
      key,
    });
  
    if (passAccount) {
      await collection.updateOne(
        {
          _id: passAccount._id,
        },
        {
          $set: {
              sold: passAccount.sold + 1,
          },
        },
      );
      return NextResponse.json("", { status: 200 });
    }
    return NextResponse.json("Stake account not found", { status: 400 });
  }
  