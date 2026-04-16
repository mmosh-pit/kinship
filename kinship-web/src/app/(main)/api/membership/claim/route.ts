import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { Connectivity as UserConn } from "@/anchor/user";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { web3Consts } from "@/anchor/web3Consts";

export async function POST(req: NextRequest) {
    try {
        const { amount, address, parentAddress } = await req.json();
        const adminPrivateKey = process.env.PTV_WALLET!;
        const private_buffer = bs58.decode(adminPrivateKey);
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
        let userConn: UserConn = new UserConn(env, web3Consts.programID);
        let balance: any = await userConn.getUserBalance({
            address: wallet.publicKey,
            token: web3Consts.usdcToken.toBase58(),
            decimals: 6
        })
        try {
            new PublicKey(address);
            new PublicKey(parentAddress);
        } catch {
            return NextResponse.json(
                {
                    status: false,
                    message: "Invalid Solana address",
                },
                { status: 400 }
            );
        }
        if (balance * 10 ** 6 < amount * 10 ** 6) {
            return NextResponse.json(
                {
                    status: false,
                    message: "Not enough fund to distribute claim"
                },
                { status: 200 });
        }

        let txis = []
        let clamInstructions: any = await userConn.baseSpl.transfer_token_modified({ mint: new anchor.web3.PublicKey(web3Consts.usdcToken), sender: wallet.publicKey, receiver: new anchor.web3.PublicKey(address), init_if_needed: true, amount: Math.ceil((amount * 10 ** 6) * 90 / 100) });
        let clamInstructions2: any = await userConn.baseSpl.transfer_token_modified({
            mint: new anchor.web3.PublicKey(web3Consts.usdcToken),
            sender: wallet.publicKey,
            receiver: new anchor.web3.PublicKey(parentAddress),
            init_if_needed: true,
            amount: Math.ceil((amount * 10 ** 6) * 10 / 100),
        });
        for (let i = 0; i < clamInstructions.length; i++) {
            txis.push(clamInstructions[i]);
        }
        for (let i = 0; i < clamInstructions2.length; i++) {
            txis.push(clamInstructions2[i]);
        }

        const freezeInstructions = await calculatePriorityFee(
            txis,
            ptvOwner,
            userConn
        );
        for (let j = 0; j < freezeInstructions.length; j++) {
            const element = freezeInstructions[j];
            txis.push(element);
        }

        const blockhash = (await connection.getLatestBlockhash()).blockhash;
        const message = new anchor.web3.TransactionMessage({
            payerKey: new anchor.web3.PublicKey(address),
            recentBlockhash: blockhash,
            instructions: [...txis],
        }).compileToV0Message([]);

        const tx = new anchor.web3.VersionedTransaction(message);
        tx.sign([ptvOwner])
        const serialized = Buffer.from(tx.serialize()).toString('base64');

        return NextResponse.json(
            {
                status: true,
                transaction: serialized,
                message: "Ready to claim"
            },
            { status: 200 });

    } catch (error) {
        console.log("error ", error)
        return NextResponse.json(
            {
                status: false,
                message: "Something went wrong"
            },
            { status: 200 });
    }
}

const calculatePriorityFee = async (ixs: any, mintKp: any, userConn: UserConn) => {
    let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    let connection = new Connection(rpcUrl, {
        confirmTransactionInitialTimeout: 120000
    });
    const blockhash = (await connection.getLatestBlockhash()).blockhash;
    const message = new anchor.web3.TransactionMessage({
        payerKey: userConn.provider.publicKey,
        recentBlockhash: blockhash,
        instructions: [...ixs],
    }).compileToV0Message([]);

    const tx = new anchor.web3.VersionedTransaction(message);
    tx.sign([mintKp]);

    const feeEstimate = await userConn.getPriorityFeeEstimate(tx);
    let feeIns: any = [];
    if (feeEstimate > 0) {
        feeIns.push(
            anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: feeEstimate,
            }),
        );
        feeIns.push(
            anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
                units: 1_400_000,
            }),
        );
    } else {
        feeIns.push(
            anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
                units: 1_400_000,
            }),
        );
    }

    return feeIns;
}