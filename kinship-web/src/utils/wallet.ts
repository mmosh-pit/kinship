import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import React from "react";
import { FrostWallet } from "./frostWallet";
import * as anchor from "@coral-xyz/anchor";
import client from "@/app/(main)/lib/httpClient";

const useWallet = () => {
  const [wallet, setWallet] = React.useState<FrostWallet>();

  React.useEffect(() => {
    getMyWallet();
  }, []);

  const getMyWallet = async () => {
    try {
      const result = await client.get("/address");
      const frostWallet: FrostWallet = {
        publicKey: new PublicKey(result.data.data),
        signTransaction: async <T extends Transaction | VersionedTransaction>(
          tx: T,
        ): Promise<T> => {
          // mock or actual signing logic
          if ("version" in tx) {
            console.log("version transaction");
            const messageBytes: any = tx.message.serialize();
            const hex = Buffer.from(messageBytes).toString("hex");
            const result = await client.post("/sign", { message: hex });
            const signature: any = Buffer.from(
              result.data.data.signature,
              "hex",
            );

            const signerIndex = tx.message.staticAccountKeys.findIndex((key) =>
              key.equals(frostWallet.publicKey),
            );
          
            if (signerIndex === -1) {
              throw new Error("Signer public key not found in account keys");
            }
          
            tx.signatures[signerIndex] = signature;
          } else {
            console.log("normal transaction");

            const message: any = tx.compileMessage(); // ✅ works for legacy Transaction
            const messageBytes = message.serialize();
            const hex = Buffer.from(messageBytes).toString("hex");

            console.log("message hex", hex);

            const result = await client.post("/sign", { message: hex });

            console.log("Request data response: ", result.data);
            console.log("message address", result.data.data.address);
            console.log("message signature", result.data.data.signature);

            tx.addSignature(
              new anchor.web3.PublicKey(result.data.data.address),
              Buffer.from(result.data.data.signature, "hex"),
            );
          }

          return tx;
        },
        signAllTransactions: async <
          T extends Transaction | VersionedTransaction,
        >(
          txs: T[],
        ): Promise<T[]> => {
          // mock or actual signing logic
          console.log("signAllTransactions started");
          return txs;
        },
      };
      setWallet(frostWallet);
    } catch (err) {
      console.error(err);
    }
  };

  return wallet;
};

export default useWallet;
