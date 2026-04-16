import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Connectivity as UserConn } from "@/anchor/user";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { web3Consts } from "@/anchor/web3Consts";

export async function POST(req: NextRequest) {
    try {
        
        const collection = db.collection("mmosh-app-ptv");
        const { address, type, coin } = await req.json();

        const result = await db.collection("mmosh-app-project-stake").findOne({coin:coin});
        if(!result) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "coin not available"
                }, 
            { status: 200 });
        }
        let claimDate = convertUTCDateToLocalDate(new Date(result.unlockDate))
        let dateDiff = claimDate.getTime() - new Date().getTime() ;
        if(dateDiff > 0) {
            return NextResponse.json({status: false, message: "Pls try cliam after "+result.unlockDate}, { status: 200 });
        }

        const ptvData = await collection.findOne({
            wallet: address,
        });

        if(!ptvData) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "Claim not available"
                }, 
            { status: 200 });
        }
        
        let amount = ptvData.available
        let tokenAddress:any = ptvData.coin


        if(amount === 0) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "Claim not available"
                }, 
            { status: 200 });
        }
        const privateKey = process.env.PTV_WALLET!;

        
        const private_buffer = bs58.decode(privateKey);
        const private_arrray = new Uint8Array(
        private_buffer.buffer,
        private_buffer.byteOffset,
        private_buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT,
        );
        let ptvOwner = Keypair.fromSecretKey(private_arrray)

        let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
        let connection = new Connection(rpcUrl, {
            confirmTransactionInitialTimeout: 120000
        });
        let wallet = new NodeWallet(ptvOwner);
        const env = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
        });
        let userConn: UserConn = new UserConn(env, web3Consts.programID);

        let balance:any = await userConn.getUserBalance({
            address: wallet.publicKey,
            token: tokenAddress,
            decimals: web3Consts.LAMPORTS_PER_OPOS
        })

        if(balance < amount) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "Not enough fund to distribute claim"
                }, 
            { status: 200 });
        }

        let txis = []
        let clamInstructions:any =  await userConn.baseSpl.transfer_token_modified({ mint: new anchor.web3.PublicKey(tokenAddress), sender: wallet.publicKey, receiver: new anchor.web3.PublicKey(address), init_if_needed: true, amount: Math.ceil(amount * web3Consts.LAMPORTS_PER_OPOS)});
        for (let index = 0; index < clamInstructions.length; index++) {
            txis.push(clamInstructions[index]);
        }

        const freezeInstructions = await calculatePriorityFee(
            txis,
            ptvOwner,
            userConn
          );
    
        console.log("mint pass 12");
        for (let index = 0; index < freezeInstructions.length; index++) {
        const element = freezeInstructions[index];
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

const convertUTCDateToLocalDate = (date: any) => {
    var newDate = new Date(date.getTime()+date.getTimezoneOffset()*60*1000);
    var offset = date.getTimezoneOffset() / 60;
    var hours = date.getHours();
    newDate.setHours(hours - offset);
    return newDate;   
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