import React from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import Image from "next/image";
import { DirectoryCoin } from "@/app/(main)/models/directoryCoin";
import { useRouter } from "next/navigation";
import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";

type Props = {
  coin: DirectoryCoin;
  displayGraph: boolean;
};

const CoinCardItem = ({ coin, displayGraph }: Props) => {
  const navigate = useRouter();
  const navigateToCoinPage = React.useCallback((symbol: string) => {
    navigate.push(`/coins/${symbol}`);
  }, []);

  const getChartColor = React.useCallback((prices: string[]) => {
    if (Number(prices[prices.length - 1]) < Number(prices[prices.length - 2])) {
      return "#DC2626";
    }

    return "#22C55E";
  }, []);

  return (
    <div
      className="flex bg-[#030007] bg-opacity-40 px-2 py-2 rounded-2xl cursor-pointer"
      id={displayGraph ? "border-gradient-container" : ""}
      key={coin.symbol.toUpperCase()}
      onClick={() => navigateToCoinPage(coin.symbol)}
    >
      <div className="self-center max-w-[20%] md:mr-4 2xl:mr-8">
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
          <p className="text-sm">{coin.symbol.toUpperCase()}</p>
        </div>
      </div>

      <div className="flex flex-col h-full">
        <p className="text-xs font-white self-start text-center">Market Cap</p>

        <div className="self-center">
          <p className="text-xs text-white font-bold text-center">
            {abbreviateNumber(coin.marketcap)}{" "}
            <span className="text-sm font-normal">USDC</span>
          </p>
        </div>
      </div>
      {displayGraph && (
        <div className="flex flex-col">
          <p className="text-xs self-end">24h</p>

          <div className="w-[4vmax]">
            <ResponsiveContainer width="100%" height={50}>
              <LineChart
                width={150}
                height={50}
                data={coin.priceLastSevenDays.map((val) => ({
                  value: val,
                }))}
              >
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={getChartColor(coin.priceLastSevenDays)}
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex self-end">
            <p className="text-sm text-[#39F10A]">0.0%</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoinCardItem;
