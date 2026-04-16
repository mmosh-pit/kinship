import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { web3Consts } from "@/anchor/web3Consts";
import AmmImpl, { MAINNET_POOL } from '@mercurial-finance/dynamic-amm-sdk';
import axios from "axios";
import { Coin } from "@/app/(main)/models/coin";

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-tokens");
  const { searchParams } = new URL(req.url);
  const bonding = searchParams.get("bonding");
  if(!bonding) {
    return NextResponse.json({status: false, message:"bonding key param missing"}, {
      status: 200,
    });
  }

  const result = await collection.findOne({bonding, status:"active"});
  if(!result) {
    return NextResponse.json({status: false, message:"coin not exist"}, {
      status: 200,
    });
  }


  try {
    const privateKey = process.env.PTV_WALLET!;
    const private_buffer = bs58.decode(privateKey);
    const private_arrray = new Uint8Array(
      private_buffer.buffer,
      private_buffer.byteOffset,
      private_buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT,
    );
    let ptvOwner = Keypair.fromSecretKey(private_arrray);
  
    let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    let connection = new Connection(rpcUrl, {
      confirmTransactionInitialTimeout: 120000
    });
    let wallet = new NodeWallet(ptvOwner);
  
    console.log("wallet.publicKey.toBase58() ", wallet.publicKey.toBase58());
    const env = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });
  
    anchor.setProvider(env);

 
    const curveConn = new CurveConn(env, web3Consts.programID);
  
    const bondingResult = await curveConn.getTokenBonding(
      new anchor.web3.PublicKey(bonding),
    );
  
    if (!bondingResult) {
      return NextResponse.json({status: false, message:"bonding curve not exist"}, {
        status: 200,
      });
    }

    let usdPrice = await getTokenPrice(result.base);
   
    let marketCap = bondingResult.reserveBalanceFromBonding.toNumber() / (10 ** result.base.decimals);
    if(result.maxsupplyusd > (marketCap * usdPrice)) {
        return NextResponse.json({status: false, message:"Not enough marketcap to create pool"}, {
            status: 200,
        });
    }

    let currentDate = new Date();
    let expiryDate = new Date(result.expiredDate)
    if (expiryDate < currentDate) {
        return NextResponse.json({status: false, message:"Curve is expired"}, {
            status: 200,
        });
    }

    await collection.updateOne(
        {
          _id: result._id,
        },
        {
          $set: {
              status: "ready",
          },
        },
      );

    return NextResponse.json({status: true}, {
      status: 200,
  });
  } catch (error) {
    console.log("error ", error)
    return NextResponse.json({status: false, message:"something went wrong"}, {
      status: 200,
    });
  }

}

const getTokenPrice = async (token:Coin) => {
    try {
        const mmoshUsdcPrice = await axios.get(
            process.env.NEXT_PUBLIC_JUPITER_PRICE_API + `?ids=${token},${process.env.NEXT_PUBLIC_USDC_TOKEN}`,
          );
        return mmoshUsdcPrice.data?.data[token.symbol.toUpperCase()].price;
    } catch (error) {
        return 0.001
    }
};

const delay = (ms:any) => new Promise(res => setTimeout(res, ms));