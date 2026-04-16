import React from "react";
import axios from "axios";
import { useAtom } from "jotai";
import Image from "next/image";

import ArrowDown from "@/assets/icons/ArrowDown";
import ArrowUp from "@/assets/icons/ArrowUp";
import { Coin } from "@/app/(main)/models/coin";
import { userWeb3Info } from "@/app/(main)/store";
import CoinListItem from "./CoinListItem";
import Search from "./Search";
import RecentCoin from "./RecentCoin";
import { selectOpened } from "@/app/(main)/store/community";

type Props = {
  onSelect: (value: Coin) => void;
  placeholder: string;
  title: string;
  selectedItem: Coin | null;
};

const CustomCoinSelect = ({
  title,
  placeholder,
  onSelect,
  selectedItem,
}: Props) => {
  const divWrapperRef = React.useRef<HTMLDivElement>(null);

  const [profileInfo] = useAtom(userWeb3Info);
  const [isOpen, setIsOpen] = useAtom(selectOpened);

  const fetching = React.useRef(false);
  const [displayItems, setDisplayItems] = React.useState(false);

  const [searchText, setSearchText] = React.useState("");

  const [coinsList, setCoinsList] = React.useState<Coin[]>([]);

  const [recentCoins, setRecentCoins] = React.useState<Coin[]>([]);

  const animating = React.useRef(false);

  const toggleContainer = React.useCallback(() => {
    if (animating.current) return;
    setIsOpen(!isOpen);
  }, [isOpen]);

  const getCoinsLists = React.useCallback(async () => {
    fetching.current = true;
    const listResult = await axios.get(`/api/list-tokens?search=${searchText}`);

    setCoinsList(listResult.data);
    fetching.current = false;
  }, [searchText]);

  const getRecentCoins = React.useCallback(async () => {
    const result = await axios.get(
      `/api/get-recent-coins?profile=${profileInfo?.profile.address}`,
    );

    setRecentCoins(result.data);
  }, []);

  const onChangeText = React.useCallback(
    (value: string) => {
      setSearchText(value);
    },
    [profileInfo?.profile.address],
  );

  const handleClickOutside = React.useCallback(
    (event: any) => {
      if (
        divWrapperRef.current &&
        !divWrapperRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    },
    [isOpen],
  );

  React.useEffect(() => {
    if (!fetching.current) {
      getCoinsLists();
    }
  }, [searchText]);

  React.useEffect(() => {
    if (!!profileInfo?.profile.address) {
      getRecentCoins();
    }
  }, [profileInfo?.profile.address]);

  React.useEffect(() => {
    if (!isOpen) {
      animating.current = true;
      setTimeout(() => {
        setDisplayItems(false);
        animating.current = false;
      }, 200);
      return;
    }

    setDisplayItems(true);
  }, [isOpen]);

  React.useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [divWrapperRef]);

  const onTokenSelect = React.useCallback((value: Coin) => {
    onSelect(value);
    setIsOpen(false);
  }, []);

  return (
    <div className="flex flex-col w-full relative">
      <p className="text-sm text-white">{title}</p>

      <div
        className={`custom-select absolute px-[1vmax] ${!isOpen ? "h-[2.2vmax]" : "h-[500px] opened"} z-2 md:top-[25px] top-[16px] md:top-[15px]`}
        ref={divWrapperRef}
      >
        <div
          className="w-full flex justify-between items-center self-center"
          onClick={toggleContainer}
        >
          <div className="flex">
            {selectedItem ? (
              <div className="flex items-center">
                <div className="relative w-[1.5vmax] h-[1.5vmax] rounded-full">
                  <Image
                    src={selectedItem.image}
                    alt={`${selectedItem.symbol} image`}
                    layout="fill"
                    className="rounded-full"
                  />
                </div>
                <p className="text-sm text-white ml-2">{selectedItem.symbol}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-300">{placeholder}</p>
            )}
          </div>

          {isOpen ? <ArrowUp /> : <ArrowDown />}
        </div>
        {displayItems && (
          <div className="custom-select-open grow">
            <div className="w-full h-[1px] bg-[#6E5FB1] px-2 my-2" />
            <p className="text-xs text-white font-bold">Creator Coins</p>

            <div className="my-2 w-[80%]">
              <Search value={searchText} onChange={onChangeText} />
            </div>

            <div className="grid gap-4 grid-cols-auto">
              {recentCoins.map((coin) => (
                <RecentCoin
                  token={coin.token}
                  desc={coin.desc}
                  name={coin.name}
                  symbol={coin.symbol}
                  image={coin.image}
                  onTokenSelect={onTokenSelect}
                  key={coin.token}
                  decimals={coin.decimals}
                />
              ))}
            </div>

            <div className="w-full h-[0.5px] bg-[#6E5FB1] px-2 my-2" />

            {coinsList.map((coin) => {
              return (
                <div className="my-2">
                  <CoinListItem
                    token={coin.token}
                    name={coin.name}
                    desc={coin.desc}
                    symbol={coin.symbol}
                    image={coin.image}
                    onTokenSelect={onTokenSelect}
                    key={coin.token}
                    decimals={coin.decimals}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomCoinSelect;
