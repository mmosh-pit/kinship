import { db } from "@/app/(main)/lib/mongoClient";
import { getSession } from "@/app/(main)/lib/session";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-user-wallet");
  const data = await req.json();
  const session:any = await getSession();
  if (!session.user) {
    console.log("user session not found")
    return NextResponse.json(null, {
        status: 200,
    });
  }

  let result:any = await collection.findOne({email: session.user.email});
  if(!result) {
    console.log("wallet data not exist")
    return NextResponse.json(null, {
        status: 200,
    });
  }

  let baseurl = process.env.NEXT_PUBLIC_WALLET_URL + "sign"
  let apiresult = await axios.post(baseurl,{
    address: result.address,
    message: data.message,
    key: result.private
  });

  return NextResponse.json({signature: apiresult.data.data, address: result.address}, {
    status: 200,
  });
}