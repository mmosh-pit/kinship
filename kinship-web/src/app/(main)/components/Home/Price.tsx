"use client";
import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";
import { selectedDirectory } from "@/app/(main)/store/home";
import axios from "axios";
import { useAtom } from "jotai";
import React from "react";
import DateTypeSelector from "../common/DateTypeSelector";
import dynamic from "next/dynamic";
import { web3Consts } from "@/anchor/web3Consts";

const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false, // Ensure ApexCharts is not imported during SSR
});

type Props = {
  symbol: string;
  bonding?: string;
  height?: number;
};

const Price = ({ height, symbol }: Props) => {
  const [data, setData] = React.useState<any>([
    {
      data: [],
    },
  ]);
  const [selectedCoinDirectory] = useAtom(selectedDirectory);
  const [price, setPrice] = React.useState(0);
  const [supply, setSupply] = React.useState<any>(0);
  const [fdv, setFdv] = React.useState<any>(0);
  // const [data, setData] = React.useState<any>([{
  //   data: [{
  //       x: new Date(1538778600000),
  //       y: [0.000329, 0.000350, 0.000323, 0.000333]
  //     },
  //     {
  //       x: new Date(1538780400000),
  //       y: [0.000332, 0.000343, 0.000320, 0.000330]
  //     },
  //     {
  //       x: new Date(1538782200000),
  //       y: [0.000330, 0.000348, 0.000323, 0.000335]
  //     },
  //     {
  //       x: new Date(1538784000000),
  //       y: [0.000335, 0.000351, 0.000329, 0.000338]
  //     },
  //     {
  //       x: new Date(1538785800000),
  //       y: [0.000338, 0.000340, 0.000320, 0.000324]
  //     },
  //     {
  //       x: new Date(1538787600000),
  //       y: [0.000324, 0.000336, 0.000321, 0.000324]
  //     },
  //     {
  //       x: new Date(1538789400000),
  //       y: [0.000324, 0.000332, 0.000317, 0.000326]
  //     },
  //     {
  //       x: new Date(1538791200000),
  //       y: [0.000327, 0.000327, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538793000000),
  //       y: [0.000305, 0.000308, 0.000303, 0.000304]
  //     },
  //     {
  //       x: new Date(1538794800000),
  //       y: [0.000304, 0.000314, 0.000302, 0.000308]
  //     },
  //     {
  //       x: new Date(1538796600000),
  //       y: [0.000308, 0.000310, 0.000301, 0.000308]
  //     },
  //     {
  //       x: new Date(1538798400000),
  //       y: [0.000308, 0.000318, 0.000308, 0.000312]
  //     },
  //     {
  //       x: new Date(1538800200000),
  //       y: [0.000312, 0.000315, 0.000305, 0.000312]
  //     },
  //     {
  //       x: new Date(1538802000000),
  //       y: [0.000312, 0.000324, 0.000308, 0.000322]
  //     },
  //     {
  //       x: new Date(1538803800000),
  //       y: [0.000323, 0.000323, 0.000315, 0.000315]
  //     },
  //     {
  //       x: new Date(1538805600000),
  //       y: [0.000318, 0.000318, 0.000310, 0.000310]
  //     },
  //     {
  //       x: new Date(1538807400000),
  //       y: [0.000311, 0.000322, 0.000310, 0.000314]
  //     },
  //     {
  //       x: new Date(1538809200000),
  //       y: [0.000314, 0.000326, 0.000313, 0.000323]
  //     },
  //     {
  //       x: new Date(1538811000000),
  //       y: [0.000323, 0.000327, 0.000318, 0.000320]
  //     },
  //     {
  //       x: new Date(1538812800000),
  //       y: [0.000319, 0.000320, 0.000310, 0.000315]
  //     },
  //     {
  //       x: new Date(1538814600000),
  //       y: [0.000315, 0.000317, 0.000310, 0.000315]
  //     },
  //     {
  //       x: new Date(1538816400000),
  //       y: [0.000315, 0.000321, 0.000308, 0.000320]
  //     },
  //     {
  //       x: new Date(1538818200000),
  //       y: [0.000319, 0.000325, 0.000314, 0.000320]
  //     },
  //     {
  //       x: new Date(1538820000000),
  //       y: [0.000320, 0.000334, 0.000317, 0.000324]
  //     },
  //     {
  //       x: new Date(1538821800000),
  //       y: [0.000325, 0.000326, 0.000311, 0.000317]
  //     },
  //     {
  //       x: new Date(1538823600000),
  //       y: [0.000319, 0.000325, 0.000395, 0.000398]
  //     },
  //     {
  //       x: new Date(1538825400000),
  //       y: [0.000398, 0.000398, 0.000370, 0.000387]
  //     },
  //     {
  //       x: new Date(1538827200000),
  //       y: [0.000388, 0.000300, 0.000380, 0.000393]
  //     },
  //     {
  //       x: new Date(1538829000000),
  //       y: [0.000393, 0.000398, 0.000385, 0.000387]
  //     },
  //     {
  //       x: new Date(1538830800000),
  //       y: [0.000387, 0.000392, 0.000367, 0.000378]
  //     },
  //     {
  //       x: new Date(1538832600000),
  //       y: [0.000378, 0.000381, 0.000367, 0.000379]
  //     },
  //     {
  //       x: new Date(1538834400000),
  //       y: [0.000379, 0.000380, 0.00030, 0.000375]
  //     },
  //     {
  //       x: new Date(1538836200000),
  //       y: [0.000375, 0.000389, 0.000371, 0.000388]
  //     },
  //     {
  //       x: new Date(1538838000000),
  //       y: [0.000388, 0.000394, 0.000377, 0.000389]
  //     },
  //     {
  //       x: new Date(1538839800000),
  //       y: [0.000389, 0.000398, 0.000389, 0.000396]
  //     },
  //     {
  //       x: new Date(1538841600000),
  //       y: [0.000397, 0.000300, 0.000388, 0.000396]
  //     },
  //     {
  //       x: new Date(1538843400000),
  //       y: [0.000398, 0.000300, 0.000388, 0.000395]
  //     },
  //     {
  //       x: new Date(1538845200000),
  //       y: [0.000395, 0.000302, 0.000388, 0.000302]
  //     },
  //     {
  //       x: new Date(1538847000000),
  //       y: [0.000302, 0.000307, 0.000396, 0.000399]
  //     },
  //     {
  //       x: new Date(1538848800000),
  //       y: [0.000300, 0.000301, 0.000390, 0.000391]
  //     },
  //     {
  //       x: new Date(1538850600000),
  //       y: [0.000391, 0.000303, 0.000391, 0.000391]
  //     },
  //     {
  //       x: new Date(1538852400000),
  //       y: [0.000391, 0.000301, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538854200000),
  //       y: [0.000303, 0.000303, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538856000000),
  //       y: [60.000303, 0.000304, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538857800000),
  //       y: [0.000303, 0.000304, 0.000303, 0.000300]
  //     },
  //     {
  //       x: new Date(1538859600000),
  //       y: [0.000301, 0.000303, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538861400000),
  //       y: [0.000303, 0.000304, 0.000390, 0.000302]
  //     },
  //     {
  //       x: new Date(1538863200000),
  //       y: [0.000302, 0.000306, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538866000000),
  //       y: [0.000303, 0.000303, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538866800000),
  //       y: [0.000303, 0.000303, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538868600000),
  //       y: [0.000303, 0.000303, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538870400000),
  //       y: [0.000303, 0.000301, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538872200000),
  //       y: [0.000398, 0.000305, 0.000396, 0.000300]
  //     },
  //     {
  //       x: new Date(1538874000000),
  //       y: [0.000300, 0.000305, 0.000303, 0.000393]
  //     },
  //     {
  //       x: new Date(1538875800000),
  //       y: [0.000393, 0.000305, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538877600000),
  //       y: [0.000303, 0.000304, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538879400000),
  //       y: [0.000304, 0.000304, 0.000300, 0.000303]
  //     },
  //     {
  //       x: new Date(1538881200000),
  //       y: [0.000303, 0.000303, 0.000303, 0.000303]
  //     },
  //     {
  //       x: new Date(1538883000000),
  //       y: [0.000303, 0.000305, 0.000300, 0.000304]
  //     },
  //     {
  //       x: new Date(1538884800000),
  //       y: [0.000304, 0.000306, 0.000304, 0.000306]
  //     },
  //   ]
  // }])
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
      let tokenDetail = await axios.get(
        `/api/project/token-detail?symbol=${symbol.toUpperCase()}`,
      );
      let token = tokenDetail.data.key;
      let priceResult = await axios.get(
        `/api/token/price?key=${token}&type=${type}`,
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

        setFdv(nf.format(priceResult.data.fdv));
        setSupply(nf.format(priceResult.data.supply / web3Consts.LAMPORTS_PER_OPOS));
        setPrice(priceResult.data.price);
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

  React.useEffect(() => {
    getPricesFromAPI();
  }, [selectedCoinDirectory, type]);

  return (
    <div className="w-full flex flex-col bg-[#04024185] rounded-xl">
      <div className="w-full flex justify-between px-4 pt-4">
        <div className="md:flex">
          <div className="flex flex-col mb-2.5 md:mr-10 md:mb-0">
            <p className="text-sm">{symbol} Price</p>
            <h6>USDC {price}</h6>
          </div>
          <div className="flex flex-col mb-2.5 md:mr-10 md:mb-0">
            <p className="text-sm">{symbol} Total Supply</p>
            <h6>{supply}</h6>
          </div>
          <div className="flex flex-col">
            <p className="text-sm">{symbol} Fully Diluted Value(FDV)</p>
            <h6>USD {fdv}</h6>
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
