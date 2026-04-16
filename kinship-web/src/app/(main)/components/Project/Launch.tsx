"use client";
import baseCoins from "@/app/(main)/lib/baseCoins";
import { walletAddressShortener } from "@/app/(main)/lib/walletAddressShortener";
import { Coin, CoinDetail } from "@/app/(main)/models/coin";
import OpenInNew from "@/assets/icons/OpenInNew";
import axios from "axios";
import React, { useEffect, useState } from "react";
import Select from "../common/Select";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import SimpleInput from "../common/SimpleInput";
import Modal from "react-modal";
import SearchIcon from "@/assets/icons/SearchIcon";
import TokenCard from "./TokenCard";
import { Bars } from "react-loader-spinner";
import Input from "../common/Input";
import Calender from "@/assets/icons/Calender";
import TimeIcon from "@/assets/icons/TimeIcon";
import { calculatePrice, getCoinPrice } from "@/app/(main)/lib/forge/setupCoinPrice";
import useWallet from "@/utils/wallet";
import { useAtom } from "jotai";
import { data } from "@/app/(main)/store";
import useConnection from "@/utils/connection";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as CurveConn } from "@/anchor/curve/bonding";
import { web3Consts } from "@/anchor/web3Consts";
import { ExponentialCurve, ExponentialCurveConfig } from "@/anchor/curve/curves";
import { useRouter } from "next/navigation";
import { Connectivity as Community } from "@/anchor/community";

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


