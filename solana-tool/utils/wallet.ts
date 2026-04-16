import * as anchor from "@coral-xyz/anchor";

import { PublicKey, Transaction } from "@solana/web3.js";
import { client } from "../services/httpClient";

export const getWalletPublicKey = async (token: string): Promise<PublicKey | null> => {
    try {
        const clientInstance = client(token);
        const result = await clientInstance.get("/address");
        return new PublicKey(result.data.data);
    } catch (err) {
        console.error("Error fetching wallet public key:", err);
        return null;
    }
}

export const signTransaction = async (token: string, transaction: Transaction): Promise<Transaction> => {
    try {
        const clientInstance = client(token);
        const message: any = transaction.compileMessage();
        const messageBytes = message.serialize();
        const hex = Buffer.from(messageBytes).toString("hex");
        const result = await clientInstance.post("/sign", { message: hex });
        transaction.addSignature(
            new anchor.web3.PublicKey(result.data.data.address),
            Buffer.from(result.data.data.signature, "hex"),
        );
        return transaction;
    } catch (err) {
        console.error("Error signing transaction:", err);
        throw err;
    }
}