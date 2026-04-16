import * as anchor from "@coral-xyz/anchor";

import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { web3Consts } from "@/anchor/web3Consts";
import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import { Connection } from "@solana/web3.js";
import axios from "axios";
import { FrostWallet } from "@/utils/frostWallet";

export const getSwapTokenInfo = async (
  token: Coin,
  wallet: FrostWallet,
  switcher = false,
) => {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
    confirmTransactionInitialTimeout: 120000
  });

  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });

  anchor.setProvider(env);
  const curveConn: CurveConn = new CurveConn(env, web3Consts.programID);

  const balances = await curveConn.getTokenBalance(
    token.token,
    9,
    web3Consts.oposToken.toBase58(),
    9,
  );

  const target = {
    name: token.name,
    symbol: token.symbol,
    token: token.token,
    image: token.image,
    desc: token.desc,
    balance: balances.base,
    value: 0,
    decimals:token.decimals
  };

  const result = await axios.get<CoinDetail>(
    `/api/get-token-by-symbol?symbol=${token.symbol}`,
  );
  
  const base = {
    name: result.data.base.name,
    symbol: result.data.base.symbol,
    token: result.data.base.token,
    image:
    result.data.base.image,
    desc: result.data.base.desc,
    balance: balances.target,
    value: 0,
    decimals: result.data.base.decimals
  };


  let targetToken = null;
  let baseToken = null;

  if (switcher) {
    targetToken = base;
    baseToken = target;
  } else {
    targetToken = target;
    baseToken = base;
  }

  const pricing = await curveConn.getPricing(
    new anchor.web3.PublicKey(result.data.bonding),
  );

  return { pricing, solBalance: balances.sol, targetToken, baseToken };
};
