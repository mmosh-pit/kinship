import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/mongoClient";
import bs58 from "bs58";
import { Connection, Keypair } from "@solana/web3.js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as CommunityConn } from "@/anchor/community";
import { web3Consts } from "@/anchor/web3Consts";

export async function POST(req: NextRequest) {
    const { receiver, supply, key, amount } = await req.json();
    const presaleCollection = db.collection("mmosh-app-presale-details");
    try {
        const presaleData = await presaleCollection.find({ key: key }).toArray();
        let error: string | null = null;
        if (amount < Number(presaleData[0].purchaseMinimum)) {
            error = `Amount should be greater than or equal to the ${presaleData[0].purchaseMinimum}.`;
        }
        if (amount > Number(presaleData[0].purchaseMaximum)) {
            error = `Amount should be less than or equal to ${presaleData[0].purchaseMaximum}.`;
        }
        if (error) {
            return NextResponse.json({ status: false, message: error }, {
                status: 200,
            });
        }

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
        const env = new anchor.AnchorProvider(connection, wallet, {
            preflightCommitment: "processed",
        });
        let projectConn: CommunityConn = new CommunityConn(
            env,
            web3Consts.programID,
            new anchor.web3.PublicKey(key),
        );

        const unstakeres = await projectConn.unStakeToken({
            stakeKey: new anchor.web3.PublicKey(receiver),
            mint: new anchor.web3.PublicKey(key),
            amount: Math.ceil(supply * (10 ** 9)),
        });
        const payload = { status: true, transaction: unstakeres, message: "" };
        return NextResponse.json(payload, {
            status: 200,
        });
    } catch (error) {
        console.log("token trasfer failes", error);
        return NextResponse.json({ status: false, message: "Something went wrong" }, {
            status: 200,
        });
    }
}