import { sendWalletKeypair } from "./email.js";
import { db } from "../db/client.js";
import { wallets, failedEmailAttempts } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";

interface WalletResponse {
  address: string;
  key_package: string[];
}

interface WalletServiceResponse {
  status: boolean;
  message: string;
  data: string;
}

export async function createWallet(email: string): Promise<string> {
  // Return existing wallet if already created
  const [existing] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.email, email))
    .limit(1);

  if (existing) return existing.address!;

  const baseUrl = process.env.WALLET_BACKEND_URL;
  const res = await fetch(`${baseUrl}/create`, { method: "POST" });

  if (!res.ok) throw new Error("Wallet service error");

  const json = await res.json() as WalletServiceResponse;

  if (!json.status) throw new Error("Wallet creation failed");

  const walletData: WalletResponse = JSON.parse(json.data);
  const keypair = walletData.key_package[1];

  // Send keypair via email; if it fails, save to retry later
  try {
    await sendWalletKeypair(email, keypair);
  } catch (err) {
    console.error("[wallet] Failed to send keypair email:", err);
    await db.insert(failedEmailAttempts).values({ email, keypair });
  }

  await db.insert(wallets).values({ address: walletData.address, email });

  return walletData.address;
}

export async function getWalletByEmail(email: string) {
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.email, email))
    .limit(1);
  return wallet ?? null;
}
