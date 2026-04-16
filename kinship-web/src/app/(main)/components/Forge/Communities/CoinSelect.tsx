import React from "react";
import axios from "axios";
import { useAtom } from "jotai";
import Image from "next/image";

import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import { userWeb3Info } from "@/app/(main)/store";
import Search from "../../common/Search";
import RecentCoin from "../../common/RecentCoin";
import CoinListItem from "../../common/CoinListItem";
import { SwapCoin } from "@/app/(main)/models/swapCoin";
import CloseIcon from "@/assets/icons/CloseIcon";
import useWallet from "@/utils/wallet";
import baseCoins from "@/app/(main)/lib/baseCoins";

type Props = {
  selectedCoin: SwapCoin | null;
  onTokenSelect: React.Dispatch<React.SetStateAction<SwapCoin | null>>;
};

const CoinSelect = ({ selectedCoin, onTokenSelect }: Props) => {
  const wallet = useWallet();
  const [profileInfo] = useAtom(userWeb3Info);

  const fetching = React.useRef(false);

  const [coinsList, setCoinsList] = React.useState<Coin[]>([]);
  const [communityCoins, setCommunityCoins] = React.useState<Coin[]>([]);
  const [searchText, setSearchText] = React.useState("");


  const getCoinsList = React.useCallback(async () => {
    fetching.current = true;
    const listResult = await axios.get<CoinDetail[]>(
      `/api/list-tokens?search=${searchText}&&status=active`,
    );

    let coinFinalList:any = []
    for (let index = 0; index < listResult.data.length; index++) {
      const element:any = listResult.data[index].target
      element.is_memecoin = true
      coinFinalList.push(element);
    }
    setCoinsList(coinFinalList)
    fetching.current = false;
  }, [searchText]);

  const getCommunityCoin = React.useCallback(async () => {
    fetching.current = true;
    const listResult = await axios.get<CoinDetail[]>(
      `/api/list-tokens?search=${searchText}&&status=completed`,
    );
    const coinData = listResult.data;
    const uniqueArray = Array.from(new Set
      (coinData.map((obj:CoinDetail) => obj.base.token)));

    let coinFinalList:any = []
    for (let index = 0; index < uniqueArray.length; index++) {
      const element:any = uniqueArray[index]
      element.is_memecoin = false
      coinFinalList.push(element);
      
    }
    setCommunityCoins(coinFinalList);
    fetching.current = false;
  }, [searchText]);

  const handleTokenSelect = React.useCallback(
    (token: Coin) => {
      onTokenSelect(token as SwapCoin);
      (document.getElementById("coin_modal") as any)?.close();
    },
    [wallet],
  );

  React.useEffect(() => {
    getCoinsList();
    getCommunityCoin();
  }, [searchText]);

  return (
    <>
      <div
        className="w-full flex items-center min-w-[2.5vmax] min-h-[2vmax] bg-black bg-opacity-[0.07] cursor-pointer border-[1px] border-[#FFFFFF30] rounded-lg px-2 mx-1"
        onClick={() => {
          return (document.getElementById("coin_modal") as any)?.showModal();
        }}
      >
        {selectedCoin ? (
          <div className="w-full flex justify-center items-center">
            <div className="w-[1.2vmax] h-[1.2vmax] relative flex items-center">
              <Image
                src={selectedCoin!.image}
                alt={selectedCoin!.symbol}
                layout="fill"
              />
            </div>
            <p className="text-white text-sm ml-1 mr-2">
              {selectedCoin!.symbol.toUpperCase()}
            </p>
          </div>
        ) : (
          <div className="w-full flex items-center justify-center">
            <p className="text-base text-gray-500">Set the Coin</p>
          </div>
        )}
      </div>
      <dialog id="coin_modal" className="modal">
        <div className="flex flex-col modal-box w-[40%] bg-[#02001A] p-8">
          <div className="custom-select-open grow">
            <div className="flex w-full justify-between mb-2">
              <p className="text-xs text-white font-bold ml-4">Trading Pairs</p>

              <button
                className="cursor-pointer"
                onClick={() =>
                  (document.getElementById("coin_modal") as any)?.close()
                }
              >
                <CloseIcon />
              </button>
            </div>

            <div className="my-2 w-[80%] ml-8">
              <Search
                value={searchText}
                onChange={(e) => setSearchText(e)}
                darker
              />
            </div>

            <div className="w-full h-[0.5px] bg-[#36357C] px-2 mb-8 mt-2" />

            <div className="w-full mb-4 mt-6">
              <p className="text-lg text-white font-bold">Network Tokens</p>
            </div>

            {baseCoins.map((coin) => {
              return (
                <div className="my-2">
                  <CoinListItem
                    token={coin.token}
                    name={coin.name}
                    desc={coin.desc}
                    symbol={coin.symbol}
                    image={coin.image}
                    decimals={coin.decimals}
                    onTokenSelect={handleTokenSelect}
                    key={coin.token}
                  />
                </div>
              );
            })}

            {communityCoins.length > 0 &&
              <>
                <div className="w-full mb-4 mt-6">
                  <p className="text-lg text-white font-bold">Community Coins</p>
                </div>

                {communityCoins.map((coin) => {
                  return (
                    <div className="my-2">
                      <CoinListItem
                        token={coin.token}
                        name={coin.name}
                        desc={coin.desc}
                        symbol={coin.symbol}
                        image={coin.image}
                        decimals={coin.decimals}
                        onTokenSelect={handleTokenSelect}
                        key={coin.token}
                      />
                    </div>
                  );
                })}
              </>
            }

            <div className="w-full mb-4 mt-6">
              <p className="text-lg text-white font-bold">Memecoins</p>
            </div>

            {coinsList.map((coin) => {
              return (
                <div className="my-2">
                  <CoinListItem
                    token={coin.token}
                    name={coin.name}
                    desc={coin.desc}
                    symbol={coin.symbol}
                    image={coin.image}
                    decimals={coin.decimals}
                    onTokenSelect={handleTokenSelect}
                    key={coin.token}
                  />
                </div>
              );
            })}

          </div>
        </div>
      </dialog>
    </>
  );
};

export default CoinSelect;
