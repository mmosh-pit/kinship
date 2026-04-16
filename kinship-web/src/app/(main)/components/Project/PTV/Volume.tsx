import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";
import axios from "axios";
import React from "react";

import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";
import { useAtom } from "jotai";
import { selectedDateType } from "@/app/(main)/store/coins";
import DateTypeSelector from "../../common/DateTypeSelector";

type Props = {
  isBlue: boolean;
  bonding?: string;
  height?: number;
  withFilters?: boolean;
};

const redColor = "#FF0000";
const blueColor = "#0061FF";

const Volume = ({ bonding, height, withFilters, isBlue }: Props) => {
  const [data, setData] = React.useState([]);
  const [total, setTotal] = React.useState("0");

  const [type, setType] = useAtom(selectedDateType);

  const getVolume = async () => {
    try {
      const result = await axios.get(
        `/api/volume?type=${type}&bonding=${bonding}`,
      );

      setData(result.data.labels?.reverse() || []);

      setTotal(abbreviateNumber(Math.abs(result.data.total)));
    } catch (error) {
      setTotal("0");
    }
  };

  React.useEffect(() => {
    getVolume();
  }, [type]);

  return (
    <div
      className={`w-full flex flex-col bg-[#040241] border-[1px] ${isBlue ? `border-[${blueColor}]` : `border-[${redColor}]`} rounded-xl mx-8 mt-6`}
    >
      <div className="w-full flex justify-between">
        <div className="flex flex-col ml-6 mt-4">
          <p className="text-sm">Volume</p>
          <h6 className="my-2">${total}</h6>
          <p className="text-tiny">Past Month</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height || 200}>
        <BarChart
          width={500}
          height={height || 300}
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <XAxis dataKey="label" stroke="#AEAEB2" />
          <Bar dataKey="value" fill="#FFFFFF" radius={[20, 20, 10, 10]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Volume;
