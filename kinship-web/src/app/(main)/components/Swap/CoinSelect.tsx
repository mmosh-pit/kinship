import React from "react";
import axios from "axios";
import Image from "next/image";
import { useAtom } from "jotai";

import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import Search from "../common/Search";
import CoinListItem from "../common/CoinListItem";
import { SwapCoin } from "@/app/(main)/models/swapCoin";
import SimpleArrowDown from "@/assets/icons/SimpleArrowDown";
import CloseIcon from "@/assets/icons/CloseIcon";
import { data } from "@/app/(main)/store";
import RecentCoin from "../common/RecentCoin";
import baseCoins from "@/app/(main)/lib/baseCoins";

type Props = {
  selectedCoin: SwapCoin | null;
  otherToken: SwapCoin | null;
  onTokenSelect: (coin: SwapCoin, isBase: boolean) => {};
  isBase: boolean;
  readonly: boolean;
};

const CoinSelect = ({
  selectedCoin,
  otherToken,
  onTokenSelect,
  isBase,
  readonly,
}: Props) => {
  const [coinsList, setCoinsList] = React.useState<Coin[]>([]);
  const [communityCoins, setCommunityCoins] = React.useState<Coin[]>([]);
  const [politicalCoins, setPoliticalCoins] = React.useState<Coin[]>([]);

  const [recentCoins, setRecentCoins] = React.useState<Coin[]>([]);

  const [searchText, setSearchText] = React.useState("");

  const [currentUser] = useAtom(data);

  const getCoinsList = async () => {
    const listResult = await axios.get(`/api/list-tokens?search=${searchText}&&status=active`);
    let coinFinalList:any = []
    for (let index = 0; index < listResult.data.length; index++) {
      const element = listResult.data[index].target
      element.is_memecoin = true
      coinFinalList.push(element);
    }
    setCoinsList(coinFinalList)
  };

  const getCommunityCoin = async () => {
    const listResult = await axios.get<CoinDetail[]>(
      `/api/list-tokens?search=${searchText}&&status=completed`,
    );
    const coinData = listResult.data;
    const uniqueArray = Array.from(new Set
      (coinData.map((obj:CoinDetail) => obj.base)));

    let coinFinalList:any = []
    for (let index = 0; index < uniqueArray.length; index++) {
      const element:any = uniqueArray[index]
      element.is_memecoin = false

      coinFinalList.push(element);
      
    }
    setCommunityCoins(coinFinalList);
  };

  const handleTokenSelect = (token: Coin) => {
    onTokenSelect(token as SwapCoin, isBase);
    (
      document.getElementById(
        isBase ? "coin_modal_base" : "coin_modal_target",
      ) as any
    )?.close();
  };

  React.useEffect(() => {
    getCoinsList();
    getCommunityCoin()
  }, [searchText, isBase]);

  const onOpenModel = async () => {
    await getCoinsList();
    await getCommunityCoin();
    (
      document.getElementById(
        isBase ? "coin_modal_base" : "coin_modal_target",
      ) as any
    )?.showModal();
  };

  return (
    <>
      <div
        className={`flex items-center min-w-[2.5vmax] min-h-[2vmax] ${!readonly && "cursor-pointer"} border-[1px] border-[#FFFFFF05] bg-[#DEDDFC12] rounded-md px-2 mx-1`}
        onClick={onOpenModel}
      >
        {selectedCoin && (
          <>
            {selectedCoin!.image && (
              <div className="w-[1.5vmax] h-[1.5vmax] relative flex items-center">
                <Image
                  src={selectedCoin!.image}
                  alt={selectedCoin!.symbol}
                  layout="fill"
                />
              </div>
            )}
            <p className="text-white text-sm ml-1 mr-2">
              {selectedCoin!.symbol.toUpperCase()}
            </p>

            <SimpleArrowDown />
          </>
        )}
      </div>
      <dialog
        id={isBase ? "coin_modal_base" : "coin_modal_target"}
        className="modal"
      >
        <div className="flex flex-col modal-box w-[40%] bg-[#02001A] p-8">
          <div className="custom-select-open grow">
            <div className="flex w-full justify-between mb-2">
              <p className="text-xs text-white font-bold ml-4">Trading Pairs</p>

              <button
                className="cursor-pointer"
                onClick={() =>
                  (
                    document.getElementById(
                      isBase ? "coin_modal_base" : "coin_modal_target",
                    ) as any
                  )?.close()
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

            <div className="w-full h-[1px] bg-[#36357C] px-2 mb-8 mt-2" />

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
                    is_memecoin={coin.is_memecoin}
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
                          is_memecoin={coin.is_memecoin}
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
                    is_memecoin={coin.is_memecoin}
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
