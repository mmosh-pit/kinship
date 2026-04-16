import { BagsNFT, bagsNfts } from "@/app/(main)/store/bags";
import { useAtom } from "jotai";
import NFTItem from "./NFTItem";

type Props = {
  onSelect: (coin: BagsNFT) => void;
};

const NFTs = ({ onSelect }: Props) => {
  const [bags] = useAtom(bagsNfts);

  if (!bags) return <></>;

  return (
    <div className="px-24 flex flex-col overflow-y-auto overflow-x-hidden">
      {bags.profiles.length > 0 && (
        <div className="flex flex-col my-4">
          <h6 className="ml-4">Profiles</h6>

          {bags.profiles.map((asset) => (
            <NFTItem asset={asset} onSelect={onSelect} />
          ))}
        </div>
      )}

      {bags.badges.length > 0 && (
        <div className="flex flex-col my-4">
          <h6 className="ml-4">Badges</h6>

          {bags.badges.map((asset) => (
            <NFTItem asset={asset} onSelect={onSelect} />
          ))}
        </div>
      )}

      {bags.passes.length > 0 && (
        <div className="flex flex-col my-4">
          <h6 className="ml-4">Passes</h6>

          {bags.passes.map((asset) => (
            <NFTItem asset={asset} onSelect={onSelect} />
          ))}
        </div>
      )}

      {bags.exosystem.length > 0 && (
        <div className="flex flex-col my-4">
          <h6 className="ml-4">Exosystem Coins</h6>

          {bags.exosystem.map((asset) => (
            <NFTItem asset={asset} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export default NFTs;
