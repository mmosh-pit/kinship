"use client";

import React, { useState } from "react";
import Minting from "./Minting";
import { PreSale } from "./PreSale";
import Launch from "./Launch";

export default function AgentCoin({ onPageChange, symbol, createMessage }: { onPageChange: any, symbol: any, createMessage: any }) {
  const [tabIndex, setTabIndex] = React.useState<string>("minting");
  const onMenuChange = (nextStep:any) => {
        setTabIndex(nextStep);
  }
  return (
    <main className="relative py-5 px-5 xl:px-32 lg:px-16 md:px-8 text-white bg-transparent">
      {/* Tabs */}
      <div className="flex justify-center mb-5">
        <div className="flex h-[44px] rounded-[8px] border border-white/10 overflow-hidden pr-10">
          {["minting", "presale", "launch"].map((tab, index) => (
            <button
              key={index}
              onClick={() => setTabIndex(tab)}
              className={`flex-1 text-sm font-bold leading-6 transition capitalize pl-10 ${tabIndex === tab ? "text-white" : "text-white/70"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      {tabIndex === "minting" && <Minting onMenuChange={onMenuChange} createMessage={createMessage} />}
      {tabIndex === "presale" && <PreSale onMenuChange={onMenuChange} createMessage={createMessage} />}
      {tabIndex === "launch" && <Launch onMenuChange={onMenuChange} symbol={symbol} createMessage={createMessage} />}
    </main>
  );
}
