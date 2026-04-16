import React from "react";

import { Area, AreaChart, ResponsiveContainer, XAxis } from "recharts";

type Props = {
  isBlue: boolean;
  bonding?: string;
  height?: number;
};

const redColor = "#FF0000";
const blueColor = "#0061FF";

const Price = ({ height, isBlue }: Props) => {
  // const [data, setData] = React.useState([]);

  const data = [
    {
      name: "Page A",
      uv: 4000,
      pv: 2400,
      amt: 2400,
    },
    {
      name: "Page B",
      uv: 3000,
      pv: 1398,
      amt: 2210,
    },
    {
      name: "Page C",
      uv: 2000,
      pv: 9800,
      amt: 2290,
    },
    {
      name: "Page D",
      uv: 2780,
      pv: 3908,
      amt: 2000,
    },
    {
      name: "Page E",
      uv: 1890,
      pv: 4800,
      amt: 2181,
    },
    {
      name: "Page F",
      uv: 2390,
      pv: 3800,
      amt: 2500,
    },
    {
      name: "Page G",
      uv: 3490,
      pv: 4300,
      amt: 2100,
    },
  ];

  return (
    <div
      className={`w-full flex flex-col bg-[#040241] border-[1px] ${isBlue ? `border-[${blueColor}]` : `border-[${redColor}]`} rounded-xl`}
    >
      <div className="flex flex-col ml-6 mt-4">
        <p className="text-sm">MMOSH Price</p>
        <h6 className="my-2">$12.2M</h6>
        <h6>USDC 12.2M</h6>
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
              id={`gradient-price-${isBlue ? "blue" : "red"}`}
              x1="0"
              y1="0"
              x2="0"
              y2="2"
            >
              <stop
                offset="0%"
                stopColor={isBlue ? blueColor : redColor}
                stopOpacity={0.8}
              />
              <stop
                offset="75%"
                stopColor={isBlue ? blueColor : redColor}
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" stroke="#AEAEB2" />
          <Area
            type="monotone"
            dataKey="pv"
            stroke={isBlue ? blueColor : redColor}
            fill={`url(#gradient-price-${isBlue ? "blue" : "red"})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Price;
