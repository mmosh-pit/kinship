import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const collection = db.collection("mmosh-app-stake");

    const { searchParams } = new URL(req.url);
    const param = searchParams.get("key");
  
    const stakeAccount = await collection.findOne(
      {
        "key": param,
      },
    );
  
    return NextResponse.json(!!stakeAccount, {
      status: 200,
    });
  }
  