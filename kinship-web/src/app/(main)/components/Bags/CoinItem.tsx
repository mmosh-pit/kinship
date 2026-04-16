import React from "react";
import Image from "next/image";

import { BagsCoin } from "@/app/(main)/store/bags";
import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";

type Props = {
  coin: BagsCoin;
  onSelect: (coin: BagsCoin) => void;
};

const CoinItem = ({ coin, onSelect }: Props) => {
  const getCoinBalance = React.useCallback(() => {
    const decimals = "1".padEnd(coin.decimals + 1, "0");

    return abbreviateNumber(coin.balance / Number(decimals));
  }, [coin]);

  return (
    <div
      className="flex justify-between bg-[#FFFFFF14] rounded-md my-2 border-[1px] border-[#FFFFFF47] cursor-pointer py-4 px-4"
      onClick={() => onSelect(coin)}
    >
      <div className="flex">
        <div className="w-[50px] h-[50px] relative">
          <Image
            src={coin.image}
            alt="coin"
            layout="fill"
            className="rounded-full"
          />
        </div>

        <div className="flex flex-col justify-center ml-4">
          <p className="underline text-white text-sm uppercase">{coin.name}</p>
          <p className="text-sm">{getCoinBalance()} {coin.symbol.toUpperCase()}</p>
        </div>
      </div>

      {coin.usdcPrice > 0 &&
        <div className="flex flex-col justify-center self-center">
          <p className="font-bold text-white text-sm">
            ${abbreviateNumber(coin.usdcPrice)}
          </p>
        </div>
      }
    </div>
  );
};

export default CoinItem;
