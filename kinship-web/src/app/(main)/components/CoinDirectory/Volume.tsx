import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";
import axios from "axios";
import React from "react";

import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";
import DateTypeSelector from "../common/DateTypeSelector";
import { useAtom } from "jotai";
import { selectedDateType } from "@/app/(main)/store/coins";

type Props = {
  bonding?: string;
  height?: number;
  withFilters?: boolean;
};

const Volume = ({ bonding, height, withFilters }: Props) => {
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
    <div className="w-full flex flex-col bg-[#04024185] rounded-xl">
      <div className="w-full flex justify-between px-4 pt-8">
        <div className="flex flex-col">
          <p className="text-sm">Volume</p>
          <h6 className="my-2">${total}</h6>
          <p className="text-tiny">Past Month</p>
        </div>
        <div className="mt-4 mr-4">
           {withFilters && <DateTypeSelector type={type} setType={setType} />}
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
          <XAxis dataKey="label" />
          <Bar dataKey="value" fill="#7000FF" radius={[20, 20, 10, 10]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Volume;
