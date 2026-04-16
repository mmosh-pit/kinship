"use client";
import React from "react";
import { useAtom } from "jotai";

import Graphics from "../components/Home/Graphics";
import SearchBar from "../components/CoinDirectory/SearchBar";
import CoinsTable from "../components/CoinDirectory/CoinsTable";
import CoinsList from "../components/Home/CoinsList";
import { selectedCoinsMode } from "@/app/(main)/store/home";
import useCheckMobileScreen from "@/app/(main)/lib/useCheckMobileScreen";

const HomePage = () => {
  const [coinsMode] = useAtom(selectedCoinsMode);

  const isMobile = useCheckMobileScreen();

  return (
    <div className="background-content flex flex-col max-h-full pt-20 px-12 w-full relative">
      <Graphics />

      <div className="mt-8">
        <SearchBar />
      </div>

      <div className="w-full mt-8 overflow-x-auto">
        {isMobile ? (
          <CoinsList />
        ) : coinsMode === "card" ? (
          <CoinsList />
        ) : (
          <CoinsTable />
        )}
      </div>
    </div>
  );
};

export default HomePage;
