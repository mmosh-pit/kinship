import { useAtom } from "jotai";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import axios, { CancelTokenSource } from "axios";
import { Line, LineChart, ResponsiveContainer } from "recharts";

import {
  coinTextSearch,
  pair,
  selectedUSDCCoin,
  selectedVolume,
} from "@/app/(main)/store/coins";
import SortIcon from "@/assets/icons/SortIcon";
import { DirectoryCoin } from "@/app/(main)/models/directoryCoin";
import ArrowUp from "@/assets/icons/ArrowUp";
import ArrowDown from "@/assets/icons/ArrowDown";
import { getPriceForPTV } from "@/app/(main)/lib/forge/jupiter";

const CoinsTable = () => {
  const navigate = useRouter();
  const source = React.useRef<CancelTokenSource | null>(null);

  const [searchText] = useAtom(coinTextSearch);
  const [isUSDCSelected] = useAtom(selectedUSDCCoin);
  const [volume] = useAtom(selectedVolume);
  const [tradingPair] = useAtom(pair);

  const [selectedSort, setSelectedSort] = React.useState({
    type: "",
    value: "",
  });
  const [isLastPage, setIsLastPage] = React.useState(false);

  const [coins, setCoins] = React.useState<DirectoryCoin[]>([]);
  const [usdcMmoshPrice, setUsdcMmoshPrice] = React.useState(0);

  const getCoins = async (volume: string, keyword: string, page: number) => {
    try {
      if (source.current) {
        source.current.cancel();
        source.current = null;
      }
      source.current = axios.CancelToken.source();

      const prices = await getBaseTokenPrices();

      const url = `/api/list-coins?page=${page}&volume=${volume}&keyword=${keyword}&sort=${selectedSort.type}&direction=${selectedSort.value}&symbol=${tradingPair}`;

      const apiResult = await axios.get(url, {
        cancelToken: source.current.token,
      });

      const newCoins = [];
      let nf = new Intl.NumberFormat("en-US");
      for (let index = 0; index < apiResult.data.length; index++) {
        const element = apiResult.data[index];
        const datas = [];

        for (
          let index = 0;
          index < element.priceLastSevenDays.length;
          index++
        ) {
          const elementchart = element.priceLastSevenDays[index];
          datas.push(elementchart.value);
        }
        element.priceLastSevenDays = datas;
        let currentprice = 0;
        if (element.basesymbol === "PTVB") {
          currentprice = prices.ptvb;
        } else if (element.basesymbol === "PTVR") {
          currentprice = prices.ptvr;
        } else {
          currentprice = prices.mmosh;
        }
        console.log("element.basesymbol ", element.basesymbol);
        console.log("current price ", currentprice);
        element.marketcap =
          nf.format(element.supply * (currentprice * element.lastprice)) +
          " USDC";
        element.lastprice = currentprice * element.lastprice;
        element.volume = currentprice * element.volume;
        newCoins.push(element);
      }

      setCoins(newCoins);
      if (apiResult.data.length < 10) {
        setIsLastPage(true);
      }
    } catch (error) {
      console.error(error);
      setCoins([]);
    }
  };

  const getCoinPriceStatus = React.useCallback(
    (start: number, end: number) => {
      const isIncremental = start <= end;

      const iconToRender = isIncremental ? (
        <ArrowUp fill={isIncremental ? "#22C55E" : "#DC2626"} />
      ) : (
        <ArrowDown fill={isIncremental ? "#22C55E" : "#DC2626"} />
      );

      const substraction = end - start;

      const percentage =
        substraction === 0 || start === 0
          ? "0%"
          : `${(substraction / start) * 100}%`;

      return (
        <div className="flex items-center justify-evenly">
          <p
            className={`text-sm ${isIncremental ? "text-green-500" : "text-red-500"
              }`}
          >
            {percentage}
          </p>
          {iconToRender}
        </div>
      );
    },
    [usdcMmoshPrice, isUSDCSelected],
  );

  const getUsdcMmoshPrice = React.useCallback(async () => {
    if (tradingPair === "PTVB") {
      const mmoshUsdcPrice = await getPriceForPTV(
        process.env.NEXT_PUBLIC_PTVB_TOKEN,
      );
      setUsdcMmoshPrice(mmoshUsdcPrice);
    } else if (tradingPair === "PTVR") {
      const mmoshUsdcPrice = await getPriceForPTV(
        process.env.NEXT_PUBLIC_PTVR_TOKEN,
      );
      setUsdcMmoshPrice(mmoshUsdcPrice);
    } else {
      const mmoshUsdcPrice = await axios.get(
        `${process.env.NEXT_PUBLIC_JUPITER_PRICE_API}?ids=${process.env.NEXT_PUBLIC_OPOS_TOKEN},${process.env.NEXT_PUBLIC_USDC_TOKEN}`,
      );
      setUsdcMmoshPrice(mmoshUsdcPrice.data?.data?.MMOSH?.price || 0.003);
    }
  }, [tradingPair]);

  const navigateToCoinPage = React.useCallback((symbol: string) => {
    navigate.push(`/coins/${symbol}`);
  }, []);

  const getCoinPrice = React.useCallback(
    (price: number, pair: string) => {
      // if (isUSDCSelected) {
      //   return `${price * usdcMmoshPrice} USDC`;
      // }

      return `${price} ${pair}`;
    },
    [usdcMmoshPrice],
  );

  const getCoinFDV = React.useCallback(
    (value: number, pair: string) => {
      // if (isUSDCSelected) {
      //   return `${value * usdcMmoshPrice} USDC`;
      // }

      return `${value} ${pair}`;
    },
    [usdcMmoshPrice],
  );

  const getCoinVolume = React.useCallback(
    (value: number, pair: string) => {
      // if (isUSDCSelected) {
      //   return `${value * usdcMmoshPrice} USDC`;
      // }

      return `${value} ${pair}`;
    },
    [usdcMmoshPrice],
  );

  const getChartColor = React.useCallback((prices: string[]) => {
    if (Number(prices[prices.length - 1]) < Number(prices[prices.length - 2])) {
      return "#DC2626";
    }

    return "#22C55E";
  }, []);

  const handleSortOptionSelect = React.useCallback(
    (type: string) => {
      return;
      if (selectedSort.type === type) {
        setSelectedSort({
          type,
          value: selectedSort.value === "ASC" ? "DESC" : "ASC",
        });
        return;
      }

      setSelectedSort({ type, value: "DESC" });
    },
    [selectedSort],
  );

  React.useEffect(() => {
    getCoins(volume.value, searchText, 0);
    getUsdcMmoshPrice();
  }, [searchText, volume, tradingPair]);

  const getBaseTokenPrices = async () => {
    let prices = {
      mmosh: 0,
      ptvb: 0,
      ptvr: 0,
    };

    let mmoshResponse = await axios.get(
      "/api/token/lastprice?key=" + process.env.NEXT_PUBLIC_OPOS_TOKEN,
    );

    let ptvbResponse = await axios.get(
      "/api/token/lastprice?key=" + process.env.NEXT_PUBLIC_PTVB_TOKEN,
    );

    let ptvrResponse = await axios.get(
      "/api/token/lastprice?key=" + process.env.NEXT_PUBLIC_PTVR_TOKEN,
    );

    prices.mmosh = mmoshResponse.data.price || 0;
    prices.ptvb = ptvbResponse.data.price || 0;
    prices.ptvr = ptvrResponse.data.price || 0;
    return prices;
  };

  return (
    <table className="w-full bg-[#100E5242] rounded-md">
      <thead>
        <tr>
          <th>
            <p className="text-white text-sm">Rank</p>
          </th>
          <th align="center">
            <div
              className="flex items-center justify-center"
              onClick={() => handleSortOptionSelect("coin")}
            >
              {selectedSort.type === "coin" && <SortIcon />}
              <p className="text-white text-sm ml-2">Coin</p>
            </div>
          </th>
          <th align="center">
            <div
              className="flex items-center justify-center"
              onClick={() => handleSortOptionSelect("price")}
            >
              {selectedSort.type === "price" && <SortIcon />}
              <p className="text-white text-sm">Price</p>
            </div>
          </th>
          <th align="center">
            <p className="text-white text-sm">1H%</p>
          </th>
          <th align="center">
            <p className="text-white text-sm">24H%</p>
          </th>

          <th align="center">
            <div
              className="flex items-center justify-center"
              onClick={() => handleSortOptionSelect("fdv")}
            >
              {selectedSort.type === "fdv" && <SortIcon />}
              <p className="text-white text-sm">Market Cap</p>
            </div>
          </th>

          <th align="center">
            <div
              className="flex items-center justify-center"
              onClick={() => handleSortOptionSelect("volume")}
            >
              {selectedSort.type === "volume" && <SortIcon />}
              <p className="text-white text-sm">Volume</p>
            </div>
          </th>

          <th align="center">
            <p className="text-white text-sm">Last 7 days</p>
          </th>
        </tr>
      </thead>

      <tbody>
        {coins.map((coin, index) => (
          <tr
            className={`${index % 2 === 0
                ? "bg-[#100E5242] hover:bg-[#100E5230]"
                : "bg-[#07076E70] hover:bg-[#07076E60]"
              }`}
            key={coin.symbol}
            onClick={() => navigateToCoinPage(coin.symbol)}
          >
            <td align="center">
              <p className="text-white text-sm">{index + 1}</p>
            </td>

            <td align="center">
              <a
                href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/coins/${coin.symbol}`}
                className="cursor-pointer"
              >
                <div className="flex items-center">
                  <div className="relative w-[1vmax] h-[1vmax] rounded-full">
                    <Image
                      src={coin.image}
                      layout="fill"
                      alt={`${coin.name} image`}
                      className="rounded-full"
                    />
                  </div>
                  <p className="text-white text-sm ml-1">{coin.name}</p>
                  <p className="text-white text-sm ml-2">
                    {coin.symbol.toUpperCase()}
                  </p>
                </div>
              </a>
            </td>

            <td align="center">{coin.lastprice} USDC</td>

            <td align="center">
              {getCoinPriceStatus(coin.oneHourPriceStart, coin.oneHourPriceEnd)}
            </td>

            <td align="center">
              {getCoinPriceStatus(coin.oneDayPriceStart, coin.oneDayPriceEnd)}
            </td>

            <td align="center">{coin.marketcap}</td>

            <td align="center">
              {getCoinVolume(coin.volume, coin.basesymbol)} USDC
            </td>

            <td align="center">
              <ResponsiveContainer width={150} height={50}>
                <LineChart
                  width={150}
                  height={50}
                  data={coin.priceLastSevenDays.map((val) => ({ value: val }))}
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
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default CoinsTable;
