import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  console.log("inside the ocatane gas fees ==================>>");

  const { wallet, gasBalance, token } = await req.json();

  const userCollection = db.collection("users");
  const gasBalanceCollection = db.collection("mmosh-app-gas-balance");
  try {
    const findUser = await userCollection.findOne({ wallet: wallet });

    if (!findUser) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    } 
    let existingBalance:any = await gasBalanceCollection.findOne({
      wallet: wallet,
    });

      if (!existingBalance) {
        let insertGasBalance = await gasBalanceCollection.insertOne({
          wallet: wallet,
          gasBalance: gasBalance,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(insertGasBalance, "insertGasBalance ==========>");
        return NextResponse.json(insertGasBalance, { status: 200 });
      } else {
        const currentBalance = existingBalance.gasBalance;
        const newBalance = currentBalance + gasBalance;
        await gasBalanceCollection.updateOne(
          { wallet },
          { $set: { gasBalance: newBalance, updatedAt: new Date() } }
        );
      }
      return NextResponse.json(
        {
          status: true,
        },
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