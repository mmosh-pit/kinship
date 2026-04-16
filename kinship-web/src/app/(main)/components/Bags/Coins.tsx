import { BagsCoin, bagsCoins } from "@/app/(main)/store/bags";
import { useAtom } from "jotai";
import CoinItem from "./CoinItem";

type Props = {
  onSelectCoin: (coin: BagsCoin) => void;
};

const Coins = ({ onSelectCoin }: Props) => {
  const [bags] = useAtom(bagsCoins);

  if (!bags) return(
    <div className="text-center text-gray-500 pb-6 mt-6">
      <p className="text-lg font-medium">Loading...</p>
    </div>
  );

  return (
    <div className="px-14 flex flex-col">
      {bags.network && (
        <div className="flex flex-col my-4">
          <h6>Network</h6>

          <CoinItem coin={bags!.network!} onSelect={onSelectCoin} />
        </div>
      )}

      {bags.stable && (
        <div className="flex flex-col my-4">
          <h6>Stable</h6>

          <CoinItem coin={bags!.stable!} onSelect={onSelectCoin} />
        </div>
      )}

      {bags.native && (
        <div className="flex flex-col my-4">
          <h6>Native</h6>

          <CoinItem coin={bags!.native!} onSelect={onSelectCoin} />
        </div>
      )}

      {bags.memecoins.length > 0 && (
        <div className="flex flex-col my-4">
          <h6>Memecoins</h6>

          {bags.memecoins.map((coin) => (
            <CoinItem coin={coin} onSelect={onSelectCoin} />
          ))}
        </div>
      )}

      {bags.exosystem.length > 0 && (
        <div className="flex flex-col my-4">
          <h6>Exosystem Coins</h6>

          {bags.exosystem.map((coin) => (
            <CoinItem coin={coin} onSelect={onSelectCoin} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Coins;
