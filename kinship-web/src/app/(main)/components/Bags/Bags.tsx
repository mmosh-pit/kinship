import currencyFormatter from "@/app/(main)/lib/currencyFormatter";
import { walletAddressShortener } from "@/app/(main)/lib/walletAddressShortener";
import CopyIcon from "@/assets/icons/CopyIcon";
import React from "react";
import NFTs from "./NFTs";
import Coins from "./Coins";
import SearchBar from "../Project/Candidates/SearchBar";
import {
  BagsCoin,
  bagsCoins,
  bagsConfirmation,
  bagsModalAck,
  BagsNFT,
  bagsNotifier,
} from "@/app/(main)/store/bags";
import SwapIcon from "@/assets/icons/SwapIcon";
import { useRouter } from "next/navigation";
import BuyIcon from "@/assets/icons/BuyIcon";
import ReceiveIcon from "@/assets/icons/ReceiveIcon";
import RewardsIcon from "@/assets/icons/RewardsIcon";
import SendWalletIcon from "@/assets/icons/SendWalletIcon";
import client from "@/app/(main)/lib/httpClient";
import VaultIcon from "@/assets/icons/VaultIcon";
import Bots from "./Bots";
import Connections from "./Connections";
import Offers from "./Offers";
import Teams from "./Teams";
import { useAtom } from "jotai";
import Modal from "react-modal";
import CloseIcon from "@/assets/icons/CloseIcon";
import axios from "axios";
import { Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import useWallet from "@/utils/wallet";
const customStyles = {
  content: {
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    marginRight: "-50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "#180E4F",
    minWidth: "300px",
    maxWidth: "500px",
    width: "100%",
  },
};

type Props = {
  onSelectAsset: (asset: BagsNFT) => void;
  onSelectCoin: (asset: BagsCoin) => void;
  totalBalance: number;
};

const Bags = ({ onSelectCoin, onSelectAsset, totalBalance }: Props) => {
  const [showMsg, setShowMsg] = React.useState(false);
  const [msgClass, setMsgClass] = React.useState("");
  const [msgText, setMsgText] = React.useState("");
  const [bagsRequest, setBagsRequest] = useAtom(bagsConfirmation);
  const [search, setSearch] = React.useState("");
  const [selectedTab, setSelectedTab] = React.useState(0);
  const router = useRouter();
  const [isTooltipShown, setIsTooltipShown] = React.useState(false);
  const [address, setAddress] = React.useState("");
  const [modalIsOpen, setIsOpen] = React.useState(false);
  const [_bagsAck, setBagsAck] = useAtom(bagsModalAck);
  const [bagsNotify, setBagsNotify] = useAtom(bagsNotifier);
  const [bags] = useAtom(bagsCoins);
  const [gasBalance, setGasBalance] = React.useState(0);
  const wallet = useWallet();

  

  React.useEffect(() => {
    getMyAddress();
  }, []);

   React.useEffect(() => {
    if(wallet) {
      getGasBalance()
    }
  }, [wallet]);

  React.useEffect(() => {
    if (bagsRequest) {
      setIsOpen(true);
    }
  }, [bagsRequest]);

  React.useEffect(() => {
    if (bagsNotify) {
      createMessage(bagsNotify.message, bagsNotify.type);
      setBagsNotify(null);
    }
  }, [bagsNotify]);

  const getMyAddress = async () => {
    try {
      const result = await client.get("/address");
      setAddress(result.data.data);
    } catch (error) {
      setAddress("");
    }
  };

  const copyToClipboard = React.useCallback(async (text: string) => {
    setIsTooltipShown(true);
    await navigator.clipboard.writeText(text);

    setTimeout(() => {
      setIsTooltipShown(false);
    }, 2000);
  }, []);

  const closeModal = () => {
    setIsOpen(false);
    setBagsRequest(null);
  };

  const createMessage = (message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    if (type == "success-container") {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    } else {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    }
  };

  const getGasBalance = async() => {
    const result = await axios.get(
      "/api/octane/balance?wallet="+wallet?.publicKey.toBase58()
    );
    if(result.data) {
      setGasBalance(result.data.gasBalance);
    }
  }

  return (
    <>
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size mb-5 py-5 px-3.5 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      <div className="w-full min-w-[3vmax] flex flex-col items-center items-center justify-start mt-8">
        <div className="flex items-center justify-center my-8">
          <h6>My Wallet</h6>
        </div>

        <div className="bags-background-card lg:w-[40%] md:w-[60%] w-[85%]">
          <div className="bags-background-card-balance-card" id="balance-card">
            <h6>Balance: {currencyFormatter(totalBalance)}</h6>
            {/* <p>Gas Relayer: {currencyFormatter(gasBalance)}</p> */}
            <div className="flex">
              <p className="text-base text-white">
                {walletAddressShortener(address)}
              </p>
              <button
                className="cursor-pointer ml-2"
                onClick={() => copyToClipboard(address)}
              >
                {isTooltipShown && (
                  <div className="absolute z-10 mb-20 inline-block rounded-xl bg-gray-900 px-3 py-4ont-medium text-white shadow-sm dark:bg-gray-700">
                    Copied!
                  </div>
                )}
                <CopyIcon />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center mt-6">
            <div className="">
              <SearchBar setSearchText={setSearch} />
            </div>
          </div>
          <div className="w-full flex justify-evenly mt-6">
            <div
              className="min-w-[60px] flex flex-col justify-center items-center py-2 bg-[#2E3C4E] cursor-pointer rounded-xl bg-[rgba(114,149,195,0.6)]"
              onClick={() => {
                router.push("/bags");
              }}
            >
              <VaultIcon />

              <p className="text-sm text-white mt-1">Vault</p>
            </div>

            <div
              className="min-w-[60px] flex flex-col justify-center items-center py-2 bg-[#2E3C4E] cursor-pointer rounded-xl hover:bg-[rgba(114,149,195,0.6)]"
              onClick={() => {
                router.push("/swap");
              }}
            >
              <SwapIcon />

              <p className="text-sm text-white mt-1">Swap</p>
            </div>

            <div
              className="min-w-[60px] flex flex-col justify-center items-center py-2 bg-[#2E3C4E] cursor-pointer rounded-xl hover:bg-[rgba(114,149,195,0.6)]"
              onClick={() => {
                router.push("/atm");
              }}
            >
              <BuyIcon />

              <p className="text-sm text-white mt-1">Buy</p>
            </div>

            <div
              className="min-w-[60px] flex flex-col justify-center items-center py-2 bg-[#2E3C4E] cursor-pointer rounded-xl hover:bg-[rgba(114,149,195,0.6)]"
              onClick={() => {
                if (bags) {
                  
                  onSelectCoin(bags.network!);
                }
              }}
            >
              <SendWalletIcon />
                <p className="text-sm text-white mt-1">Send</p>
            </div>
            {/* <div
              className="min-w-[60px] flex flex-col justify-center items-center py-2 bg-[#2E3C4E] cursor-pointer rounded-xl hover:bg-[rgba(114,149,195,0.6)]"
              onClick={() => {
                if (bags) {
                  let bagCoin = bags.stable!
                  bagCoin.topup = true;
                  onSelectCoin(bags.stable!)
                }
              }}
            >
              <SendWalletIcon />

              <p className="text-sm text-white mt-1">Top Up</p>
            </div> */}

            <div
              className="min-w-[60px] flex flex-col justify-center items-center py-2 bg-[#2E3C4E] cursor-pointer rounded-xl hover:bg-[rgba(114,149,195,0.6)]"
              onClick={() => {
                // router.push("/atm");
              }}
            >
              <ReceiveIcon />

              <p className="text-sm text-white mt-1">Receive</p>
            </div>

            <div
              className="min-w-[60px] flex flex-col justify-center items-center py-2 bg-[#2E3C4E] cursor-pointer rounded-xl hover:bg-[rgba(114,149,195,0.6)]"
              onClick={() => {
                router.push("/rewards");
              }}
            >
              <RewardsIcon />

              <p className="text-sm text-white mt-1">Rewards</p>
            </div>
          </div>

          <div className="bags-background-card-tabs" id="tabs">
            <button
              className="cursor-pointer"
              onClick={() => setSelectedTab(0)}
            >
              <p
                className={`text-base text-white ${selectedTab === 0 && "font-bold"}`}
              >
                Coins
              </p>
            </button>

            <button
              className="cursor-pointer"
              onClick={() => setSelectedTab(1)}
            >
              <p
                className={`text-base text-white ${selectedTab === 1 && "font-bold"}`}
              >
                Bots
              </p>
            </button>

            <button
              className="cursor-pointer"
              onClick={() => setSelectedTab(2)}
            >
              <p
                className={`text-base text-white ${selectedTab === 2 && "font-bold"}`}
              >
                Connections
              </p>
            </button>

            <button
              className="cursor-pointer"
              onClick={() => setSelectedTab(3)}
            >
              <p
                className={`text-base text-white ${selectedTab === 3 && "font-bold"}`}
              >
                Offers
              </p>
            </button>

            <button
              className="cursor-pointer"
              onClick={() => setSelectedTab(4)}
            >
              <p
                className={`text-base text-white ${selectedTab === 4 && "font-bold"}`}
              >
                Teams
              </p>
            </button>

            <button
              className="cursor-pointer"
              onClick={() => setSelectedTab(5)}
            >
              <p
                className={`text-base text-white ${selectedTab === 5 && "font-bold"}`}
              >
                Badges
              </p>
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto overflow-x-hidden">
            {selectedTab === 0 && <Coins onSelectCoin={onSelectCoin} />}
            {selectedTab === 1 && <Bots address={address} />}
            {selectedTab === 2 && <Connections address={address} />}
            {selectedTab === 3 && <Offers address={address} />}
            {selectedTab === 4 && <Teams address={address} />}
          </div>
        </div>
      </div>
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        style={customStyles}
      >
        <div className="flex justify-end">
          <button
            className="flex justify-end w-[10%]"
            onClick={() => setIsOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mt-5">
          This will remove{" "}
          <span className="capitalize font-bold">
            {bagsRequest?.module == "burn"
              ? "connections"
              : bagsRequest?.module}
          </span>{" "}
          from the blockchain forever and cannot be undone. You won't enjoy it
          benefit anymore. Are you sure you want to burn it?
        </p>

        <div className="flex justify-center">
          <button
            className="btn btn-primary bg-[#6607FF] text-white border-none hover:bg-primary hover:text-white mr-3"
            onClick={() => {
              setBagsAck({
                module: bagsRequest!.module,
                data: bagsRequest!.data,
                status: "reject",
              });
              setIsOpen(false);
            }}
          >
            Yes
          </button>
          <button
            className="btn btn-primary bg-[#6607FF] text-white border-none hover:bg-primary hover:text-white"
            onClick={closeModal}
          >
            No
          </button>
        </div>
      </Modal>
    </>
  );
};

export default Bags;
