import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Connectivity as CommunityConn } from "@/anchor/community";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { web3Consts } from "@/anchor/web3Consts";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const collection = db.collection("mmosh-app-ptv");
    const { name, symbol, url, gensis, lut, receiver, key } = await req.json();

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

    let projectConn: CommunityConn = new CommunityConn(
      env,
      web3Consts.programID,
      new anchor.web3.PublicKey(key),
    );

    let res = await projectConn.mintFreePass(
      {
        name: name,
        symbol: symbol,
        uriHash: url,
        genesisProfile: gensis,
        commonLut: lut,
      },
      receiver,
    );

    if (res.Ok) {
      return NextResponse.json(
        {
          status: true,
          message: "free mint completed",
        },
        { status: 200 },
      );
    }
    NextResponse.json(
      {
        status: false,
        message: "Something went wrong",
      },
      { status: 200 },
    );
  } catch (error) {
    console.log("error ", error);
    return NextResponse.json(
      {
        status: false,
        message: "Something went wrong",
      },
      { status: 200 },
    );
  }
}
