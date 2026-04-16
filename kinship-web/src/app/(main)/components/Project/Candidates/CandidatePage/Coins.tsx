import axios from "axios";
import React from "react";
import Image from "next/image";

import { DirectoryCoin } from "@/app/(main)/models/directoryCoin";

type Props = {
  color: string;
  candidateCoins: DirectoryCoin[];
};

const Coins = ({ candidateCoins, color }: Props) => {
  const [usdcMmoshPrice, setUsdcMmoshPrice] = React.useState(0);

  const getUsdcMmoshPrice = React.useCallback(async () => {
    const mmoshUsdcPrice = await axios.get(
      `${process.env.NEXT_PUBLIC_JUPITER_PRICE_API}?ids=${process.env.NEXT_PUBLIC_OPOS_TOKEN},${process.env.NEXT_PUBLIC_USDC_TOKEN}`,
    );

    setUsdcMmoshPrice(mmoshUsdcPrice.data?.data?.MMOSH?.price || 0);
  }, []);

  React.useEffect(() => {
    getUsdcMmoshPrice();
  }, [candidateCoins]);

  return (
    <div className="w-full px-4 py-2 grid grid-cols-auto md:grid-cols-3 xl:grid-cols-4 gap-8 mt-4">
      {candidateCoins.map((coin) => (
        <div
          className={`flex bg-[#030007] bg-opacity-40 px-2 py-2 rounded-2xl border-[1px] border-[${color}]`}
          key={coin.symbol}
        >
          <div className="self-center max-w-[30%] mr-8">
            <div className="relative w-[3vmax] h-[3vmax]">
              <Image
                src={coin.image}
                alt="Profile Image"
                className="rounded-full"
                layout="fill"
              />
            </div>
          </div>

          <div className="flex grow flex-col justify-start">
            <div>
              <p className="text-white text-sm">{coin.name}</p>
              <p className="text-sm">{coin.symbol}</p>
            </div>
          </div>

          <div className="flex flex-col h-full">
            <p className="text-sm font-white self-start">FDV</p>

            <div className="self-center">
              <p className="text-sm text-white font-bold">
                {coin.price * coin.volume * usdcMmoshPrice}{" "}
                <span className="text-sm font-normal">USDC</span>
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Coins;
