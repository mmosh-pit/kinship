import React from "react";

import { onboardingStep } from "@/app/(main)/store/account";
import ArrowBack from "@/assets/icons/ArrowBack";
import WalletIcon from "@/assets/icons/WalletIcon";
import { useAtom } from "jotai";
import CoinSelect from "../Swap/CoinSelect";
import Button from "../common/Button";
import { SwapCoin } from "@/app/(main)/models/swapCoin";
import baseCoins from "@/app/(main)/lib/baseCoins";
import CompareArrows from "@/assets/icons/CompareArrows";

import { swapTokens } from "@/app/(main)/lib/forge/swapTokens";
import { web3Consts } from "@/anchor/web3Consts";
import {
  getSwapPrices,
  getSwapPricesForJup,
} from "@/app/(main)/lib/forge/getSwapPrices";
import { getquote, getSwapTransaction } from "@/app/(main)/lib/forge/jupiter";

import { Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import useWallet from "@/utils/wallet";
import { BondingPricing } from "@/anchor/curve/curves";
import client from "@/app/(main)/lib/httpClient";
import useConnection from "@/utils/connection";

const defaultBaseToken = {
  name: "",
  symbol: "Select",
  token: "",
  image: "",
  balance: 0,
  value: 0,
  desc: "",
  decimals: 9,
};

const Step3 = () => {
  const wallet = useWallet();
  const connect = useConnection()
  const [_, setSelectedStep] = useAtom(onboardingStep);

  const [curve, setCurve] = React.useState<BondingPricing>();
  const [swapLoading, setSwapLoading] = React.useState(false);
  const [result, setResult] = React.useState({ res: "", message: "" });
  const [baseToken, setBaseToken] = React.useState<SwapCoin>(defaultBaseToken);
  const [targetToken, setTargetToken] = React.useState<SwapCoin>({
    ...baseCoins[0],
    balance: 0,
    value: 0,
  });
  const [hasSwapped, setHasSwapped] = React.useState(false);

  const onTokenSelect = async (token: SwapCoin, isBase: boolean) => {
    let base;
    let target;
    if (isBase) {
      base = token;
      target = targetToken;
      setBaseToken(base);
    } else {
      base = baseToken;
      target = token;
      setTargetToken(target);
    }

    console.log("onTokenSelect 0", isBase);

    console.log("onTokenSelect 0", base);

    console.log("onTokenSelect 0", target);

    if (base.token == "" || target.token == "") {
      console.log("onTokenSelect 1");
      return;
    }

    if (base.token === target.token) {
      console.log("onTokenSelect 2");
      setResult({ res: "error", message: "cannot swap same coin" });
      return;
    }

    console.log("onTokenSelect 3");
    if (base.is_memecoin && target.is_memecoin) {
      console.log("onTokenSelect 4");
      setResult({ res: "error", message: "one coin only be memecoin" });
    }

    console.log("onTokenSelect 5");
    if (!base.is_memecoin && !target.is_memecoin) {
      console.log("onTokenSelect 6");
      const result: any = await getSwapPricesForJup(base, target, wallet!);
      console.log("jup result ", result);
      setBaseToken(result.baseToken);
      setTargetToken(result.targetToken);
    } else {
      console.log("onTokenSelect 7");
      let memecoin = base.is_memecoin ? base : target;
      await loadMemecoin(memecoin, isBase);
    }
  };

  const loadMemecoin = async (token: SwapCoin, isBase: boolean) => {
    setSwapLoading(true);
    const result: any = await getSwapPrices(token, wallet!, isBase);
    if (result) {
      setBaseToken(result.baseToken);
      setTargetToken(result.targetToken);
      setCurve(result.curve);
    }
    setSwapLoading(false);
  };

  const executeSwap = React.useCallback(async () => {
    if (!wallet) {
      setResult({ res: "error", message: "wallet is not connected" });
      return;
    }
    try {
      setSwapLoading(true);

      if (!baseToken.is_memecoin && !targetToken.is_memecoin) {
        const result = await getquote({
          inputMint: baseToken.token,
          outputMint: targetToken.token,
          lamportValue:
            baseToken.value *
            (baseToken.decimals == 9 ? web3Consts.LAMPORTS_PER_OPOS : 1000_000),
        });
        if (result.status) {
          const swapResult = await getSwapTransaction({
            quote: result.data,
            wallet: wallet?.publicKey.toBase58(),
          });
          let txHex: any = swapResult.data;

        
          const env = new anchor.AnchorProvider(connect.connection, wallet, {
            preflightCommitment: "processed",
          });

          anchor.setProvider(env);

          const userConn: UserConn = new UserConn(env, web3Consts.programID);
          const data: any = Buffer.from(txHex, "base64");
          const tx = anchor.web3.VersionedTransaction.deserialize(data);
          const signature = await userConn.provider.sendAndConfirm(tx);

          console.log("signature", signature);
          setResult({
            res: "success",
            message: "Congrats! Your token have been swapped successfully",
          });
          setBaseToken(defaultBaseToken);
          setTargetToken({
            ...baseCoins[0],
            balance: 0,
            value: 0,
          });
          setSwapLoading(false);
        } else {
          setResult({ res: "error", message: "error on jupiter swap" });
          setSwapLoading(false);
        }
      } else {
        const response = await swapTokens(targetToken, baseToken, wallet!,connect);
        console.log("response ", response);
        setResult({ res: response.type, message: response.message });
        setSwapLoading(false);
      }

      setHasSwapped(true);
      setTimeout(() => {
        setResult({ res: "", message: "" });
      }, 4000);
    } catch (error) {
      setSwapLoading(false);
      console.log("swap error ", error);
    }
  }, [baseToken, targetToken, wallet]);

  const switchCoins = React.useCallback(() => {
    if (!baseToken.token) return;

    if (targetToken!.value > targetToken!.balance) {
      const isMMOSHBase = !targetToken.is_memecoin;

      const value = targetToken!.balance;

      const buyValue = isMMOSHBase
        ? curve!.buyWithBaseAmount(value - value * 0.06)
        : curve!.sellTargetAmount(value - value * 0.06);

      setBaseToken({ ...targetToken!, value });
      setTargetToken({ ...baseToken!, value: buyValue });
      return;
    }

    setTargetToken(baseToken);
    setBaseToken(targetToken);
  }, [baseToken, targetToken]);

  const onChangeValue = React.useCallback(
    async (value: number) => {
      if (value === 0) {
        setBaseToken({ ...baseToken!, value });
        setTargetToken({ ...targetToken!, value });
        return;
      }

      if (value < 0) {
        setBaseToken({ ...baseToken!, value: 0 });
        setTargetToken({ ...targetToken!, value });
        return;
      }

      if (value > baseToken!.balance) return;

      if (baseToken.token == "" || targetToken.token == "") return;

      if (!baseToken.is_memecoin && !targetToken.is_memecoin) {
        console.log("baseToken.decimals", baseToken.decimals);
        setBaseToken({ ...baseToken!, value });
        const result = await getquote({
          inputMint: baseToken.token,
          outputMint: targetToken.token,
          lamportValue:
            value *
            (baseToken.decimals == 9 ? web3Consts.LAMPORTS_PER_OPOS : 1000_000),
        });
        if (result.status) {
          console.log(targetToken.decimals);

          setTargetToken({
            ...targetToken!,
            value:
              result.data.outAmount /
              (targetToken.decimals == 9
                ? web3Consts.LAMPORTS_PER_OPOS
                : 1000_000),
          });
        }
      } else {
        const isMMOSHBase = !baseToken.is_memecoin;

        setBaseToken({ ...baseToken!, value });
        const buyValue = isMMOSHBase
          ? curve!.buyWithBaseAmount(value - value * 0.06)
          : curve!.sellTargetAmount(value - value * 0.06);
        setTargetToken({ ...targetToken!, value: buyValue });
      }
    },
    [baseToken, targetToken],
  );

  const goToNextStep = React.useCallback(() => {
    setSelectedStep(3);
    client.put("/onboarding-step", {
      step: 3,
    });
  }, []);

  return (
    <div className="bg-[#18174750] border-[1px] border-[#FFFFFF80] rounded-lg py-8 md:px-8 px-6 flex flex-col md:w-[55%] w-[95%] mt-4">
      <div className="w-full flex justify-between">
        <button onClick={() => setSelectedStep(1)}>
          <ArrowBack />
        </button>

        <p className="text-sm">Step 3 of 4</p>
      </div>

      <div className="flex flex-col self-center mb-12 justify-center items-center">
        <p className="text-white font-goudy text-base text-center">Swap</p>

        <div className="my-2" />

        <p className="text-sm text-center md:max-w-[50%] max-w-[85%]">
          Swap some of your SOL for USDC, a stablecoin pegged to the US Dollar,
          or purchase Bot Coins you can use for a range of goods and services.
          Make sure you keep at least a few dollars of SOL for network fees!
        </p>
      </div>

      <div className="mt-8 max-h-[550px] w-[95%] md:w-[70%] lg:w-[55%] self-center md:p-4 lg:p-6 rounded-xl">
        <div className="swap-container-inner p-8">
          <div className="flex w-full flex-col justify-between">
            <div className="w-full flex justify-between">
              <p className="font-bold text-white text-sm mr-2">You're Paying</p>
              <div className="flex items-center">
                <WalletIcon />
                <p className="font-normal text-sm text-white mx-1">
                  {baseToken.balance}
                </p>
                {baseToken.symbol !== "Select" && (
                  <p className="font-normal text-sm text-white">
                    {baseToken.symbol}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full flex justify-between px-1 py-2 bg-[#00000021] rounded-md border-white border-opacity-[0.05] border-[1px]">
              <CoinSelect
                key={"base"}
                selectedCoin={baseToken}
                onTokenSelect={onTokenSelect}
                otherToken={targetToken}
                isBase={true}
                readonly={false}
              />

              <div className="w-[25%] flex justify-end">
                <input
                  value={baseToken.value}
                  readOnly={!baseToken.token}
                  type="number"
                  onChange={(e) => {
                    const number = Number(e.target.value);

                    if (Number.isNaN(number)) return;

                    onChangeValue(number);
                  }}
                  placeholder="0.00"
                  className="input max-w-[100%] text-center text-xs bg-transparent placeholder-white placeholder-opacity-[0.3]"
                />
              </div>
            </div>
          </div>

          <button
            onClick={switchCoins}
            className="swap-arrows-button rounded-full mt-8 mb-4"
          >
            <CompareArrows />
          </button>

          <div className="flex w-full flex-col justify-between">
            <div className="w-full flex justify-between">
              <p className="font-bold text-white text-sm mr-2">To receive</p>
              <div className="flex items-center">
                <WalletIcon />
                <p className="font-normal text-sm text-white ml-1">
                  {targetToken.balance}
                </p>
                <p className="font-normal text-sm text-white ml-1">
                  {targetToken.symbol}
                </p>
              </div>
            </div>

            <div className="w-full flex justify-between px-1 py-2 bg-[#DEDDFC12] rounded-md border-white border-opacity-[0.05] border-[1px]">
              <CoinSelect
                key={"target"}
                selectedCoin={targetToken}
                onTokenSelect={onTokenSelect}
                isBase={false}
                otherToken={baseToken}
                readonly={false}
              />

              <div className="w-[25%] flex justify-end">
                <input
                  readOnly={true}
                  value={targetToken.value}
                  onChange={() => { }}
                  className="input max-w-[100%] text-center text-xs bg-transparent placeholder-white placeholder-opacity-[0.3]"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col mt-4">
            {result.res === "error" && (
              <p className="text-red-600 text-center mb-2 text-sm">
                There was an error while swapping your tokens. Please, try again
              </p>
            )}
            {result.res === "success" && (
              <p className="text-green-500 text-center mb-2 text-sm">
                Congrats! Your tokens have been swapped successfully
              </p>
            )}

            <div className="flex">
              <Button
                disabled={baseToken.value === 0 || swapLoading}
                isLoading={swapLoading}
                title="Swap"
                size="large"
                action={executeSwap}
                isPrimary
              />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 w-[80%] md:w-[70%] lg:w-[55%] self-center">
        <Button
          isLoading={false}
          title={hasSwapped ? "Next" : "Skip"}
          size="large"
          action={goToNextStep}
          isPrimary={false}
        />
      </div>
    </div>
  );
};

export default Step3;
