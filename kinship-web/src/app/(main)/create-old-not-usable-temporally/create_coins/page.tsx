"use client";
import React from "react";
import axios from "axios";
import { useAtom } from "jotai";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

import ImagePicker from "../../components/ImagePicker";
import MessageBanner from "../../components/common/MessageBanner";
import Input from "../../components/common/Input";
import Select from "../../components/common/Select";
import Button from "../../components/common/Button";
import SimpleInput from "../../components/common/SimpleInput";
import BalanceBox from "../../components/common/BalanceBox";
import { getCoinPrice } from "@/app/(main)/lib/forge/setupCoinPrice";
import { createCoin } from "@/app/(main)/lib/forge/createCoin";
import { data, isDrawerOpen, userWeb3Info } from "@/app/(main)/store";
import ArrowDown from "@/assets/icons/ArrowDown";
import Modal from "react-modal";
import SearchIcon from "@/assets/icons/SearchIcon";
import TokenCard from "../../components/Project/TokenCard";
import { Bars } from "react-loader-spinner";
import * as anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import useWallet from "@/utils/wallet";
import useConnection from "@/utils/connection";

/* TEMPORAL CONSOLE FIX, HIDING A CONSOLE ERROR TRIGGERED BY RECHARTS */
/* THE LIBRARY STILL WORKS WELL, SO IT IS NOT A BREAKING ERROR. RECHART DEV TEAM IS WORKING ON IT */
const error = console.error;
console.error = (...args: any) => {
  if (/defaultProps/.test(args[0])) return;
  error(...args);
};

const bondingSelectOptions = [
  {
    label: "Exponential",
    value: "exponential",
  },
  {
    label: "Linear",
    value: "linear",
  },
];

const defaultFormState = {
  name: "",
  symbol: "",
  description: "",
  bonding: "exponential",
  multiplier: 1,
  initialPrice: 1,
  supply: 1000,
};

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

