/**
 * Thin wrapper around the generated Anchor client. Import this from the
 * frontend or any Node scripts instead of constructing the Program manually.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Metadao } from "../../target/types/metadao";
import idl from "../../target/idl/metadao.json";

export const PROGRAM_ID = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

export class MetadaoClient {
  readonly program: Program<Metadao>;

  constructor(provider: anchor.AnchorProvider) {
    this.program = new Program(idl as unknown as Metadao, provider);
  }

  static daoPda(tokenMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("dao"), tokenMint.toBuffer()],
      PROGRAM_ID
    );
  }

  static proposalPda(dao: PublicKey, number: BN): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), dao.toBuffer(), number.toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );
  }

  async fetchDao(dao: PublicKey) {
    return this.program.account.dao.fetch(dao);
  }

  async fetchProposal(proposal: PublicKey) {
    return this.program.account.proposal.fetch(proposal);
  }

  async listProposals(dao: PublicKey) {
    return this.program.account.proposal.all([
      { memcmp: { offset: 8, bytes: dao.toBase58() } },
    ]);
  }
}
