import axios from "axios";
import React from "react";

import { Area, AreaChart, ResponsiveContainer, XAxis } from "recharts";

import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";
import { Coin } from "@/app/(main)/models/coin";

type Props = {
  isBlue: boolean;
  bonding?: string;
  height?: number;
  base?: Coin;
};

const redColor = "#FF0000";
const blueColor = "#0061FF";

const TVL = ({ bonding, base, height, isBlue }: Props) => {
  const rendered = React.useRef(false);

  const [data, setData] = React.useState<{ value: number; name: string }[]>([]);
  const [total, setTotal] = React.useState("0");

  const getTVL = async () => {
    try {
      const tvlResult = await axios.get(`/api/tvl?bonding=${bonding}`);
      const data = [];

      for (let index = 0; index < tvlResult.data.labels.length; index++) {
        const element = tvlResult.data.labels[index];
        data.push({ value: Math.abs(element.value), name: element.label });
      }

      setTotal(abbreviateNumber(Math.abs(tvlResult.data.total)));

      setData(data.reverse());
    } catch (error) {
      console.error(error);
      setTotal("0");
    }
  };

  React.useEffect(() => {
    if (!rendered.current) {
      getTVL();
      rendered.current = true;
    }
  }, []);

  return (
    <div
      className={`w-full flex flex-col bg-[#040241] border-[1px] ${isBlue ? `border-[${blueColor}]` : `border-[${redColor}]`} rounded-xl`}
    >
      <div className="flex flex-col ml-6 mt-4">
        <p className="text-sm mb-2">TVL</p>
        <h6>
          {total} {base?.symbol}
        </h6>
      </div>
      <ResponsiveContainer width="100%" height={height || 200}>
        <AreaChart
          width={500}
          height={height || 200}
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <defs>
            <linearGradient
              id={`gradient-${isBlue ? "blue" : "red"}`}
              x1="0"
              y1="0"
              x2="0"
              y2="2"
            >
              <stop offset="0%" stopColor="#007AFF" stopOpacity={0.8} />
              <stop offset="75%" stopColor="#09093C" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" stroke="#AEAEB2" />
          <Area
            type="monotone"
            dataKey="value"
            stroke={isBlue ? blueColor : redColor}
            fill={`url(#gradient-${isBlue ? "blue" : "red"})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TVL;
