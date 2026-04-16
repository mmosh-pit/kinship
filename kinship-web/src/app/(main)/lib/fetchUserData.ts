import { Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import axios from "axios";
import { FrostWallet } from "@/utils/frostWallet";

export async function fetchUserData(wallet: FrostWallet) {
    const walletAddress = wallet?.publicKey;
    const result = await axios.get(
      `/api/get-wallet-data?wallet=${walletAddress}`,
    );
    return result;
  
}
