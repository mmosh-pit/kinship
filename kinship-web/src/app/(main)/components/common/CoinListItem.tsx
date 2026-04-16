import { walletAddressShortener } from "@/app/(main)/lib/walletAddressShortener";
import { Coin } from "@/app/(main)/models/coin";
import OpenInNew from "@/assets/icons/OpenInNew";
import Image from "next/image";

type Props = Coin & {
  onTokenSelect: (token: Coin) => void;
};

const CoinListItem = (props: Props) => {
  const openLink = () => {
    window.open(
      "https://solscan.io/account/" + props.token + "?cluster=mainnet",
      "_blank",
      "noopener,noreferrer",
    );
  };

  const chooseToken = () => {
    props.onTokenSelect(props);
  };
  return (
    <div className="flex items-center cursor-pointer" onClick={chooseToken}>
      <div className="relative w-[2vmax] h-[2vmax] mt-2 mr-1">
        <Image
          src={props.image}
          alt="coin"
          layout="fill"
          className="rounded-full"
        />
      </div>
      <div className="flex flex-col">
        <p className="text-sm text-white">{props.symbol.toUpperCase()}</p>
        <p className="text-tiny">{props.name}</p>
      </div>

      <div
        className="flex self-start mb-4 rounded-md px-1 bg-[#030139]"
        onClick={openLink}
      >
        <p className="text-tiny">{walletAddressShortener(props.token)}</p>
        <OpenInNew />
      </div>
    </div>
  );
};

export default CoinListItem;
