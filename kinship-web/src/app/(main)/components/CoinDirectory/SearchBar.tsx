import React from "react";
import { useAtom } from "jotai";

import SearchIcon from "@/assets/icons/SearchIcon";
import useCheckMobileScreen from "@/app/(main)/lib/useCheckMobileScreen";
import { coinTextSearch, pair, selectedVolume } from "@/app/(main)/store/coins";
import HomeMenuIcon from "@/assets/icons/HomeMenu";
import { selectedCoinsMode } from "@/app/(main)/store/home";
import HamburgerIcon from "@/assets/icons/HamburgerIcon";

const volumeOptions = [
  {
    label: "1H Volume",
    value: "1h",
  },
  {
    label: "1D Volume",
    value: "1d",
  },
  {
    label: "1W Volume",
    value: "1w",
  },
  {
    label: "1M Volume",
    value: "1m",
  },
  {
    label: "1Y Volume",
    value: "1y",
  },
];

const tradingPairOptions = ["All", "MMOSH", "PTVB", "PTVR"];

const SearchBar = () => {
  const isMobile = useCheckMobileScreen();
  const [localText, setLocalText] = React.useState("");

  const [_, setSearchText] = useAtom(coinTextSearch);
  // const [isUSDCSelected, setIsUSDCSelected] = useAtom(selectedUSDCCoin);
  const [volume, setVolume] = useAtom(selectedVolume);
  const [tradingPair, setTradingPair] = useAtom(pair);
  const [coinsMode, setCoinsMode] = useAtom(selectedCoinsMode);

  const executeSearch = () => {
    setSearchText(localText);
  };

  return (
    <div className="w-full flex flex-col items-center px-8">
      {isMobile && (
        <div className="w-[75%] flex md:items-center bg-[#010623] bg-opacity-[0.15] border-[1px] border-[#C2C2C229] rounded-full p-1 backdrop-filter backdrop-blur-[10px]">
          <button
            className="flex bg-[#5A00FF] rounded-full px-6 py-4 items-center"
            onClick={executeSearch}
          >
            <SearchIcon width={24} height={24} />

            <p className="text-white font-bold text-base ml-2.5 md:block hidden">
              Search
            </p>
          </button>

          <input
            placeholder="Type your search terms"
            className="ml-4 w-full bg-transparent outline-none"
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onKeyUp={(e) => {
              if (e.key === "Enter") {
                executeSearch();
              }
            }}
          />
        </div>
      )}
      <div className="w-full flex justify-between">
        {!isMobile && <div className="w-[33%]" />}

        {!isMobile && (
          <div className="w-[50%] md:w-[20%] flex md:items-center bg-[#010623] bg-opacity-[0.15] border-[1px] border-[#C2C2C229] rounded-full p-1 backdrop-filter backdrop-blur-[10px]">
            <button
              className="flex bg-[#5A00FF] rounded-full px-6 py-4 items-center"
              onClick={executeSearch}
            >
              <SearchIcon width={24} height={24} />

              <p className="text-white font-bold text-base ml-2.5 md:block hidden">
                Search
              </p>
            </button>

            <input
              placeholder="Type your search terms"
              className="ml-4 w-full bg-transparent outline-none"
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              onKeyUp={(e) => {
                if (e.key === "Enter") {
                  executeSearch();
                }
              }}
            />
          </div>
        )}

        <div className="w-full md:w-[33%] flex items-center justify-end">
          {/*<div className="flex items-center mr-8">
            <p className="text-sm">MMOSH</p>
            <input
              type="checkbox"
              className="toggle [--tglbg:#1A1750] hover:bg-[#EF01A4] bg-[#EF01A4] mx-4"
              checked={isUSDCSelected}
              onChange={(e) => setIsUSDCSelected(e.target.checked)}
            />
            <p className="text-sm">USDC</p>
          </div>*/}

          <div className="dropdown rounded-lg py-1 mr-8">
            <div tabIndex={0} role="button" className="btn m-1">
              <p className="text-base text-white">
                Trading Pair • {tradingPair}
              </p>
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
            >
              {tradingPairOptions.map((value) => (
                <li onClick={() => setTradingPair(value)}>
                  <p className="text-base text-white">{value}</p>
                </li>
              ))}
            </ul>
          </div>
          {!isMobile && (
            <button
              onClick={() => {
                setCoinsMode(coinsMode === "list" ? "card" : "list");
              }}
              className="mr-8"
            >
              {coinsMode === "list" ? <HomeMenuIcon /> : <HamburgerIcon />}
            </button>
          )}

          <div className="dropdown rounded-lg py-1">
            <div tabIndex={0} role="button" className="btn m-1">
              <p className="text-base text-white">{volume.label}</p>
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
            >
              {volumeOptions.map((value) => (
                <li onClick={() => setVolume(value)}>
                  <p className="text-base text-white">{value.label}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
