import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";

import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { SwapCoin } from "@/app/(main)/models/swapCoin";
import { web3Consts } from "@/anchor/web3Consts";
import axios from "axios";
import { CoinDetail } from "@/app/(main)/models/coin";
import { FrostWallet } from "@/utils/frostWallet";

export const getSwapPrices = async (
  token: SwapCoin,
  wallet: FrostWallet,
  isBase: boolean,
) => {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
    confirmTransactionInitialTimeout: 120000
  });

  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });

  const result = await axios.get<CoinDetail>(
    `/api/get-token-by-symbol?symbol=${token.symbol}`,
  );

  anchor.setProvider(env);
  const curveConn = new CurveConn(env, web3Consts.programID);
  const bondingResult = await curveConn.getTokenBonding(
    new anchor.web3.PublicKey(result.data.bonding),
  );

  if(!bondingResult) {
    return null
  }

  const balances = await curveConn.getTokenBalance(
    token.token,
    token.decimals,
    bondingResult?.baseMint.toBase58(),
    result.data.base.decimals
  );

  console.log("getSwapPrices ", balances);

  let baseBalance = balances.target
  // if(bondingResult?.baseMint.toBase58() === web3Consts.oposToken.toBase58()) {
  //   baseBalance = balances.target
  // } else {
  //   let coinData = await axios("/api/ptv/rewards?coin="+bondingResult?.baseMint.toBase58()+"&&wallet="+wallet?.publicKey.toBase58())
  //   baseBalance = coinData.data ? (coinData.data.claimable + coinData.data.unstakable) : 0
  //   if(baseBalance == 0) {
  //     baseBalance = balances.target
  //   }
  // }

  const base = {
    ...result.data.base,
    is_memecoin: false,
    balance: result.data.base.symbol.toLowerCase() == "sol" ? balances.sol : baseBalance,
    value: 0,
  };


  console.log("bondingResult ", bondingResult)
  console.log("basemint ", bondingResult?.baseMint.toBase58())

  const target = {
    ...result.data.target,
    is_memecoin: true,
    balance: result.data.target.symbol.toLowerCase() == "sol" ? balances.sol :  balances.base,
    value: 0,
  };


  const curve = await curveConn.getPricing(
    new anchor.web3.PublicKey(result.data.bonding),
  );

  console.log("getSwapPrices base", base);
  console.log("getSwapPrices base", target);

  return {
    curve,
    targetToken: isBase ? base : target,
    baseToken: isBase ? target : base,
  };
};


export const getSwapPricesForJup = async (
  baseToken: SwapCoin,
  targetToken: SwapCoin,
  wallet: FrostWallet,
) => {
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
    confirmTransactionInitialTimeout: 120000
  });

  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });

  anchor.setProvider(env);
  const curveConn = new CurveConn(env, web3Consts.programID);



  const balances = await curveConn.getTokenBalance(
    baseToken.token,
    baseToken.decimals ? baseToken.decimals : 9,
    targetToken.token,
    targetToken.decimals ? targetToken.decimals : 9,
  );
  let baseBalance = 0
  // let basetype = ""
  // if(baseToken.token == process.env.NEXT_PUBLIC_PTVB_TOKEN) {
  //   basetype = "Blue"
  // }
  // if(baseToken.token == process.env.NEXT_PUBLIC_PTVR_TOKEN) {
  //   basetype = "Red"
  // }
  // if(basetype !== "") {
  //   let coinData = await axios("/api/ptv/rewards?type="+basetype+"&&wallet="+wallet?.publicKey.toBase58())
  //   baseBalance = coinData.data ? (coinData.data.claimable + coinData.data.unstakable) : 0
  // }

  let targetBalance = 0
  // let targettype = ""
  // if(targetToken.token == process.env.NEXT_PUBLIC_PTVB_TOKEN) {
  //   targettype = "Blue"
  // }
  // if(targetToken.token == process.env.NEXT_PUBLIC_PTVR_TOKEN) {
  //   targettype = "Red"
  // }
  // if(targettype !== "") {
  //   let coinData = await axios("/api/ptv/rewards?type="+targettype+"&&wallet="+wallet?.publicKey.toBase58())
  //   targetBalance = coinData.data ? (coinData.data.claimable + coinData.data.unstakable) : 0
  // }

  console.log("base token ", baseToken.token)
  console.log("target token ", targetToken.token)
  console.log("all balances ", balances)

  const base = {
    name: baseToken.name,
    symbol: baseToken.symbol,
    token: baseToken.token,
    image: baseToken.image,
    balance: baseToken.symbol.toLowerCase() === "sol" ? balances.sol :  balances.base + baseBalance,
    desc: "",
    value: 0,
    decimals: baseToken.decimals
  };

  const target = {
    name: targetToken.name,
    symbol: targetToken.symbol,
    token: targetToken.token,
    image: targetToken.image,
    balance: targetToken.symbol.toLowerCase() === "sol" ? balances.sol : balances.target + targetBalance,
    desc: "",
    value: 0,
    decimals: targetToken.decimals
  };

  return {
    targetToken: target ,
    baseToken: base
  };
};
