import React from "react";
import currencyFormatter from "@/app/(main)/lib/currencyFormatter";
import { walletAddressShortener } from "@/app/(main)/lib/walletAddressShortener";
import { BagsCoin, BagsNFT } from "@/app/(main)/store/bags";
import ArrowBack from "@/assets/icons/ArrowBack";
import useWallet from "@/utils/wallet";
import CopyIcon from "@/assets/icons/CopyIcon";
import SendIcon from "@/assets/icons/SendIcon";
import { NATIVE_MINT } from "forge-spl-token";

type Props = {
  selectedCoin: BagsCoin | BagsNFT;
  setSelectedAsset: (coin: BagsCoin | BagsNFT | null) => void;
  onSend: () => void;
  totalBalance: number;
};

const SelectedCoin = ({
  selectedCoin,
  setSelectedAsset,
  totalBalance,
  onSend,
}: Props) => {
  const [isTooltipShown, setIsTooltipShown] = React.useState(false);

  const wallet = useWallet();

  const copyToClipboard = React.useCallback(async (text: string) => {
    setIsTooltipShown(true);
    await navigator.clipboard.writeText(text);

    setTimeout(() => {
      setIsTooltipShown(false);
    }, 2000);
  }, []);

  return (
    <div className="w-full h-screen flex flex-col items-center justify-start mt-8">
      <div className="bags-background-card lg:w-[40%] md:w-[60%] w-[85%]">
        <div className="flex w-full justify-between px-8 py-4">
          <button
            className="cursor-pointer w-[33%]"
            onClick={() => setSelectedAsset(null)}
          >
            <ArrowBack />
          </button>

          <h6>{selectedCoin!.name}</h6>

          <div className="w-[33%]" />
        </div>

        <div className="bags-background-card-balance-card" id="balance-card">
          <h6>{currencyFormatter(totalBalance)}</h6>
          {selectedCoin.tokenAddress != NATIVE_MINT.toBase58() &&
             <h6>{selectedCoin.symbol.toUpperCase()} {selectedCoin.balance}</h6>
          }
          <div className="flex">
            <p className="text-base text-white">
              {walletAddressShortener(wallet?.publicKey?.toString() ?? "")}
            </p>
            <button
              className="cursor-pointer ml-2"
              onClick={() =>
                copyToClipboard(wallet?.publicKey.toString() ?? "")
              }
            >
              {isTooltipShown && (
                <div className="absolute z-10 mb-20 inline-block rounded-lg bg-gray-900 px-3 py-4ont-medium text-white shadow-sm dark:bg-gray-700">
                  Copied!
                </div>
              )}
              <CopyIcon />
            </button>
          </div>
        </div>

        <div className="self-center flex mt-8">
          <div
            className="flex flex-col justify-center items-center p-4 bg-[#2E3C4E99] rounded-lg cursor-pointer"
            onClick={onSend}
          >
            <SendIcon />
            <p className="text-sm text-white">Send</p>
          </div>

          <div className="flex items-center p-4 bg-[#2E3C4E99] ml-4 rounded-lg">
            <a
              className="text-sm text-white underline"
              href={`https://solscan.io/account/${selectedCoin.tokenAddress}?cluster=mainnet`}
              target="_blank"
            >
              View on Solscan
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectedCoin;
