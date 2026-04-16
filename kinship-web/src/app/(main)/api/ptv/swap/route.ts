import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { Connectivity as UserConn } from "@/anchor/user";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { web3Consts } from "@/anchor/web3Consts";

export async function POST(req: NextRequest) {
    try {
        
        const collection = db.collection("mmosh-app-ptv");
        const { address, supply, bonding, coin } = await req.json();

        if(supply === 0) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "Supply not available"
                }, 
            { status: 200 });
        }

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
        let dateDiff = new Date().getTime() - claimDate.getTime();
        if(dateDiff > 0) {
            return NextResponse.json({status: false, message: "Time is expired"}, { status: 200 });
        }

        const ptvData = await collection.findOne({
            wallet: address,
            coin
        });

        if(!ptvData) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "Claim not available"
                }, 
            { status: 200 });
        }

        let claimable = 0;
        let unstakable = 0
        if(ptvData) {
            claimable = ptvData.reward - ptvData.swapped
            unstakable = ptvData.available
        }

        if((claimable + unstakable) < supply) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "supply not enough"
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
        let curveConn: CurveConn = new CurveConn(env, web3Consts.programID);
        let userConn: UserConn = new UserConn(env, web3Consts.programID);

        let bondingAccount = await curveConn.getTokenBonding( new anchor.web3.PublicKey(bonding))
        if(!bondingAccount) {
            return NextResponse.json(
                {
                    status: false, 
                    message: "Something went wrong"
                }, 
            { status: 200 }); 
        }
        userConn.txis = []
        let txis = [];
        const { ata: minterProfileAta } =
        await userConn.baseSpl.__getOrCreateTokenAccountInstruction(
          { mint: bondingAccount?.targetMint, owner: new anchor.web3.PublicKey(address) },
          (userConn.ixCallBack),
        );

        for (let index = 0; index < userConn.txis.length; index++) {
            const element = userConn.txis[index];
            txis.push(element)
        }
        userConn.txis = []

        const tokenObj = await curveConn.buyInstructions({
            tokenBonding: new anchor.web3.PublicKey(bonding),
            desiredTargetAmount: new anchor.BN(
              Number(supply) * web3Consts.LAMPORTS_PER_OPOS,
            ),
            slippage: 0.5,
            destination: minterProfileAta,
        });
        for (let index = 0; index < tokenObj.instructions.length; index++) {
            const element = tokenObj.instructions[index];
            txis.push(element)
        }

        const freezeInstructions = await calculatePriorityFee(
            tokenObj.instructions,
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
                message: "Ready to buy"
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