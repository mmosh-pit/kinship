import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  Message,
  MessageV0,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { convertSolToUSDC, getJupiterPrices } from "@/lib/juipter";
import nacl from "tweetnacl";

export async function POST(req: NextRequest) {
  console.log("inside the octane gas fees ==================>>");
  const userCollection = db.collection("users");
  const { userWallet, serialized } = await req.json();
  const gasBalanceCollection = db.collection("mmosh-app-gas-balance");

  try {
    const findUser = await userCollection.findOne({ wallet: userWallet });
    if (!findUser) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    // let gasdata:any = await gasBalanceCollection.findOne({
    //     wallet: userWallet,
    // });

    // if (!gasdata) {
    //   return NextResponse.json({ message: "Gas balance not available" }, { status: 404 });
    // }

    // if(gasdata.gasBalance < 1) {
    //   return NextResponse.json({ message: "User atleast have 1 USDC as balance" }, { status: 404 });
    // }

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
      confirmTransactionInitialTimeout: 120000,
    });
    let adminWallet = new NodeWallet(ptvOwner);
    const env = new anchor.AnchorProvider(connection, adminWallet, {
      preflightCommitment: "processed",
    });
    let userConn: UserConn = new UserConn(env, web3Consts.programID);

    // ✅ Deserialize the FULL SIGNED transaction
    // const txBytes = Buffer.from(serialized, "hex");
    const txBytes = new Uint8Array(Buffer.from(serialized, "hex"));
    console.log("===========txBytes==================", txBytes);
    let transaction: Transaction | VersionedTransaction;

    try {
      console.log("================= CHECK 1 ==============");
      // ✅ Try to deserialize as FULL VersionedTransaction (not just message)
      transaction = VersionedTransaction.deserialize(txBytes);

      console.log("✅ Deserialized VersionedTransaction");
      console.log("Existing signatures:", transaction.signatures.length);

      const backendSignature = nacl.sign.detached(
        new Uint8Array(transaction.message.serialize()),
        ptvOwner.secretKey,
      );

      // Backend signs
      transaction.addSignature(ptvOwner.publicKey, backendSignature);

      console.log("✅ VersionedTransaction - Fee payer changed to backend");
    } catch (versionedError) {
      // ✅ Try to deserialize as FULL Legacy Transaction
      transaction = Transaction.from(txBytes);

      console.log("✅ Deserialized Legacy Transaction");
      console.log("Existing signatures:", transaction.signatures.length);

      // ✅ Backend adds signature (partialSign preserves existing signatures)
      transaction.partialSign(ptvOwner);

      console.log("✅ Legacy Transaction - Fee payer changed to backend");
      console.log("Total signatures:", transaction.signatures.length);
    }

    // Send transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, preflightCommitment: "confirmed" },
    );

    console.log("Transaction sent:", signature);

    await connection.confirmTransaction(signature, "confirmed");

    console.log("Transaction confirmed:", signature);

    // Get transaction details
    const transactionDetails = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!transactionDetails) {
      return NextResponse.json(
        { message: "Transaction not available in network" },
        { status: 404 },
      );
    }

    const fee =
      (transactionDetails.meta?.fee || 0) / web3Consts.LAMPORTS_PER_OPOS;
    const gasUsed = await convertSolToUSDC(fee);

    // Update gas balance
    // const currentBalance = gasdata.gasBalance;
    const newBalance = 50;
    // await gasBalanceCollection.updateOne(
    //   { wallet: userWallet },
    //   { $set: { gasBalance: newBalance, updatedAt: new Date() } }
    // );

    console.log("Gas used (USDC):", gasUsed);
    console.log("New balance:", newBalance);

    return NextResponse.json(
      {
        signature,
        gasUsed,
        newBalance,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error processing transaction:", error);
    return NextResponse.json(
      {
        message: "Something went wrong",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
