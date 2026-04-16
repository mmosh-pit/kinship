import React from "react";
import { useAtom } from "jotai";
import axios from "axios";

import { coinStats } from "@/app/(main)/store/coins";
import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import { User } from "@/app/(main)/models/user";
import { useRouter } from "next/navigation";

import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import * as anchor from "@coral-xyz/anchor";
import { web3Consts } from "@/anchor/web3Consts";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Connection, Keypair } from "@solana/web3.js";

type Props = {
  coin: CoinDetail;
  base: Coin;
};

const Stats = ({ coin, base }: Props) => {
  const [stats] = useAtom(coinStats);
  const router = useRouter();
  const [usdPrice, setUsdPrice] = React.useState(0);
  const [marketCap, setMarketCap] = React.useState(0);

  const [coinOwner, setCoinOwner] = React.useState<User | null>(null);

  const fetchCoinOwner = React.useCallback(async () => {
    const result = await axios.get(
      `/api/get-user-data?username=${coin.creatorUsername}`,
    );

    setCoinOwner(result.data);
  }, [coin]);

  React.useEffect(() => {
    fetchCoinOwner();
    getTokenPrice()
  }, [coin]);

  React.useEffect(() => {
    getMarketCap(coin.bonding)
  }, [usdPrice]);

  const getTokenPrice = async () => {
    const mmoshUsdcPrice = await axios.get(
      process.env.NEXT_PUBLIC_JUPITER_PRICE_API + `?ids=${coin.base.token},${process.env.NEXT_PUBLIC_USDC_TOKEN}`,
    );
    setUsdPrice(mmoshUsdcPrice.data?.data?.MMOSH?.price || 0.003);
  };


  const getMarketCap = async (bonding: any) => {
    try {
      const wallet = new NodeWallet(new Keypair());
      const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
        confirmTransactionInitialTimeout: 120000,
      });
    
      const env = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
      });
    
      anchor.setProvider(env);
      const curveConn = new CurveConn(env, web3Consts.programID);
  
      const bondingResult = await curveConn.getTokenBonding(
        new anchor.web3.PublicKey(bonding),
      );
      if (bondingResult) {
        setMarketCap(
          bondingResult.reserveBalanceFromBonding.toNumber() / web3Consts.LAMPORTS_PER_OPOS
        );
      } 
    } catch (error) {
      console.log("error ", error);
    }
  };

  const formatedNumber = (value: number) => {
    const result = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    return Number(result)
  }

  return (
    <div className="w-full flex flex-col bg-[#04024185] backdrop-blur-[10px] rounded-xl p-12 md:ml-4">
      <h5>Stats</h5>

      <div className="flex flex-col my-4">
        <div className="w-full flex justify-between">
          <div className="flex flex-col">
            <p className="text-base">TVL</p>
            <p className="text-white">
              {formatedNumber(marketCap)} <span className="ml-1 text-xs">{base.symbol}</span>
            </p>
          </div>

          <div className="flex flex-col">
            <p className="text-base">1 Day Volume</p>
            <p className="text-white">
              {stats.dayVolume}{" "}
              <span className="ml-1 text-xs">{base.symbol}</span>
            </p>
          </div>
        </div>

        <div className="h-[1px] w-full bg-[#100E5242] rounded-full my-2" />

        <div className="flex flex-col mt-8">
          <h5>Info</h5>
          <p className="my-2 text-sm">{coin.target.desc}</p>
          {coinOwner && (
            <div
              className="bg-[#7420E8] md:max-w-[35%] max-w-[40%] lg:max-w-[25%] rounded-2xl p-4 cursor-pointer"
              onClick={() => router.push(`/${coinOwner.profile.username}`)}
            >
              <p className="text-white text-sm">{coinOwner.profile.name}</p>
            </div>
          )}

          {coin.status === "active" &&
            <div className="mt-2.5">
              <p>Progress Dex Listing {formatedNumber(((marketCap * usdPrice)/ coin.maxsupplyusd)) * 100}%</p>
              <progress className="progress progress-primary w-full" value={formatedNumber(((marketCap * usdPrice)/ coin.maxsupplyusd)) * 100} max="100"></progress>
            </div>
          }

          {coin.status == "completed" &&
              <p className="mt-2.5">Pool: <a href={process.env.NEXT_PUBLIC_POOL! + coin.pool} target="_blank">{coin.pool!.substring(0,4)}...{coin.pool!.substring(coin.pool!.length - 4, coin.pool!.length)}</a></p>
          }
        </div>
      </div>
    </div>
  );
};

export default Stats;
