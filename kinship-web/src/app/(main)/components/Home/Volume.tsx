import { abbreviateNumber } from "@/app/(main)/lib/abbreviateNumber";
import axios from "axios";
import React from "react";

import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";
import DateTypeSelector from "../common/DateTypeSelector";
import { useAtom } from "jotai";
import { selectedDateType } from "@/app/(main)/store/coins";
import { selectedDirectory } from "@/app/(main)/store/home";

type Props = {
  bonding?: string;
  height?: number;
  withFilters?: boolean;
};

const Volume = ({ bonding, height, withFilters }: Props) => {
  const [data, setData] = React.useState([]);
  const [total, setTotal] = React.useState("0");
  const [selectedCoinDirectory] = useAtom(selectedDirectory);

  const [type, setType] = useAtom(selectedDateType);

  const getVolume = async () => {
    try {
      let result;
      if(bonding) {
        result = await axios.get(
          `/api/volume?type=${type}&bonding=${bonding}`,
        );
      } else {
        result = await axios.get(
          `/api/volume?type=${type}&symbol=${selectedCoinDirectory}`,
        );
      }
  
      setData(result.data.labels?.reverse() || []);

      setTotal(abbreviateNumber(Math.abs(result.data.total)));
    } catch (error) {
      setTotal("0");
    }
  };

  React.useEffect(() => {
    console.log("selectedCoinDirectory from volume", selectedCoinDirectory)
    getVolume();
  }, [type, selectedCoinDirectory]);

  return (
    <div className="w-full flex flex-col bg-[#04024185] rounded-xl">
      <div className="w-full flex justify-between px-4 pt-8">
        <div className="flex flex-col">
          <p className="text-sm">Volume</p>
          <h6 className="my-2">${total}</h6>
          <p className="text-tiny">Past Month</p>
        </div>

        {withFilters && <DateTypeSelector type={type} setType={setType} />}
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
