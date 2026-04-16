import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import * as anchor from "@coral-xyz/anchor";

import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT,
} from "forge-spl-token";
import { getExplorerLink } from "@solana-developers/helpers";
import { getOrCreateTokenAccountInstruction } from "./getOrCreateAssociatedTokenAccount";
import { FrostWallet } from "./frostWallet";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { ConnectionContextState } from "./connection";
import { convertSolToUSDC } from "@/lib/juipter";

export async function transferAsset(
  wallet: FrostWallet,
  connection: ConnectionContextState,
  mintAddress: string,
  receiver: string,
  amount: string,
  decimals: number,
  isMax: boolean,
  retries = 0,
  topup = false
): Promise<string> {
  try {
    // connection to Solana.
    const env = new anchor.AnchorProvider(connection.connection, wallet, {
      preflightCommitment: "processed",
    });

    anchor.setProvider(env);
    let userConn: UserConn = new UserConn(env, web3Consts.programID);

    // Mint address of the NFT.
    const mintPubkey = new PublicKey(mintAddress);
    // Recipient of the NFT.
    const receiverPubkey = new PublicKey(receiver);

    const instructions = [];



    const decimalMultiplier =
    Number("1".padEnd(decimals, "0")) * (decimals === 0 ? 1 : 10);

    if(mintAddress == NATIVE_MINT.toBase58()) {
        let finalAmount = Math.ceil(Number(amount) * decimalMultiplier)
        if(isMax) {
            let finalFee = await getFinalFee(finalAmount, wallet.publicKey, receiverPubkey, userConn);
            finalAmount = finalAmount - finalFee;
        } 
        const transferIx = anchor.web3.SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: receiverPubkey,
          lamports: finalAmount,
        });
        instructions.push(transferIx);
    } else {
      let createShare:any =  await userConn.baseSpl.transfer_token_modified({ mint: mintPubkey, sender: wallet.publicKey, receiver: receiverPubkey, init_if_needed: true, amount: Math.ceil(Number(amount) * decimalMultiplier)});
      for (let index = 0; index < createShare.length; index++) {
          instructions.push(createShare[index]);
      }
    }


    const transaction = new anchor.web3.Transaction().add(...instructions);

    transaction.recentBlockhash = (
      await userConn.connection.getLatestBlockhash()
    ).blockhash;
    transaction.feePayer = topup ? wallet.publicKey : new PublicKey(process.env.NEXT_PUBLIC_PTV_WALLET_KEY!);

    const feeEstimate = await userConn.getPriorityFeeEstimate(transaction);
    let feeIns;
    if (feeEstimate > 0) {
      feeIns = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: feeEstimate,
      });
    } else {
      feeIns = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      });
    }
    transaction.add(feeIns);
    let txid;
    if(topup) {
      txid = await userConn.provider.sendAndConfirm(transaction);
    } else {
      const signedTx = await wallet.signTransaction(transaction as any);
      txid = await connection.sendAndConfirm(signedTx as any, wallet.publicKey.toBase58());
    }
    const explorerLink = getExplorerLink("transaction", txid, "mainnet-beta");
    return explorerLink;
  } catch (err) {
    console.error("Got error trying to send: ", err);
    return "";
  }
}

const getFinalFee = async(amountLamports: any, sender: PublicKey, receiver: PublicKey, userConn: UserConn) => {
  // 1. Create the transfer instruction
  const transferIx = anchor.web3.SystemProgram.transfer({
    fromPubkey: sender,
    toPubkey: receiver,
    lamports: amountLamports,
  });

    // 2. Build transaction (add transfer only first)
  const tx = new anchor.web3.Transaction().add(transferIx);

  // Dummy sign for serialization
  tx.recentBlockhash = (await userConn.connection.getLatestBlockhash()).blockhash;
  tx.feePayer = sender;

  let feeEstimate = await userConn.getPriorityFeeEstimate(tx);
  console.log("feeEstimate ", feeEstimate)

  const baseFee = 5000 * tx.signatures.length;
  console.log("basefee ", baseFee)
  const computeUnitLimit = 1_400_000;
  let priorityFee =  Math.floor((feeEstimate * computeUnitLimit) / 1_000_000)
  console.log("priorityFee ", priorityFee)
  const totalFee = baseFee + priorityFee ;

  const rentBuffer = 2039280; 

  console.log("totalFee ", totalFee)
  
  return totalFee + rentBuffer
}

