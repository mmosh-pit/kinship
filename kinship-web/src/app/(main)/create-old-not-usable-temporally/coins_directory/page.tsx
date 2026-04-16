"use client";

import React from "react";

import CoinsTable from "../../components/CoinDirectory/CoinsTable";
import Price from "../../components/CoinDirectory/Price";
import SearchBar from "../../components/CoinDirectory/SearchBar";
import TVL from "../../components/CoinDirectory/TVL";
import Volume from "../../components/CoinDirectory/Volume";
import useCheckMobileScreen from "@/app/(main)/lib/useCheckMobileScreen";

const Coins = () => {
  const [selectedTab, setSelectedTab] = React.useState("tvl");

  const isMobile = useCheckMobileScreen();

  const renderGraphicComponent = React.useCallback(() => {
    if (selectedTab === "tvl") return <TVL />;

    if (selectedTab === "volume") return <Volume withFilters />;

    return <Price />;
  }, [selectedTab]);

  return (
    <div className="background-content flex flex-col max-h-full pt-20 px-12">
      {!isMobile && (
        <div className="w-full grid md:grid-cols-3 gap-8 grid-cols-auto">
          <TVL />

          <Volume withFilters />

          <Price />
        </div>
      )}

      {isMobile && (
        <div className="w-full flex flex-col">
          <div className="w-full flex flex-col">
            <div className="w-full flex">
              <div
                className="mx-2 cursor-pointer"
                onClick={() => setSelectedTab("tvl")}
              >
                <p
                  className={`${selectedTab === "tvl" ? "text-white font-bold" : "text-[#AEAEB2] font-normal"} text-base`}
                >
                  TVL
                </p>
              </div>

              <div
                className="mx-2 cursor-pointer"
                onClick={() => setSelectedTab("volume")}
              >
                <p
                  className={`${selectedTab === "volume" ? "text-white font-bold" : "text-[#AEAEB2] font-normal"} text-base`}
                >
                  Volume
                </p>
              </div>

              <div
                className="mx-2 cursor-pointer"
                onClick={() => setSelectedTab("price")}
              >
                <p
                  className={`${selectedTab === "price" ? "text-white font-bold" : "text-[#AEAEB2] font-normal"} text-base`}
                >
                  MMOSH Price
                </p>
              </div>
            </div>

            <div className="w-full h-[1px] bg-[#AEAEB260] my-2" />
          </div>

          {renderGraphicComponent()}
        </div>
      )}

      <div className="mt-8">
        <SearchBar />
      </div>

      <div className="w-full mt-8 overflow-x-auto">
        <CoinsTable />
      </div>
    </div>
  );
};

export default Coins;
