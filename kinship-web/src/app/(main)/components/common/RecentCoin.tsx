import { Coin } from "@/app/(main)/models/coin";
import Image from "next/image";

type Props = Coin & {
  onTokenSelect: (token: Coin) => void;
};

const RecentCoin = (props: Props) => {
  const chooseToken = () => {
    props.onTokenSelect(props);
  };
  return (
    <div
      className="flex items-center bg-[#384658] border-[1px] border-[#FFF]"
      onClick={chooseToken}
    >
      <div className="relative w-[1.5vmax] h-[1.5vmax] mr-1">
        <Image
          src={props.image}
          alt="coin"
          layout="fill"
          className="rounded-full"
        />
      </div>
      <p className="text-sm text-white">{props.symbol}</p>
    </div>
  );
};

export default RecentCoin;