export default function Launch({ onMenuChange, symbol, createMessage }: { onMenuChange: any, symbol: any, createMessage: any }) {
  const wallet: any = useWallet();
  const [currentUser] = useAtom(data);
  const connection = useConnection();

  const [coinDetail, setCoinDetail] = useState({
    image: {
      preview: "",
      type: ""
    },
    name: "",
    symbol: "",
    desc: "",
    supply: 0,
  })
  const [presaleDetail, setPresaleDetail] = useState({
    presaleStartDate: "",
    lockPeriod: "",
    discount: [],
    presaleMinimum: 0,
    presaleMaximum: 10,
    purchaseMinimum: 0,
    purchaseMaximum: 0
  })

  const [fields, setFields] = useState({
    bonding: "exponential",
    curvesupply: 0,
    deadlineDate: "",
    deadlineTime: "",
    multiplier: 0,
    initialPrice: 0,
    presalePrice: 0
  })
  const [modalIsOpen, setIsOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const [coinLoader, setCoinLoader] = React.useState(false);
  const [coinAllList, setCoinAllList] = React.useState([]);
  const [coinList, setCoinList] = React.useState([]);
  const [buttonStatus, setButtonStatus] = React.useState("Button");
  const [dexError, setDexError] = useState("")
  const [loading, setLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [projectDetail, setProjectDetail] = React.useState<any>(null)
  const navigate = useRouter();
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

  const [selectedCoin, setSelectedCoin] = React.useState<Coin>({
    name: "MMOSH: The Stoked Token",
    desc: "",
    image:
      "https://shdw-drive.genesysgo.net/7nPP797RprCMJaSXsyoTiFvMZVQ6y1dUgobvczdWGd35/MMoshCoin.png",
    token: process.env.NEXT_PUBLIC_OPOS_TOKEN!,
    symbol: "MMOSH",
    decimals: 9
  });
  const [datasets, setDatasets] = React.useState<{ data: number }[]>([]);

  const tickXFormat = React.useCallback(
    (value: number) => {
      if (value === datasets.length - 1) return "Supply = x";

      return "";
    },
    [datasets],
  );

  const delay = (ms: any) => new Promise(res => setTimeout(res, ms));

  useEffect(() => {
    if (localStorage.getItem("coinstep1")) {
      let coinJson: any = localStorage.getItem("coinstep1");
      setCoinDetail(JSON.parse(coinJson));
    }

    if (localStorage.getItem("coinstep2")) {
      let presaleData: any = localStorage.getItem("coinstep2");
      setPresaleDetail(JSON.parse(presaleData));
    }

    getProjectDetailFromAPI()
  }, [])

  const getProjectDetailFromAPI = async () => {
    try {
      setLoading(true)
      let listResult = await axios.get(`/api/project/detail?symbol=${symbol}`);
      setProjectDetail(listResult.data)
      setLoading(false)
    } catch (error) {
      setLoading(false)
      setProjectDetail(null)
    }
  }

  React.useEffect(() => {
    const isLinear = fields.bonding === "linear";
    const isExponential = fields.bonding === "exponential";
    if (
      (isLinear && fields.initialPrice === 0) ||
      (isExponential && fields.multiplier === 0)
    ) {
      setDatasets([{ data: 0 }, { data: 0 }, { data: 0 }]);
      return;
    }
    const multiplier = isLinear ? 0 : fields.multiplier;
    const initialPrice = isLinear ? fields.initialPrice : 0;
    const res = getCoinPrice(
      1000,
      initialPrice.toString(),
      fields.bonding,
      multiplier,
    );
    const datasetsValue = res.data.map((value) => ({
      data: value,
    }));
    const datasetsResult = isLinear
      ? [{ data: 0 }, ...datasetsValue]
      : datasetsValue;
    setDatasets(datasetsResult);
  }, [fields.multiplier, fields.initialPrice, fields.bonding]);


  const openJupiterCoins = () => {
    setIsOpen(true);
    getCompletedCoins();
  };

  const getCompletedCoins = async () => {
    try {
      setCoinLoader(true);
      const result = await axios.get("/api/list-tokens?status=completed");
      let newCoinList: any = baseCoins
      for (let index = 0; index < result.data.length; index++) {
        newCoinList.push(result.data[index]);
      }
      setCoinAllList(newCoinList);
      setCoinList(newCoinList);
      setCoinLoader(false);
    } catch (error) {
      setCoinLoader(false);
      setCoinList([]);
      setCoinAllList([]);
    }
  };

  const openLink = () => {
    window.open(
      "https://solscan.io/account/" + selectedCoin.token + "?cluster=mainnet",
      "_blank",
      "noopener,noreferrer",
    );
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
    setSelectedCoin({
      name: token.name,
      desc: "",
      image: token.image,
      token: token.token,
      symbol: token.symbol,
      decimals: token.decimals,
    })
    closeModal();
  };

  const prepareNumber = (inputValue: any) => {
    if (isNaN(inputValue)) {
      return 0
    }
    return inputValue;
  }

  const goBack = () => {
    onMenuChange("presale")
  }

  const validateFields = (isMessage: boolean) => {
    if (fields.curvesupply < 10000 || fields.curvesupply > 1000000) {
      if (isMessage) {
        createMessage("Bonding curve market cap should be between $10k to $1M", "danger-container");
      }
      return false;
    }

    if (fields.deadlineDate === "" || fields.deadlineTime === "") {
      if (isMessage) {
        createMessage("Deadline date should be selected in future dates", "danger-container");
      }
      return false;
    }

    let currentDate = new Date();
    let deadlineStart = new Date(fields.deadlineDate + " " + fields.deadlineTime)

    if (deadlineStart < currentDate) {
      if (isMessage) {
        createMessage("Deadline date should be selected in future dates", "danger-container");
      }
      return false;
    }

    if (presaleDetail.presaleMaximum > 0) {
      if (fields.presalePrice <= 0) {
        if (isMessage) {
          createMessage("Presale price should not be empty", "danger-container");
        }
        return false;
      }
    }

    if (fields.bonding === "linear") {
      if (fields.initialPrice > 5 || fields.initialPrice < 1) {
        if (isMessage) {
          createMessage("Mulitpler should be between 1 to 5", "danger-container");
        }
        return false;
      }
    } else {
      if (fields.multiplier > 2 || fields.multiplier < 1) {
        if (isMessage) {
          createMessage("Mulitpler should be 1 or 2", "danger-container");
        }
        return false;
      }
    }
    return true;
  };


  React.useEffect(() => {
    setIsReady(validateFields(false))
  }, [fields])


  const actionSubmit = async () => {
    console.log('action submit ------------------------------')
    if (!wallet) {
      createMessage("Wallet is not connected", "danger-container");
      return;
    }

    if (projectDetail.coins.length > 0) {
      createMessage("Project already have coin", "danger-container");
      return;
    }

    if (coinDetail.name === "") {
      createMessage("Coin Detail is missing", "danger-container");
      return;
    }


    try {
      setLoading(true);
      if (validateFields(true)) {
        setButtonStatus("validating symbol...");
        const symbolResult = await axios.get(
          `/api/check-token-symbol?symbol=${coinDetail.symbol}`,
        );
        if (symbolResult.data) {
          createMessage("Symbol already exist. please choose different symbol and try again", "danger-container");
          return;
        }


        const env = new anchor.AnchorProvider(connection.connection, wallet, {
          preflightCommitment: "processed",
        });
        anchor.setProvider(env);
        let curveConn = new CurveConn(
          env,
          web3Consts.programID,
        );

        setButtonStatus("Creating Coin...");
        // changed
        const targetMint = await curveConn.createTargetMint(coinDetail.name, coinDetail.symbol, coinDetail.image.preview, presaleDetail.presaleMaximum * (10 ** 9),connection);
        await delay(15000)

        console.log('after the taget mint ------------------------->')

        if (presaleDetail.presaleMaximum > 0) {
          setButtonStatus("Stake presale value...");
          const projectKeyPair = anchor.web3.Keypair.generate();

          const env = new anchor.AnchorProvider(connection.connection, wallet, {
            preflightCommitment: "processed",
          });
          anchor.setProvider(env);
          console.log('go to the stake coin ==============================>')
          let communityConnection: Community = new Community(env, web3Consts.programID, projectKeyPair.publicKey);
          // changed
          const stakeres = await communityConnection.stakeCoin({
            mint: new anchor.web3.PublicKey(targetMint),
            user: wallet.publicKey,
            value: Math.ceil(presaleDetail.presaleMaximum * web3Consts.LAMPORTS_PER_OPOS),
            // duration: new Date(new Date(presaleDetail.presaleStartDate).toUTCString()).valueOf(),
            duration: 0,
            type: "presale"

          },connection);
          console.log("stake result ", stakeres);
          // coinDetail
          let presaleParams = {
            presaleStartDate: presaleDetail.presaleStartDate,
            lockPeriod: presaleDetail.lockPeriod,
            discount: presaleDetail.discount,
            presaleMinimum: presaleDetail.presaleMinimum,
            presaleMaximum: presaleDetail.presaleMaximum,
            purchaseMinimum: presaleDetail.purchaseMinimum,
            purchaseMaximum: presaleDetail.purchaseMaximum,
            totalSold: 0,
            launchPrice: fields.presalePrice,
            launchMarketCap: fields.curvesupply,
            key: targetMint,
            wallet: wallet.publicKey,
          }
          const result = await axios.post("/api/project/save-presale-details", presaleParams, {
            headers: {
              authorization: `Bearer ${localStorage.getItem("token") || ""}`,
              'Content-Type': 'application/json',
            },
          });
        }


        console.log("target mint", targetMint)

        let targetCoin: Coin = {
          name: coinDetail.name,
          desc: coinDetail.desc,
          image: coinDetail.image.preview,
          token: targetMint,
          symbol: coinDetail.symbol,
          decimals: 9
        }

        const initPrice = 1000000000000;
        const basePrice = calculatePrice(initPrice, 1000, fields.multiplier);
        const coinValue = (Number(1000) / basePrice) * initPrice;

        const curveConfig = new ExponentialCurve(
          {
            c: new anchor.BN(fields.bonding == "linear" ? 0 : coinValue), // c = 1
            b: new anchor.BN(Number(fields.initialPrice) * initPrice),
            // @ts-ignore
            pow: Number(fields.multiplier),
            // @ts-ignore
            frac: 1,
          },
          0,
          0,
        );

        setButtonStatus("Creating Curve Config...");
        // changed
        let curve = await curveConn.initializeCurve({
          config: new ExponentialCurveConfig(curveConfig),
        },connection);

        setButtonStatus("Creating Curve...");

        // to change
        const res = await curveConn.createTokenBonding({
          name: coinDetail.name,
          symbol: coinDetail.symbol,
          url: coinDetail.image.preview,
          curve: curve,
          baseMint: new anchor.web3.PublicKey(selectedCoin.token),
          generalAuthority: new anchor.web3.PublicKey(process.env.NEXT_PUBLIC_PTV_WALLET_KEY!),
          reserveAuthority: new anchor.web3.PublicKey(process.env.NEXT_PUBLIC_PTV_WALLET_KEY!),
          buyBaseRoyaltyPercentage: 0,
          buyTargetRoyaltyPercentage: 0,
          sellBaseRoyaltyPercentage: 0,
          sellTargetRoyaltyPercentage: 0,
          targetMint: new anchor.web3.PublicKey(targetMint),
        },connection);

        console.log("bonding result ", res)

        setButtonStatus("Save token details...");

        // creating community coins
        await axios.post("/api/project/save-coins", {
          name: coinDetail.name,
          symbol: coinDetail.symbol,
          image: coinDetail.image.preview,
          key: targetMint,
          desc: coinDetail.desc,
          decimals: 9,
          creator: wallet.publicKey.toBase58(),
          projectkey: projectDetail.project.key,
          supply: coinDetail.supply
        }, {
          headers: {
            authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            'Content-Type': 'application/json',
          }
        });

        let deadlineDate = new Date(
          fields.deadlineDate + " " + fields.deadlineTime,
        ).toUTCString();

        let params: CoinDetail = {
          base: selectedCoin,
          target: targetCoin,
          symbol: coinDetail.symbol.toUpperCase(),
          token: targetMint,
          bonding: res.tokenBonding.toBase58(),
          status: "active",
          pool: "",
          maxsupplyusd: fields.curvesupply,
          creatorUsername: currentUser ? currentUser!.name : "",
          expiredDate: deadlineDate
        }
        await axios.post("/api/save-token", params, {
          headers: {
            authorization: `Bearer ${localStorage.getItem("token") || ""}`,
            'Content-Type': 'application/json',
          }
        });

        localStorage.removeItem("coinstep1")
        localStorage.removeItem("coinstep2")

        navigate.push("/coins/" + symbol);
      }
    } catch (error) {
      console.log("error ", error)
      setLoading(false);
    }
  }

  return (
    <>
      <div className="bg-profile">
        <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="form-element pt-2.5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="form-element col-span-8">
                    <Input
                      type="text"
                      title="Set Market Cap for when it goes to DEXs"
                      required
                      helperText="Minimum is $10k, Maximum of $1M"
                      placeholder="Market Cap"
                      value={(fields.curvesupply > 0) ? fields.curvesupply.toString() : ""}
                      onChange={(e) => setFields({ ...fields, curvesupply: prepareNumber(Number(e.target.value)) })}
                    />
                  </div>
                  <div className="col-span-2 mt-8 text-white text-header-small-font-size">USD</div>
                </div>
              </div>
              <div className="pt-2.5">
                <p className="text-xs text-whilte">Deadline to reach Market Cap</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={"input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2" + (dexError !== "" ? " border-red-600" : "")}>
                      <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2">
                        <Calender />
                      </div>

                      <input type="date" className="grow text-base" placeholder="Start Date" value={fields.deadlineDate} onChange={(e) => setFields({ ...fields, deadlineDate: e.target.value })} onFocus={() => { setDexError("") }} />
                    </label>
                    {dexError != "" &&
                      <p className="text-header-small-font-size text-red-600">{dexError}</p>
                    }
                  </div>
                  <div>
                    <label className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2">
                      <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2.5">
                        <TimeIcon />
                      </div>

                      <input type="time" className="grow text-base" placeholder="Time" value={fields.deadlineTime} onChange={(e) => setFields({ ...fields, deadlineTime: e.target.value })} />
                    </label>
                  </div>
                </div>
                <p className="text-tiny">if it doesn't reach the market cap by the deadline, funds are distributed by the bonding curve(all Agents Coins are burned all trading pari is sent to buyer)
                </p>
              </div>

              <div className="form-element pt-2.5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="form-element col-span-8">
                    <Input
                      type="text"
                      title="Launch Price"
                      required
                      helperText="The Price where the bonding will start"
                      placeholder="Launch Price"
                      value={(fields.presalePrice > 0) ? fields.presalePrice.toString() : ""}
                      onChange={(e) => setFields({ ...fields, presalePrice: prepareNumber(Number(e.target.value)) })}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div className="form-element pt-2.5">
                <p className="text-xs text-white">
                  Select a Free Agent Coin to pair with your Bonded Agent Coin on the bonding curve
                </p>
                <div
                  className="w-full flex items-center min-w-[2.5vmax] min-h-[2vmax] bg-[#9D9D9D12] cursor-pointer border-[1px] border-[#FFFFFF30] rounded-lg p-2 mt-1"
                  onClick={openJupiterCoins}
                >
                  <div className="flex items-center">
                    <div className="relative w-[2vmax] h-[2vmax] mt-2 mr-1">
                      <img
                        src={selectedCoin.image}
                        alt="coin"
                        className="rounded-full object-cover"
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

              </div>
              <div className="form-element pt-2.5">
                <p className="text-xs text-white">
                  Choose a Bonding Curve for your Coin.
                </p>
                <Select
                  value={fields.bonding}
                  onChange={(e) => {
                    setFields({ ...fields, bonding: e.target.value, initialPrice: 0, multiplier: 0 });
                  }}
                  options={bondingSelectOptions}
                />
              </div>

              <div className="flex w-full h-full mt-4">
                <div className="flex w-full h-full flex-col">
                  <ResponsiveContainer
                    width="100%"
                    height={200}
                    className="pt-2"
                  >
                    <AreaChart
                      width={120}
                      height={200}
                      data={datasets}
                      margin={{
                        top: 30,
                      }}
                    >
                      <defs>
                        <linearGradient
                          id="gradient"
                          x1="1"
                          y1="1"
                          x2="2"
                          y2="2"
                        >
                          <stop
                            offset="100%"
                            stopColor="#0765FF"
                            stopOpacity={0.6}
                          />
                          <stop
                            offset="30%"
                            stopColor="#09073A"
                            stopOpacity={0}
                          />
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
                  <div className="flex justify-center items-end self-end">
                    {fields.bonding === "linear" ? (
                      <p className="text-lg text-white">X=4(Y)</p>
                    ) : (
                      <p className="text-lg text-white">
                        Y=X<sup>2</sup>
                      </p>
                    )}
                  </div>
                </div>

                {fields.bonding === "linear" ? (
                  <div className="flex flex-col justify-center items-center lg:ml-4 md:ml-2 sm:ml-1">
                    <p className="text-white text-tiny">
                      Adjust the slope for your Bonding Curve by changing the
                      multiplier
                    </p>
                    <SimpleInput
                      value={fields.initialPrice.toString()}
                      onChange={(e) => {
                        const value = Number(e.target.value);

                        if (Number.isNaN(value)) return;

                        setFields({
                          ...fields,
                          initialPrice: value,
                        });
                      }}
                      placeholder="0"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col justify-center items-center lg:ml-4 md:ml-2 sm:ml-1">
                    <p className="text-white text-tiny">
                      Adjust the slope for your Bonding Curve by changing the
                      multiplier
                    </p>
                    <div className="max-w-[50%]">
                      <SimpleInput
                        value={fields.multiplier.toString()}
                        onChange={(e) => {
                          const value = Number(e.target.value);

                          if (Number.isNaN(value)) return;

                          setFields({ ...fields, multiplier: value });
                        }}
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
          <div className="flex justify-center mt-10">
            <button className="btn btn-link text-white no-underline" onClick={goBack}>Back</button>
            {!loading &&
              <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white" onClick={actionSubmit} disabled={!isReady}>Next</button>
            }

            {loading &&
              <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white">{buttonStatus}</button>
            }
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
                style={{ maxHeight: window.innerHeight * 0.7 + "px" }}
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
}