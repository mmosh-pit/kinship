import { getSession } from "@/app/(main)/lib/session";
import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
export async function GET() {
  const session:any = await getSession();
  if (!session.user) {
    return NextResponse.json({status: false, data: ""}, {
        status: 200,
    });
  }
  const collection = db.collection("mmosh-app-user-wallet");
  let result:any = await collection.findOne({email: session.user.email});
  return NextResponse.json({status: true, data: result.address }, {
    status: 200,
  });
}