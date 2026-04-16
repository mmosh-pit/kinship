import React from "react";
import Image from "next/image";

import { BagsNFT, bagsNfts } from "@/app/(main)/store/bags";
import { burnToken } from "@/utils/burnToken";
import useWallet from "@/utils/wallet";
import { useAtom } from "jotai";

type Props = {
  asset: BagsNFT;
  onSelect: (coin: BagsNFT) => void;
};

const NFTItem = ({ asset, onSelect }: Props) => {
  const [_, setBags] = useAtom(bagsNfts);

  const wallet = useWallet();

  const [isBurning, setIsBurning] = React.useState(false);

  if (!asset.symbol) {
    return <></>;
  }

  const burnAsset = async () => {
    setIsBurning(true);
    const res = await burnToken({
      mintAddress: asset.tokenAddress,
      amount: 1,
      decimals: 0,
      wallet,
    });

    if (res) {
      setBags((prev) => {
        const newValue = prev ? { ...prev } : null;

        if (!newValue) return null;

        if (
          newValue.badges?.find((e) => e.tokenAddress === asset.tokenAddress)
        ) {
          const idx = newValue.badges.findIndex(
            (e) => e.tokenAddress === asset.tokenAddress,
          );

          newValue.badges.splice(idx, 1);
        } else if (
          newValue.passes?.find((e) => e.tokenAddress === asset.tokenAddress)
        ) {
          const idx = newValue.passes.findIndex(
            (e) => e.tokenAddress === asset.tokenAddress,
          );

          newValue.passes.splice(idx, 1);
        } else if (
          newValue.profiles?.find((e) => e.tokenAddress === asset.tokenAddress)
        ) {
          const idx = newValue.profiles.findIndex(
            (e) => e.tokenAddress === asset.tokenAddress,
          );

          newValue.profiles.splice(idx, 1);
        } else if (
          newValue.exosystem?.find((e) => e.tokenAddress === asset.tokenAddress)
        ) {
          const idx = newValue.exosystem.findIndex(
            (e) => e.tokenAddress === asset.tokenAddress,
          );

          newValue.exosystem.splice(idx, 1);
        }

        return newValue;
      });
    }

    setIsBurning(false);
  };

  return (
    <div className="flex justify-between bg-[#2E3C4E80] rounded-md my-2 py-4 px-2">
      <div className="flex">
        <div className="w-[5vmax] h-[5vmax] relative">
          <Image
            src={asset.image}
            alt="coin"
            layout="fill"
            className="rounded-md"
          />
        </div>

        <div className="flex flex-col justify-between ml-4">
          <div className="flex flex-col justify-center">
            <div className="flex">
              <p className="underline text-white text-sm font-bold">
                {asset.name}
              </p>
              <span className="text-sm text-white mx-2">•</span>
              <p className="text-white text-sm">{asset.symbol.toUpperCase()}</p>
            </div>

            <p className="text-sm">{asset.metadata.description}</p>
          </div>

          <div className="flex">
            <a
              className="underline text-white text-xs cursor-pointer"
              href={`https://solscan.io/account/${asset.tokenAddress}?cluster=mainnet`}
              target="_blank"
            >
              View on Solscan
            </a>

            <div className="flex ml-4">
              <button
                className="rounded-full px-3 py-2 border-white border-opacity-[0.05] border-[1px] bg-[#DEDDFC12] cursor-pointer"
                onClick={() => onSelect(asset)}
              >
                Send
              </button>

              <button
                className="flex justify-center items-center rounded-full px-3 py-2 border-white border-opacity-[0.05] border-[1px] bg-[#DEDDFC12] ml-4 cursor-pointer"
                onClick={burnAsset}
              >
                {isBurning ? (
                  <span className="loading loading-spinner w-[1vmax] h-[1vmax] loading-lg bg-[#BEEF00]"></span>
                ) : (
                  "Burn"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NFTItem;
