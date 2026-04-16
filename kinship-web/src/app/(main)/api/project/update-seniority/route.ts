import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
    const collection = db.collection("bots");
  
    const { key } = await req.json();
  
    const project = await collection.findOne({
      key,
    });
  
    if (project) {
      await collection.updateOne(
        {
          _id: project._id,
        },
        {
          $set: {
            seniority: project.seniority + 1,
          },
        },
      );
      return NextResponse.json("", { status: 200 });
    }
    return NextResponse.json("Stake account not found", { status: 400 });
  }
  