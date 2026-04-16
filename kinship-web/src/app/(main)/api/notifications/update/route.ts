import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
    const collection = db.collection("mmosh-app-notifications");
  
    const { wallet } = await req.json();
  
    const notification = await collection.findOne({
      receiver: wallet,
    });
  
    if (notification) {
      await collection.updateMany(
        {
          receiver: wallet,
        },
        {
          $set: {
            unread: 0,
          },
        },
      );
      return NextResponse.json("", { status: 200 });
    }
    return NextResponse.json("Notification not found", { status: 400 });
}
  