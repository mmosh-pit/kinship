import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getExplorerLink } from "@solana-developers/helpers";
import * as anchor from "@coral-xyz/anchor";
import {
  createBurnInstruction,
  getAssociatedTokenAddress,
} from "forge-spl-token";

export async function burnToken({
  mintAddress,
  amount,
  decimals,
  wallet,
}: any): Promise<boolean> {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!);
  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });

  try {
    const mintPubkey = new PublicKey(mintAddress);

    const walletPubkey = wallet.publicKey;

    const userTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey,
    );

    const burnAmount = amount * 10 ** decimals;

    const instructions = [
      createBurnInstruction(
        userTokenAccount,
        mintPubkey,
        walletPubkey,
        burnAmount,
      ),
    ];

    const blockhash = await connection
      .getLatestBlockhash()
      .then((res) => res.blockhash);

    const messageV0 = new TransactionMessage({
      payerKey: walletPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    const txid = await env.sendAndConfirm(transaction);

    const explorerLink = getExplorerLink("transaction", txid, "mainnet-beta");

    console.log(`✅ Burn Transaction: ${explorerLink}`);
    return true;
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );

    return false;
  }
}
