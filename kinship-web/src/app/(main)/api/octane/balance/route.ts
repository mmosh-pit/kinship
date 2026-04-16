import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);  
  const wallet = searchParams.get("wallet") ? searchParams.get("wallet") as string : "";

  const userCollection = db.collection("users");
  const gasBalanceCollection = db.collection("mmosh-app-gas-balance");
  try {
    const findUser = await userCollection.findOne({ wallet: wallet });

    if (!findUser) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    } 
    let gasdata:any = await gasBalanceCollection.findOne({
      wallet: wallet,
    });

    return NextResponse.json(
        gasdata,
    { status: 200 }
    );
  } catch (error: any) {
    console.log(error, "from the api ======================>");
    return NextResponse.json(
      { message: error.message || "something went wrong" },
      { status: 400 }
    );
  }
}
