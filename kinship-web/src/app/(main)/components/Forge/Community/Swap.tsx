import React from "react";
import { useAtom } from "jotai";
import Image from "next/image";

import WalletIcon from "@/assets/icons/WalletIcon";
import CompareArrows from "@/assets/icons/CompareArrows";
import { Coin } from "@/app/(main)/models/coin";
import Button from "../../common/Button";
import { getSwapTokenInfo } from "@/app/(main)/lib/forge/getSwapTokenInfo";
import { swapTokens } from "@/app/(main)/lib/forge/swapTokens";
import { targetTokenBalance } from "@/app/(main)/store/community";
import { BondingPricing } from "@/anchor/curve/curves";
import { web3Consts } from "@/anchor/web3Consts";
import { SwapCoin } from "@/app/(main)/models/swapCoin";
import useWallet from "@/utils/wallet";
import useConnection from "@/utils/connection";

type Props = {
  coin: Coin;
};

const Swap = ({ coin }: Props) => {
  const wallet = useWallet();
  const connection = useConnection()

  const [_, setTargetTokenBalance] = useAtom(targetTokenBalance);

  const [swapLoading, setSwapLoading] = React.useState(false);
  const [result, setResult] = React.useState({ res: "", message: "" });

  const [baseToken, setBaseToken] = React.useState<SwapCoin>();
  const [targetToken, setTargetToken] = React.useState<SwapCoin>();

  const [curve, setCurve] = React.useState<BondingPricing>();

  const onTokenSelect = React.useCallback(async (token: Coin) => {
    setSwapLoading(true);
    const res = await getSwapTokenInfo(token, wallet!);

    setTargetTokenBalance(res.targetToken.balance);
    setBaseToken(res.baseToken);
    setTargetToken(res.targetToken);
    setSwapLoading(false);
    setCurve(res.pricing);
  }, []);

  const executeSwap = React.useCallback(async () => {
    setSwapLoading(true);
    const response = await swapTokens(targetToken!, baseToken!, wallet!,connection);

    setResult({ res: response.type, message: response.message });
    if (response.data?.token) {
      onTokenSelect(response.data.token);
    }
    setSwapLoading(false);
    setTimeout(() => {
      setResult({ res: "", message: "" });
    }, 4000);
  }, [baseToken, targetToken, wallet]);

  const switchCoins = React.useCallback(() => {
    if (targetToken!.value > targetToken!.balance) {
      const isMMOSHBase =
        targetToken?.token === web3Consts.oposToken.toBase58();

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
    (value: number) => {
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

      const isMMOSHBase = baseToken?.token === web3Consts.oposToken.toBase58();

      setBaseToken({ ...baseToken!, value });

      const buyValue = isMMOSHBase
        ? curve!.buyWithBaseAmount(value - value * 0.06)
        : curve!.sellTargetAmount(value - value * 0.06);

      setTargetToken({ ...targetToken!, value: buyValue });
    },
    [baseToken, targetToken],
  );

  React.useEffect(() => {
    onTokenSelect(coin);
  }, [coin]);

  if (!baseToken || !targetToken) return;

  return (
    <div className="community-page-container-card md:p-4 p-6 lg:p-6 rounded-xl">
      <div className="flex flex-col">
        <div className="self-start">
          <h6>Coin</h6>
        </div>

        <div className="flex flex-col items-center justify-center">
          <div className="self-center relative w-[3vmax] h-[3vmax]">
            <Image src={coin.image} alt={coin.symbol} layout="fill" />
          </div>
          <p className="text-white font-normal text-sm">{coin.name}</p>
        </div>
      </div>
      <div className="swap-container-inner p-3 mt-8">
        <div className="flex w-full flex-col justify-between">
          <div className="w-full flex justify-between">
            <p className="font-bold text-white text-sm mr-2">You're Paying</p>
            <div className="flex items-center">
              <WalletIcon />
              <p className="font-normal text-sm text-white mx-1">
                {baseToken.balance}
              </p>
              <p className="font-normal text-sm text-white">
                {baseToken.symbol}
              </p>
            </div>
          </div>

          <div className="w-full flex justify-between px-1 py-2 bg-black bg-opacity-[0.13] rounded-md border-white border-opacity-[0.05] border-[1px]">
            <div className="w-[25%] flex items-center">
              <div className="w-[1.5vmax] h-[1.5vmax] relative">
                <Image
                  src={baseToken.image}
                  alt={baseToken.symbol}
                  layout="fill"
                />
              </div>
              <p className="text-white text-sm ml-1">
                {baseToken.symbol.toUpperCase()}
              </p>
            </div>

            <div className="w-[25%] flex justify-end">
              <input
                value={baseToken.value}
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

          <div className="w-full flex justify-between px-1 py-2 bg-black bg-opacity-[0.13] rounded-md border-white border-opacity-[0.05] border-[1px]">
            <div className="w-[25%] flex items-center">
              <div className="w-[1.5vmax] h-[1.5vmax] relative">
                <Image
                  src={targetToken.image}
                  alt={targetToken.symbol}
                  layout="fill"
                />
              </div>
              <p className="text-white text-sm ml-1">
                {targetToken.symbol.toUpperCase()}
              </p>
            </div>

            <div className="w-[25%] flex justify-end">
              <input
                readOnly={true}
                value={targetToken.value}
                onChange={() => {}}
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
          <Button
            disabled={baseToken.value === 0 || swapLoading}
            isLoading={swapLoading}
            title="Swap"
            size="large"
            action={executeSwap}
            isPrimary
          />
          <div className="w-full flex justify-between items-center">
            <p className="text-tiny mr-4 max-w-[40%]">
              The price will automatically update after a period of time.
            </p>

            <a
              className="text-tiny font-normal"
              href={`https://mmosh.app/create/coins/${coin.symbol}`}
            >
              https://mmosh.app/create/coins/{coin.symbol}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Swap;
