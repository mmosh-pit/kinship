"use client";
import React, { use } from "react";
import axios from "axios";

import ArrowBack from "@/assets/icons/ArrowBack";
import { useRouter } from "next/navigation";
import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { web3Consts } from "@/anchor/web3Consts";
import useWallet from "@/utils/wallet";
import Graphics from "@/app/(main)/components/Forge/CoinPage/Graphics";
import Stats from "@/app/(main)/components/Forge/CoinPage/Stats";
import TransactionsTable from "@/app/(main)/components/Forge/CoinPage/TransactionsTable";

const Page = (props: { params: Promise<{ symbol: string }> }) => {
  const params = use(props.params);
  const navigate = useRouter();
  const wallet = useWallet();
  const rendered = React.useRef(false);

  const [baseCoin, setBaseCoin] = React.useState<Coin | null>(null);
  const [coin, setCoin] = React.useState<CoinDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const goBack = React.useCallback(() => {
    navigate.back();
  }, []);

  const getBaseToken = async (bondingKey: string) => {
    if (!wallet) {
      return;
    }
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
      confirmTransactionInitialTimeout: 120000,
    });

    const env = new anchor.AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });

    anchor.setProvider(env);
    const curveConn = new CurveConn(env, web3Consts.programID);
    const bondingResult = await curveConn.getTokenBonding(
      new anchor.web3.PublicKey(bondingKey),
    );

    if (!bondingResult) {
      return null;
    }

    const mintDetail = await curveConn.metaplex
      .nfts()
      .findByMint({ mintAddress: bondingResult?.baseMint });

    setBaseCoin(coin?.base!);
  };

  const fetchCoinData = React.useCallback(async () => {
    try {
      setIsLoading(true);
      console.log("Queryiiing");
      const result = await axios.get<CoinDetail>(
        `/api/get-token-by-symbol?symbol=${params.symbol}`,
      );
      setIsLoading(false);
      setCoin(result.data);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  }, [params]);

  React.useEffect(() => {
    if (!rendered.current) {
      fetchCoinData();
      rendered.current = true;
    }
  }, [params]);

  React.useEffect(() => {
    if (wallet && coin) {
      getBaseToken(coin?.bonding);
    }
  }, [wallet, coin]);

  if (isLoading) {
    return (
      <div className="background-content flex w-full justify-center items-center">
        <span className="loading loading-spinner w-[8vmax] h-[8vmax] loading-lg bg-[#BEEF00]"></span>
      </div>
    );
  }

  if (!coin && !baseCoin) {
    return (
      <div className="background-content flex flex-col max-h-full pt-20 px-12" />
    );
  }

  return (
    <>
      {coin && baseCoin && (
        <div className="background-content relative flex flex-col max-h-full pt-20 px-12">
          <div className="w-full flex justify-between">
            <div className="flex items-center mb-4 ml-4">
              <div
                className="flex items-center mr-4 cursor-pointer"
                onClick={goBack}
              >
                <ArrowBack />
                <p className="text-white text-sm">Back</p>
              </div>

              <div className="flex items-center">
                <div className="relative">
                  <img
                    src={coin.target.image}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                </div>

                <h6 className="mx-2">{coin.target.name}</h6>
                <p className="text-tiny">{coin.symbol}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12">
            <div className="col-span-7">
              <Graphics coin={coin} base={baseCoin} />
            </div>

            <div className="col-span-5 mt-5 md:mt-0">
              <Stats coin={coin} base={baseCoin} />
            </div>
          </div>

          <div className="w-full py-10 overflow-x-auto">
            <TransactionsTable coin={coin} base={baseCoin} />
          </div>
        </div>
      )}
    </>
  );
};

export default Page;