const CreateCoin = () => {
  const wallet = useWallet();
  const connection = useConnection();
  const [profileInfo] = useAtom(userWeb3Info);
  const [currentUser] = useAtom(data);
  const [isDrawerShown] = useAtom(isDrawerOpen);

  const [isLoading, setIsLoading] = React.useState(false);
  const [message, setMessage] = React.useState({
    message: "",
    type: "",
  });
  const [form, setForm] = React.useState({ ...defaultFormState });
  const [image, setImage] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState("");

  const [datasets, setDatasets] = React.useState<{ data: number }[]>([]);
  const [coinPrice, setCoinPrice] = React.useState(0);
  const [mintingStatus, setMintingStatus] = React.useState("Mint and Swap");

  const [error, setError] = React.useState<string | null>(null);

  const [modalIsOpen, setIsOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const [coinLoader, setCoinLoader] = React.useState(false);
  const [coinAllList, setCoinAllList] = React.useState<any>([]);
  const [coinList, setCoinList] = React.useState<any>([]);
  const [selectedCommunityCoin, setSelectedCommunityCoin] = React.useState<any>(
    {
      address: process.env.NEXT_PUBLIC_OPOS_TOKEN,
      name: "MMOSH: The Stoked Token",
      symbol: "MMOSH",
      logoURI:
        "https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/MMoshCoin.png",
      decimals: 9,
    },
  );

  const [selectedCommunityBalance, setSelectedCommunityBalance] =
    React.useState(0);

  const [modalMaxHeight, setModalMaxHeight] = React.useState<number | null>(
    null,
  );

  React.useEffect(() => {
    setModalMaxHeight(window.innerHeight * 0.7);
  }, []);

  const tickXFormat = React.useCallback(
    (value: number) => {
      if (value === datasets.length - 1) return "Supply = x";

      return "";
    },
    [datasets],
  );

  const validateFields = () => {
    if (profileInfo!.solBalance <= 0) {
      setMessage({
        type: "warn",
        message:
          "Hey! We checked your wallet and you don’t have enough SOL for the gas fees. Get some Solana and try again!",
      });
      return false;
    }

    if (selectedCommunityCoin.address === web3Consts.oposToken.toBase58()) {
      if (profileInfo!.mmoshBalance < form.supply) {
        setMessage({
          type: "warn",
          message:
            "Hey! We checked your wallet and you don’t have enough MMOSH to mint. [Get some MMOSH here](https://jup.ag/swap/SOL-MMOSH)",
        });
        return false;
      }
    } else {
      if (selectedCommunityBalance < form.supply) {
        setMessage({
          type: "warn",
          message:
            "Hey! We checked your wallet and you don’t have enough Community coin to mint",
        });
        return false;
      }
    }

    if (!form.name) {
      setMessage({
        type: "error",
        message: "Coin name is required!",
      });
      return false;
    }

    if (!form.symbol) {
      setMessage({
        type: "error",
        message: "Coin symbol is required!",
      });
      return false;
    }

    if (form.supply < 1000) {
      setMessage({
        type: "error",
        message: "Minimum required is 1000 $MMOSH for the Coin Supply",
      });
      return false;
    }

    return true;
  };

  const startCreatingCoin = async () => {
    if (!validateFields()) return;

    setMessage({ type: "", message: "" });

    const multiplier = form.bonding === "linear" ? 0 : form.multiplier;
    const initialPrice = form.bonding === "linear" ? form.initialPrice : 0;

    setIsLoading(true);

    const params = {
      type: form.bonding,
      multiplier,
      supply: coinPrice,
      name: form.name,
      description: form.description,
      symbol: form.symbol,
      initialPrice,
      preview,
      imageFile: image,
      wallet: wallet!,
      setMintingStatus,
      username: currentUser ? currentUser!.profile.username : "",
      baseToken: selectedCommunityCoin,
      connection: connection,
    };

    const res = await createCoin(params);
    setIsLoading(false);
    setMessage({ type: res.type, message: res.message });
    setMintingStatus("Mint and Swap");

    if (res.type === "success") {
      setForm({ ...defaultFormState });
      setImage(null);
      setPreview("");
    }
  };

  const checkSymbolExists = React.useCallback(async () => {
    setError(null);
    const result = await axios.get(
      `/api/check-token-symbol?symbol=${form.symbol}`,
    );

    if (result.data) {
      setError(
        "Symbol already exist. please choose different symbol and try again",
      );
    }
  }, [form.symbol]);

  const getCommunityCoins = async () => {
    try {
      setCoinLoader(true);
      let newCommunityCoins = [];
      let mmosh = process.env.NEXT_PUBLIC_OPOS_TOKEN;
      newCommunityCoins.push({
        address: process.env.NEXT_PUBLIC_OPOS_TOKEN,
        name: "MMOSH: The Stoked Token",
        symbol: "MMOSH",
        logoURI:
          "https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/MMoshCoin.png",
        decimals: 9,
      });
      const result: any = await axios.get("/api/project/list-coins");
      if (result.data) {
        let newCoinList = result.data.filter((item: any) => item.key !== mmosh);
        let finalList = newCoinList.reduce((unique: any, o: any) => {
          if (!unique.some((obj: any) => obj.key === o.key)) {
            unique.push(o);
          }
          return unique;
        }, []);

        for (let index = 0; index < finalList.length; index++) {
          const element = finalList[index];
          newCommunityCoins.push({
            address: element.key,
            name: element.name,
            symbol: element.symbol,
            logoURI: element.image,
            decimals: element.decimals,
          });
        }
      }
      setCoinAllList(newCommunityCoins);
      setCoinList(newCommunityCoins);
      setCoinLoader(false);
    } catch (error) {
      setCoinLoader(false);
      setCoinList([]);
      setCoinAllList([]);
    }
  };

  React.useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
  }, [image]);

  React.useEffect(() => {
    const isLinear = form.bonding === "linear";
    const isExponential = form.bonding === "exponential";

    if (
      form.supply <= 0 ||
      (isLinear && form.initialPrice === 0) ||
      (isExponential && form.multiplier === 0)
    ) {
      setDatasets([]);
      return;
    }

    const multiplier = isLinear ? 0 : form.multiplier;

    const initialPrice = isLinear ? form.initialPrice : 0;

    const res = getCoinPrice(
      form.supply,
      initialPrice.toString(),
      form.bonding,
      multiplier,
    );

    const datasetsValue = res.data.map((value) => ({
      data: value,
    }));

    const datasetsResult = isLinear
      ? [{ data: 0 }, ...datasetsValue]
      : datasetsValue;

    setDatasets(datasetsResult);
    setCoinPrice(res.coinPrice);
  }, [form.multiplier, form.initialPrice, form.supply, form.bonding]);

  React.useEffect(() => {
    if (wallet) {
      getTokenBalance();
    }
  }, [selectedCommunityCoin, wallet]);

  const openCommunityCoins = () => {
    setIsOpen(true);
    getCommunityCoins();
  };

  const closeModal = () => {
    setIsOpen(false);
    setKeyword("");
    setCoinList([]);
    setCoinAllList([]);
  };

  const onCoinSearch = (event: any) => {
    setKeyword(event.target.value);
    console.log(event.target.value);
    if (event.target.value.trim().length == 0) {
      setCoinList(coinAllList);
    } else {
      let newCoinList = coinAllList.filter(
        (item: any) =>
          item.name
            .toLowerCase()
            .includes(event.target.value.trim().toLowerCase()) ||
          item.symbol
            .toLowerCase()
            .includes(event.target.value.trim().toLowerCase()) ||
          item.symbol
            .toLowerCase()
            .includes(event.target.value.trim().toLowerCase()),
      );
      setCoinList(newCoinList);
    }
  };

  const onTokenSelect = (token: any) => {
    setSelectedCommunityCoin(token);
    closeModal();
  };

  const getTokenBalance = async () => {
    // if (selectedCommunityCoin.address === web3Consts.oposToken.toBase58()) {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
      confirmTransactionInitialTimeout: 120000,
    });
    const env = new anchor.AnchorProvider(connection, wallet!, {
      preflightCommitment: "processed",
    });
    let userConn: UserConn = new UserConn(env, web3Consts.programID);

    const balance = await userConn.getUserBalance({
      address: wallet?.publicKey,
      token: selectedCommunityCoin.address,
      decimals: selectedCommunityCoin.decimals,
    });
    setSelectedCommunityBalance(balance ? balance : 0);
    // } else {
    //   let type = "Red";
    //   if (
    //     selectedCommunityCoin.address === process.env.NEXT_PUBLIC_PTVB_TOKEN
    //   ) {
    //     type = "Blue";
    //   }
    //   let coinData = await axios(
    //     "/api/ptv/rewards?type=" +
    //       type +
    //       "&&wallet=" +
    //       wallet?.publicKey.toBase58(),
    //   );
    //   setSelectedCommunityBalance(
    //     coinData.data ? coinData.data.claimable + coinData.data.unstakable : 0,
    //   );
    // }
  };

  return (
    <>
      <div
        className={`w-full relative flex flex-col items-center ${isDrawerShown ? "z-[-1]" : ""}`}
      >
        <MessageBanner message={message.message} type={message.type} />
        <div className="w-full flex flex-col justify-center items-center mt-20">
          <h4 className="text-center text-white font-goudy font-normal">
            Create a Political Memecoin!
          </h4>
        </div>

        <div className="flex md:flex-row flex-col justify-center w-[90%] sm:w-[80%] md:w-[75%] lg:w-[60%] mt-12">
          <div className="w-[100%] sm:w-[85%] lg:w-[50%]">
            <ImagePicker changeImage={setImage} image={preview} />
          </div>

          <div className="w-full flex flex-col md:ml-8">
            <Input
              title="Name your coin"
              required
              value={form.name}
              placeholder="Name"
              helperText="Up to 32 characters, can have spaces."
              type="text"
              onChange={(e) => {
                const value = e.target.value;

                if (value.length > 32) return;

                setForm({ ...form, name: value });
              }}
            />

            <div className="my-2">
              <Input
                title="Symbol"
                required
                value={form.symbol}
                placeholder="Name"
                helperText={error || "Up to 10 characters"}
                error={!!error}
                onBlur={checkSymbolExists}
                type="text"
                onChange={(e) => {
                  const value = e.target.value.replace(/\s/g, "");

                  if (value.length > 10) return;

                  setForm({ ...form, symbol: value });
                }}
              />
            </div>

            <Input
              title="Description"
              required={false}
              value={form.description}
              placeholder="Description"
              type="text"
              textarea
              onChange={(e) => {
                setForm({ ...form, description: e.target.value });
              }}
            />
          </div>

          <div className="w-full flex flex-col md:ml-8">
            <div className="flex flex-col">
              <p className="text-xs text-white">
                Choose a Bonding Curve for your Coin
              </p>
              <Select
                value={form.bonding}
                onChange={(e) => {
                  setForm({ ...form, bonding: e.target.value });
                }}
                options={bondingSelectOptions}
              />
            </div>

            {form.bonding === "linear" ? (
              <div className="lg:mt-8 md:mt-4 sm:mt-2">
                <Input
                  title="Enter MMOSH Price"
                  value={form.initialPrice.toString()}
                  onChange={(e) => {
                    const value = Number(e.target.value);

                    if (Number.isNaN(value)) return;

                    if (value < 0) return;

                    if (value > 9000) return;

                    setForm({
                      ...form,
                      initialPrice: value,
                    });
                  }}
                  type="text"
                  required={false}
                  placeholder="0"
                />
              </div>
            ) : (
              <div className="flex flex-col lg:mt-8 md:mt-4 sm:mt-2">
                <p className="text-white text-tiny">
                  Adjust the slope for your Bonding Curve by changing the
                  multiplier
                </p>
                <div className="max-w-[50%]">
                  <Input
                    title=""
                    value={form.multiplier.toString()}
                    onChange={(e) => {
                      const value = Number(e.target.value);

                      if (Number.isNaN(value)) return;

                      if (value < 0) return;

                      if (value >= 3 && form.supply > 15850) return;

                      if (value >= 4 && form.supply > 1450) return;

                      setForm({ ...form, multiplier: value });
                    }}
                    type="text"
                    required={false}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            <div className="w-full h-full mt-4">
              <ResponsiveContainer width="85%" height={200} className="pt-2">
                <AreaChart
                  width={150}
                  height={200}
                  data={datasets}
                  margin={{
                    top: 30,
                  }}
                >
                  <defs>
                    <linearGradient id="gradient" x1="1" y1="1" x2="2" y2="2">
                      <stop
                        offset="100%"
                        stopColor="#0765FF"
                        stopOpacity={0.6}
                      />
                      <stop offset="30%" stopColor="#09073A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis tickFormatter={tickXFormat} tickLine={false} />
                  <YAxis
                    width={5}
                    tick={false}
                    tickLine={false}
                    label={{
                      value: "Price = Y",
                      position: "top",
                      offset: 5,
                      dx: 30,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="data"
                    stroke="#0047FF"
                    fill="url(#gradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="w-full flex flex-col justify-around items-center mt-12">
          <div className="flex flex-col mb-1">
            <Button
              title={mintingStatus}
              size="large"
              action={startCreatingCoin}
              isLoading={false}
              isPrimary
              disabled={
                isLoading ||
                form.supply < 1000 ||
                !form.name ||
                !form.symbol ||
                !!error ||
                !wallet
              }
            />

            <p className="text-xs text-gray-300">
              Minimum 1,000 initial purchase
            </p>
          </div>

          <div className="flex items-center mt-4 mb-2">
            <p className="text-xs text-white">Exchange</p>
            <div className="mx-2 max-w-[5vmax]">
              <SimpleInput
                value={form.supply.toString()}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  if (Number.isNaN(value)) return;

                  if (value < 0) return;

                  if (form.multiplier >= 3 && value > 15850) return;

                  if (form.multiplier >= 4 && value > 1450) return;

                  setForm({ ...form, supply: value });
                }}
              />
            </div>

            <div className="form-element mr-2.5">
              <p
                className="input input-bordered h-[2vmax] text-base bg-black bg-opacity-[0.07] backdrop-container flex items-center justify-between gap-2 px-2 cursor-pointer"
                onClick={openCommunityCoins}
              >
                <span>{selectedCommunityCoin.symbol}</span>
                {selectedCommunityCoin.name === "" && (
                  <span className="text-white text-opacity-[0.3]">
                    {" "}
                    Select Coin
                  </span>
                )}
                <label className="mr-2.5">
                  <ArrowDown />
                </label>
              </p>
            </div>

            <p className="text-xs text-gray-300">
              for <span className="text-xs text-gray-500">{form.supply}</span>
              {form.symbol !== "" ? "$" + form.symbol : ""}
            </p>
          </div>

          <p className="text-xs text-gray-300 text-center max-w-[80%]">
            Enter the amount of your initial Swap. You will swap{" "}
            <span className="font-bold text-white">{form.supply}</span>{" "}
            {selectedCommunityCoin.symbol} for{" "}
            <span className="font-bold text-white">{form.supply}</span>{" "}
            {form.symbol} and you will be charged a small amount of SOL in
            transaction fees.
          </p>

          <div className="mt-2">
            <div className="flex flex-col">
              <div className="flex items-center">
                <p className="text-sm text-white">Current balance</p>
                <div className="bg-black bg-opacity-[0.2] px-1 py-2 min-w-[3vmax] mx-2 rounded-md">
                  {selectedCommunityBalance || 0}
                </div>
                <p className="text-sm text-white">
                  {selectedCommunityCoin.symbol}
                </p>
              </div>

              <div className="flex items-center mt-2">
                <p className="text-sm text-white">Current balance</p>
                <div className="bg-black bg-opacity-[0.2] px-1 py-2 min-w-[3vmax] mx-2 rounded-md">
                  {profileInfo?.solBalance || 0}
                </div>
                <p className="text-sm text-white">SOL</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        style={customStyles}
      >
        <h2 className="pb-2.5 mb-2.5 text-sub-title-font-size font-goudy border-b border-white border-opacity-20">
          Coin List{" "}
        </h2>
        <div>
          {!coinLoader && (
            <>
              <div className="search-container">
                <label
                  className={
                    "h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2"
                  }
                >
                  <div className="p-2">
                    <SearchIcon />
                  </div>
                  <input
                    type="text"
                    className="grow text-base bg-transparent focus:outline-0 outline-0 hover:outline-0 active:outline-0"
                    placeholder="Search by Coin Name"
                    value={keyword}
                    onChange={onCoinSearch}
                  />
                </label>
              </div>
              <div
                className="overflow-y-auto"
                style={{
                  maxHeight: modalMaxHeight ? `${modalMaxHeight}px` : "70vh",
                }}
              >
                {coinList.map((coinItem: any) => (
                  <TokenCard data={coinItem} onChoose={onTokenSelect} />
                ))}
              </div>
            </>
          )}

          {coinLoader && (
            <div className="flex justify-center">
              <Bars
                height="80"
                width="80"
                color="rgba(255, 0, 199, 1)"
                ariaLabel="bars-loading"
                wrapperStyle={{}}
                wrapperClass="bars-loading"
                visible={true}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default CreateCoin;
