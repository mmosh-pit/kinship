import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import axios from "axios";
import React from "react";
import DateTypeSelector from "../common/DateTypeSelector";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false, // Ensure ApexCharts is not imported during SSR
});

type Props = {
  bonding?: string;
  height?: number;
  base?: Coin;
  coin?: CoinDetail;
  supply?: any;
};

const Price = ({ height, base, coin, supply }: Props) => {
  const [price, setPrice] = React.useState<any>(0);
  const [marketcap, setMarketCap] = React.useState<any>(0);
  const [data, setData] = React.useState<any>([
    {
      data: [],
    },
  ]);

  const [type, setType] = React.useState("day");

  const [options, setOptions] = React.useState<any>({
    chart: {
      type: "candlestick",
      height: height || 300,
    },
    xaxis: {
      type: "datetime",
      labels: {
        style: {
          colors: "#fff",
        },
      },
    },
    yaxis: {
      labels: {
        formatter(value: string, timestamp?: number, opts?: any) {
          return Number(value).toFixed(5).toString();
        },
        style: {
          colors: "#fff",
        },
      },
      tooltip: {
        enabled: true,
      },
    },
    tooltip: {
      enabled: false,
    },
  });

  const getPricesFromAPI = async () => {
    try {
      let usdPrice = await getBaseTokenPrice();
      let priceResult = await axios.get(
        `/api/token/price?key=${coin?.bonding}&type=${type}`,
      );
      console.log("priceResult.data ", priceResult.data);
      if (priceResult.data?.prices) {
        const newData = [];
        for (let index = 0; index < priceResult.data.prices.length; index++) {
          const element = priceResult.data.prices[index];
          newData.push({
            x: new Date(element.x),
            y: element.y,
          });
        }
        let nf = new Intl.NumberFormat("en-US");
        setPrice(priceResult.data.price * usdPrice);
        setMarketCap(nf.format(supply * (priceResult.data.price * usdPrice)));
        setData([
          {
            data: newData,
          },
        ]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getBaseTokenPrice = async () => {
    if (!base) {
      return 0;
    }
    let price = 0;
    if (base.symbol == "MMOSH") {
      let apiResponse = await axios.get(
        "/api/token/lastprice?key=" + process.env.NEXT_PUBLIC_OPOS_TOKEN,
      );
      price = apiResponse.data.price || 0;
    } else {
      let apiResponse = await axios.get(
        `/api/token/lastprice?key=` + base.token,
      );
      price = apiResponse.data.price || 0;
    }
    return price;
  };

  React.useEffect(() => {
    getPricesFromAPI();
  }, [type]);

  return (
    <div className="w-full flex flex-col bg-[#04024185] rounded-xl">
      <div className="w-full flex justify-between px-4 pt-4">
        <div className="md:flex">
          <div className="flex flex-col mb-2.5 md:mr-10 md:mb-0">
            <p className="text-sm">{coin?.symbol.toUpperCase()} Price</p>
            <h6>USDC {price}</h6>
          </div>
          <div className="flex flex-col mb-2.5 md:mr-10 md:mb-0">
            <p className="text-sm">{coin?.symbol.toUpperCase()} Market Cap</p>
            <h6>USDC {marketcap}</h6>
          </div>
        </div>
        <DateTypeSelector type={type} setType={setType} />
      </div>
      <Chart
        options={options}
        series={data}
        type="candlestick"
        height={height || 300}
      />
    </div>
  );
};

export default Price;
