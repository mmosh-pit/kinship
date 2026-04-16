import { getOrCreateTokenAccountOptons } from "@/anchor/base/baseSpl";
import { web3 } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "forge-spl-token";

export async function getOrCreateTokenAccountInstruction(
  input: getOrCreateTokenAccountOptons,
  connection: Connection,
) {
  let { owner, mint, allowOffCurveOwner } = input;
  allowOffCurveOwner = allowOffCurveOwner ?? false;

  const ata = getAssociatedTokenAddressSync(mint, owner, allowOffCurveOwner);
  let ix: web3.TransactionInstruction | null = null;
  const info = await connection.getAccountInfo(ata);

  if (!info) {
    ix = createAssociatedTokenAccountInstruction(owner, ata, owner, mint);
  }

  return {
    ata,
    ix,
  };
}
