import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import { Connection, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { web3Consts } from "@/anchor/web3Consts";

export async function GET(req: NextRequest) {
    const collection = db.collection("mmosh-app-tokens");

    const { searchParams } = new URL(req.url);
    const limit = 10;
    const page = searchParams.get("page");
    let offset = 0;
    if(page) {
        offset  = Number(page) * limit;
    }


    const tokenList = await collection
    .find({})
    .skip(offset)
    .limit(limit)
    .toArray();

    if(tokenList.length == 0) {
        return NextResponse.json(tokenList, {
            status: 200,
        });
    }

    let rpcUrl:any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    let connection = new Connection(rpcUrl, {
      confirmTransactionInitialTimeout: 120000
    })

    let wallet = new NodeWallet(new Keypair());
    const env = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });
    let curveConn: CurveConn = new CurveConn(env, web3Consts.programID);
    let prices = []
    for (let index = 0; index < tokenList.length; index++) {
        const element = tokenList[index];
        let curve = await curveConn.getPricing(
            new anchor.web3.PublicKey(element.bonding),
        )

        const buyValue = await curve!.sellTargetAmount(Math.random() * (1 - 0.95) + 0.95)

        prices.push({
            key: element.bonding,
            price: buyValue,
            type: element.base.symbol
        })
    }


    return NextResponse.json(prices, {
        status: 200,
    });
}



