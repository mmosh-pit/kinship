/**
 * Example: create a DAO from a standalone Node script.
 *
 * Usage (after `anchor build && anchor deploy`):
 *   ts-node scripts/init-dao.ts
 *
 * Requires ANCHOR_PROVIDER_URL and ANCHOR_WALLET env vars, e.g.:
 *   export ANCHOR_PROVIDER_URL=http://localhost:8899
 *   export ANCHOR_WALLET=~/.config/solana/id.json
 */

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Metadao } from "../target/types/metadao";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Metadao as anchor.Program<Metadao>;
  const tokenMint = Keypair.generate();

  const [daoPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("dao"), tokenMint.publicKey.toBuffer()],
    program.programId
  );

  const sig = await program.methods
    .initializeDao({
      passThresholdBps: 200,
      marketDurationSlots: new BN(432_000), // ~2 days at 400ms slots
      minProposerStake: new BN(10_000_000),
    })
    .accounts({
      dao: daoPda,
      tokenMint: tokenMint.publicKey,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("DAO initialized");
  console.log("  address:", daoPda.toBase58());
  console.log("  token mint:", tokenMint.publicKey.toBase58());
  console.log("  tx:", sig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
