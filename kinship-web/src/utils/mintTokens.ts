// import { Connection, Keypair, PublicKey } from "@solana/web3.js";
// import * as token from "@solana/spl-token";
// import base58 from "bs58";
// import { getKeypairFromEnvironment } from "@solana-developers/node-helpers";

export async function mintTokens(destination: string, points: number) {
  try {
    // const tokenMint = process.env.TOKEN_MINT_ADDRESS!;

    // const connection = new Connection(
    //   process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "",
    //   "confirmed",
    // );
    // const keyPair = Keypair.fromSecretKey(
    //   new Uint8Array(base58.decode(process.env.SECRET_KEY || "")),
    // );
    // const tokenDetails = await connection.getTokenSupply(
    //   new PublicKey(tokenMint),
    // );
    // const mintAuthority = getKeypairFromEnvironment(
    //   "MINT_AUTHORITY_SECRET_KEY",
    // );

    // const tokenAccount = await token.getOrCreateAssociatedTokenAccount(
    //   connection,
    //   keyPair,
    //   new PublicKey(tokenMint),
    //   new PublicKey(destination),
    // );
    //
    // await token.mintTo(
    //   connection,
    //   keyPair,
    //   new PublicKey(tokenMint),
    //   tokenAccount.address,
    //   mintAuthority,
    //   points * 10 ** tokenDetails.value.decimals,
    // );

    return true;
  } catch (error) {
    return false;
  }
}
