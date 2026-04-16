import { Connection, PublicKey, Transaction, VersionedTransaction, SendOptions, TransactionSignature, Commitment } from "@solana/web3.js";
import axios from "axios";
import bs58 from "bs58";
import React from "react";

export interface ConnectionContextState {
    connection: Connection;
    sendAndConfirm: (
        transaction: Transaction | VersionedTransaction,
        wallet: string,
        options?: SendOptions & { commitment?: Commitment },

    ) => Promise<TransactionSignature>;
}

const useConnection = () => {
  const [connection] = React.useState<Connection>(
    new Connection(
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
        {
          confirmTransactionInitialTimeout: 120000,
        },
     )
  );

  const sendAndConfirm = React.useCallback(
    async (
      transaction: Transaction | VersionedTransaction,
      wallet: string,
      options?: SendOptions & { commitment?: Commitment }
    ): Promise<TransactionSignature> => {
      try {
      const serializationTransaction = 
        transaction.serialize({
          requireAllSignatures: false, // Allow partial signatures
          verifySignatures: false      // Don't verify yet
       })
      .toString("hex");

      console.log("testing searilz")

        // Send to your backend
        const response = await axios.post(
          `/api/octane/send-transaction`,
          {
            serialized: serializationTransaction,
            userWallet: wallet
          },
          {
            headers: {
              authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        const signature = response.data.signature;

        return signature;
      } catch (error) {
        console.error("Error sending transaction through backend:", error);
        throw error;
      }
    },
    [connection]
  );

  return {
    connection,
    sendAndConfirm
  };
};

export default useConnection;

