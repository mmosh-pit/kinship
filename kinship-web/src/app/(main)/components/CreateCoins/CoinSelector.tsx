import React from "react";
import Image from "next/image";

import { Coin } from "@/app/(main)/models/coin";
import CloseIcon from "@/assets/icons/CloseIcon";
import CoinListItem from "../common/CoinListItem";
import OpenInNew from "@/assets/icons/OpenInNew";
import { walletAddressShortener } from "@/app/(main)/lib/walletAddressShortener";
import useWallet from "@/utils/wallet";

type Props = {
  selectedCoin: Coin;
  onTokenSelect: (coin: Coin) => void;
};

const CoinSelector = ({ selectedCoin, onTokenSelect }: Props) => {
  const wallet = useWallet();

  const coinsList = [
    {
      name: "MMOSH: The Stoked Token",
      desc: "",
      image:
        "https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/MMoshCoin.png",
      token: process.env.NEXT_PUBLIC_OPOS_TOKEN!,
      symbol: "MMOSH",
      bonding: "",
      creatorUsername: "",
      decimals: 9
    },
    {
      name: "Pump the Vote Blue",
      desc: "",
      image:
        "https://shdw-drive.genesysgo.net/Ejpot7jAYngByq5EgjvgEMgqJjD8dnjN4kSkiz6QJMsH/PTVB.png",
      token: process.env.NEXT_PUBLIC_PTVB_TOKEN!,
      symbol: "PTVB",
      bonding: "",
      creatorUsername: "",
      decimals: 9
    },

    {
      name: "Pump the Vote Red",
      desc: "",
      image:
        "https://shdw-drive.genesysgo.net/Ejpot7jAYngByq5EgjvgEMgqJjD8dnjN4kSkiz6QJMsH/PTVR.png",
      token: process.env.NEXT_PUBLIC_PTVR_TOKEN!,
      symbol: "PTVR",
      bonding: "",
      creatorUsername: "",
      decimals: 9
    },
  ];

  const handleTokenSelect = React.useCallback(
    (token: Coin) => {
      onTokenSelect(token);
      (document.getElementById("coin_modal") as any)?.close();
    },
    [wallet],
  );

  const openLink = () => {
    window.open(
      "https://solscan.io/account/" + selectedCoin.token + "?cluster=mainnet",
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="flex flex-col">
      <p className="text-xs text-white">
        Select a Community Coin or the Native Token to pair with your Memecoin
        on the bonding curve.
      </p>
      <div
        className="w-full flex items-center min-w-[2.5vmax] min-h-[2vmax] bg-[#9D9D9D12] cursor-pointer border-[1px] border-[#FFFFFF30] rounded-lg px-2 mx-1"
        onClick={() => {
          return (document.getElementById("coin_modal") as any)?.showModal();
        }}
      >
        <div className="flex items-center">
          <div className="relative w-[2vmax] h-[2vmax] mt-2 mr-1">
            <Image
              src={selectedCoin.image}
              alt="coin"
              layout="fill"
              className="rounded-full"
            />
          </div>
          <div className="flex flex-col">
            <p className="text-sm text-white">{selectedCoin.symbol}</p>
            <p className="text-tiny">{selectedCoin.name}</p>
          </div>

          <div
            className="flex self-start mb-4 rounded-md px-1 bg-[#030139]"
            onClick={openLink}
          >
            <p className="text-tiny">
              {walletAddressShortener(selectedCoin.token)}
            </p>
            <OpenInNew />
          </div>
        </div>
      </div>
      <dialog id="coin_modal" className="modal">
        <div className="flex flex-col modal-box w-[40%] bg-[#02001A] p-8">
          <div className="custom-select-open grow">
            <div className="flex w-full justify-between mb-2">
              <p className="text-large text-white font-bold ml-4">Memecoins</p>

              <button
                className="cursor-pointer"
                onClick={() =>
                  (document.getElementById("coin_modal") as any)?.close()
                }
              >
                <CloseIcon />
              </button>
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
                    onTokenSelect={handleTokenSelect}
                    key={coin.token}
                    decimals={coin.decimals}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </dialog>
    </div>
  );
};

export default CoinSelector;
