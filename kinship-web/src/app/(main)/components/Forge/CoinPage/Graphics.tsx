import React from "react";
import { useAtom } from "jotai";

import DateTypeSelector from "../../common/DateTypeSelector";
import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import { coinStats, selectedDateType } from "@/app/(main)/store/coins";
import TVL from "../../CoinDirectory/TVL";
import Volume from "../../CoinDirectory/Volume";
import Price from "../../CoinDirectory/Price";

const typeOptions = [
  {
    label: "Price",
    value: "price",
  },
  {
    label: "Volume",
    value: "volume",
  },
  {
    label: "TVL",
    value: "tvl",
  },
];

type Props = {
  coin: CoinDetail;
  base: Coin;
  supply?: Number
};

const Graphics = ({ coin, base, supply }: Props) => {
  const [stats] = useAtom(coinStats);

  const [type, setType] = useAtom(selectedDateType);

  const [selectedGraphicType, setSelectedGraphicType] = React.useState({
    label: "Price",
    value: "price",
  });

  const renderGraphicType = React.useCallback(() => {
    if (selectedGraphicType.value === "tvl")
      return <TVL bonding={coin.bonding} height={400} base={base} />;

    if (selectedGraphicType.value === "volume")
      return <Volume bonding={coin.bonding} height={400} />;

    return <Price base={base} supply={supply} coin={coin}/>;
  }, [coin, selectedGraphicType]);

  return (
    <div className="w-full flex flex-col bg-[#040241] rounded-xl py-1 px-6 md:mr-4 relative">
      <div className="absolute right-4 top-0">
        <div className="w-full flex justify-end mt-4">
          <div className="flex items-center self-end">
            {/* <div className="dropdown rounded-lg py-1 ml-4 mr-6">
              <div tabIndex={0} role="button" className="btn m-1">
                <p className="text-base">{selectedGraphicType.label}</p>
              </div>
          
                <ul
                  tabIndex={0}
                  className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
                >
                  {typeOptions.map((value) => (
                    <li onClick={() => setSelectedGraphicType(value)}>
                      <p className="text-base">{value.label}</p>
                    </li>
                  ))}
                </ul>
          
            </div> */}
       
            {/* <DateTypeSelector type={type} setType={setType} /> */}
          </div>
        </div>
      </div>
      {renderGraphicType()}
    </div>
  );
};

export default Graphics;
