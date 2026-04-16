"use client";

import useWallet from "@/utils/wallet";
import axios from "axios";
import React from "react";
import { useEffect, useState } from "react";
import { Connection, Transaction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Bars } from "react-loader-spinner";
import { LaunchPad } from "../components/LaunchPad/LaunchPad";
import { trasferUsdCoin } from "@/app/(main)/lib/forge/createProfile";

const LaunchPadVC = () => {
  const wallet: any = useWallet();

  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [countDownDate, setCountDownDate] = useState(0);
  const [countDown, setCountDown] = useState(0);
  const [presaleDetail, setPresaleDetail] = useState<any>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [creator, setCreator] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(0);
  const [isBuying, setIsBuying] = useState(false);
  const [groupedCards, setGroupedCards] = React.useState<any[]>([]);
  const timerData = [
    { value: "13", label: "Days" },
    { value: "03", label: "Hours" },
    { value: "12", label: "Minutes" },
    { value: "48", label: "Seconds" },
  ];

  useEffect(() => {
    if (countDownDate == 0) {
      return;
    }
    const interval = setInterval(() => {
      setCountDown(countDownDate - new Date().getTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [countDownDate]);
  useEffect(() => {
    if (wallet) {
      getProjectDetailFromAPI();
    }
  }, [wallet])

  const getProjectDetailFromAPI = async () => {
    try {
      setProjectLoading(true)
      const presaleDetail = await axios.get(`/api/project/get-presale-details?userId=${wallet.publicKey}`);
      if (presaleDetail.data.status) {
        setPresaleDetail(presaleDetail.data.result);
        const creatorName = await getUserName(presaleDetail.data.result[0].presaleDetail.wallet);
        setCreator(creatorName == "" ? presaleDetail.data.result[0].presaleDetail.wallet.substring(0, 5) + "..." + presaleDetail.data.result[0].presaleDetail.wallet.substring(presaleDetail.data.result[0].presaleDetail.wallet.length - 5) : creatorName);
        setCountDownDate(new Date(presaleDetail.data.result[0].presaleDetail.lockPeriod).getTime());
        setCountDown(new Date(presaleDetail.data.result[0].presaleDetail.lockPeriod).getTime());
      }
      setTimeout(() => {
        setProjectLoading(false);
      }, 2000);
    } catch (error) {
      setProjectLoading(false);
      setPresaleDetail(null);
    }
  }

  const getUserName = async (pubKey: any) => {
    try {
      const result = await axios.get(`/api/get-wallet-data?wallet=${pubKey}`);
      if (result) {
        if (result.data) {
          if (result.data.profile) {
            return result.data.profile.username;
          }
        }
      }
      return "";
    } catch (error) {
      return "";
    }
  };

  const getCountDownValues = (countDown: number, type: string) => {
    if (countDown < 0 && !projectLoading) getProjectDetailFromAPI();
    const timeUnits: any = {
      Days: Math.floor(countDown / (1000 * 60 * 60 * 24)),
      Hours: Math.floor((countDown % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      Minutes: Math.floor((countDown % (1000 * 60 * 60)) / (1000 * 60)),
      Seconds: Math.floor((countDown % (1000 * 60)) / 1000),
    };

    return timeUnits[type];
  };

  const buyToken = async (tokenInfo: any, amount: string, token: number) => {
    if (validate(tokenInfo, amount)) {
      setIsBuying(true);
      const result = await trasferUsdCoin(wallet, tokenInfo.presaleDetail.wallet, Number(amount));
      console.log("transfer usd coin result", result.message);
      if (result.data) {
        const trasferTokenResult = await axios.post("/api/project/buy-token", {
          receiver: wallet.publicKey.toString(),
          supply: token,
          key: tokenInfo.presaleDetail.key,
          amount: Number(amount),
        }, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          }
        });
        console.log("transfer token result", trasferTokenResult);
        if (trasferTokenResult.data.status) {
          try {
            const connection = new Connection(
              process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
              { confirmTransactionInitialTimeout: 120000 }
            );
            const env = new anchor.AnchorProvider(connection, wallet, {
              preflightCommitment: "processed",
            });
            anchor.setProvider(env);
            const hex = trasferTokenResult.data.transaction;
            const buffer = Buffer.from(hex, "hex");
            const tx = Transaction.from(buffer);
            const signedTx = await wallet.signTransaction(tx);
            const txid = await connection.sendRawTransaction(signedTx.serialize(), {
              skipPreflight: false,
            });
            console.log("Transaction ID:", txid);
            createMessage(`Success! Your token purchase was completed ${txid}`, "success-container");
            await axios.put("/api/project/update-presale-details", {
              key: tokenInfo.presaleDetail.key,
              token: token,
            }, {
              headers: {
                authorization: `Bearer ${localStorage.getItem("token") || ""}`,
              },
            });
            getProjectDetailFromAPI();
            setIsBuying(false);
          } catch (error) {
            console.log("tx error", error);
            setIsBuying(false);
            createMessage("Something went wrong", "danger-container");
          }
        } else {
          createMessage(trasferTokenResult.data.message, "danger-container");
          setIsBuying(false);
        }
      } else {
        createMessage(result.message, "danger-container");
        setIsBuying(false);
      }
    }
  };
  const createMessage = (message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    setIsBuying(false);
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

  const validate = (tokenInfo: any, amount: string): boolean => {
    if (Number(amount) < Number(tokenInfo.presaleDetail.purchaseMinimum)) {
      createMessage(`Amount should be greater than or equal to the ${tokenInfo.presaleDetail.purchaseMinimum}.`, "danger-container");
      return false;
    }
    if (Number(amount) > Number(tokenInfo.presaleDetail.purchaseMaximum)) {
      createMessage(`Amount should be less than or equal to ${tokenInfo.presaleDetail.purchaseMaximum}.`, "danger-container");
      return false;
    }
    return true;
  }


  React.useEffect(() => {
    const data = [];
    let i = 0;
    while (i < presaleDetail.length) {
      if (i === 0) {
        data.push([presaleDetail[i]]);
        i += 1;
      } else {
        data.push(presaleDetail.slice(i, i + 3));
        i += 3;
      }
    }
    setGroupedCards(data);
  }, [presaleDetail])

  return (
    <>
      {showMsg && (
        <div className={"message-container text-white text-center text-header-small-font-size py-5 px-3.5 " + msgClass}>{msgText}</div>
      )}
      {projectLoading &&
        <div className="backdrop-container rounded-xl border border-white border-opacity-20 my-10 p-5">
          <div className="p-10 text-center items-center">
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
        </div>
      }
      {!projectLoading && groupedCards.length > 0 &&
        <div className=" flex flex-col items-center pt-10 m-auto">
          <div className=" py-10 px-4">
            <h2 className="text-center text-[4.75rem] font-extrabold font-goudy text-transparent bg-clip-text bg-[linear-gradient(155deg,#FFF_11.53%,rgba(255,255,255,0.30)_109.53%)] tracking-[-0.02em]">
              Next launch
            </h2>

            <div className=" lg:flex justify-center">
              {timerData.map((item, index) => (
                <div key={index} className="flex  lg:justify-between justify-center items-center">
                  <div className="lg:mx-5 mb-2 lg:mb-0">
                  <div className="text-[4rem] leading-[3rem] font-[500] font-goudy text-transparent bg-clip-text bg-[linear-gradient(155deg,#FFF_11.53%,rgba(255,255,255,0.30)_109.53%)]">
                    {getCountDownValues(countDown, item.label)}
                  </div>
                  <div className="text-base text-[#FFFFFFC7] text-center font-avenir font-medium mt-1">
                    {item.label}
                  </div>
                  </div>
                  
                  {index !== timerData.length - 1 && (
                    <span className="h-[4rem] bg-[#66666638] border border-[#FFFFFF38] rounded-[6px] backdrop-blur-[39px] lg:block hidden" />
                  )}
                  
                </div>
              ))}
            </div>
            <div className=" py-10 px-2">
              {groupedCards.map((group, groupIdx) => (
                <div
                  key={groupIdx}
                  className={`lg:flex lg:flex-wrap justify-center w-full`}
                >
                  {group.map((presale: any, index: number) => (
                    <LaunchPad getCountDownValues={getCountDownValues} creator={creator} buyToken={(amount: string, token: number) => buyToken(presale, amount, token)} presale={presale} isBuying={isBuying} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      {!projectLoading && groupedCards.length === 0 &&
        <div className="flex flex-col mt-12">
          <p className="text-base text-center">
            No data found
          </p>
        </div>
      }
    </>
  );
};

export default LaunchPadVC;