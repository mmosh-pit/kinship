import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import { getLineage } from "@/app/(main)/lib/forge/createProfile";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Connection, Keypair } from "@solana/web3.js";
import { Connectivity as UserConn } from "@/anchor/user";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { web3Consts } from "@/anchor/web3Consts";
import * as anchor from "@coral-xyz/anchor";

export async function POST(req: NextRequest) {
  try {
    const collection = db.collection("mmosh-app-staked-history");
    const { purchaseId } = await req.json();

    const stakedHistory: any = await collection.findOne({
      purchaseId: purchaseId,
    });
    let errorMessage = "";
    if (stakedHistory === null) {
      errorMessage = "staked history could not be found.";
    }
    let hasUnstaked: boolean = true;
    if (stakedHistory !== null) {
      for (let i = 0; i < stakedHistory.royalty.length; i++) {
        const element = stakedHistory.royalty[i];
        hasUnstaked = !element.isUnstaked;
      }
    }
    console.log("hasUnstaked", hasUnstaked);
    if (!hasUnstaked) {
      errorMessage = "Funds already distributed to the pool.";
    }

    if (errorMessage) {
      return NextResponse.json(
        {
          status: false,
          message: errorMessage,
          result: null,
        },
        { status: 200 }
      );
    }

    const adminPrivateKey = process.env.PTV_WALLET!;
    const private_buffer = bs58.decode(adminPrivateKey);
    const private_arrray = new Uint8Array(
      private_buffer.buffer,
      private_buffer.byteOffset,
      private_buffer.byteLength / Uint8Array.BYTES_PER_ELEMENT
    );
    let ptvOwner = Keypair.fromSecretKey(private_arrray);

    let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    let connection = new Connection(rpcUrl, {
      confirmTransactionInitialTimeout: 120000,
    });
    let wallet = new NodeWallet(ptvOwner);
    const env = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });
    let userConn: UserConn = new UserConn(env, web3Consts.programID);
    let balance: any = await userConn.getUserBalance({
      address: wallet.publicKey,
      token: web3Consts.usdcToken.toBase58(),
      decimals: 6,
    });
    if (balance * 10 ** 6 < stakedHistory.stakedAmount) {
      return NextResponse.json(
        {
          status: false,
          message: "Not enough funds in the admin wallet to claim the reward.",
        },
        { status: 200 }
      );
    }

    let txis = [];

    let instructions: any = await userConn.baseSpl.transfer_token_modified({
      mint: new anchor.web3.PublicKey(web3Consts.usdcToken),
      sender: wallet.publicKey,
      receiver: new anchor.web3.PublicKey(
        process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
      ),
      init_if_needed: true,
      amount: Math.ceil((stakedHistory.stakedAmount * 65) / 100),
    });
    for (let i = 0; i < instructions.length; i++) {
      txis.push(instructions[i]);
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
      payerKey: new anchor.web3.PublicKey(
        process.env.NEXT_PUBLIC_PTV_WALLET_KEY || ""
      ),
      recentBlockhash: blockhash,
      instructions: [...txis],
    }).compileToV0Message([]);

    const tx = new anchor.web3.VersionedTransaction(message);
    tx.sign([ptvOwner]);
    const signature = await userConn.provider.sendAndConfirm(tx);
    return NextResponse.json(
      {
        status: true,
        signature: signature,
        message: "Reward amount distributed to the pool",
      },
      { status: 200 }
    );
  } catch (error) {
    console.log("claim error ", error);
    return NextResponse.json(
      {
        status: false,
        message: "Something went wrong; please try again later.",
      },
      { status: 200 }
    );
  }
}

const calculatePriorityFee = async (
  ixs: any,
  mintKp: any,
  userConn: UserConn
) => {
  let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  let connection = new Connection(rpcUrl, {
    confirmTransactionInitialTimeout: 120000,
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
      })
    );
    feeIns.push(
      anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      })
    );
  } else {
    feeIns.push(
      anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      })
    );
  }

  return feeIns;
};
