"use client";

import Input from "../../components/common/Input";
import Select from "../../components/common/Select";
import Calender from "@/assets/icons/Calender";
import axios from "axios";
import { useEffect, useState } from "react";
import { Connectivity as Community } from "@/anchor/community";
import { Connectivity as UserConn } from "@/anchor/user";
import * as anchor from "@coral-xyz/anchor";
import useConnection from "@/utils/connection";
import useWallet from "@/utils/wallet";
import { web3Consts } from "@/anchor/web3Consts";
import { userWeb3Info } from "@/app/(main)/store";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const CommunityStake = () => {
  const navigate = useRouter();
  const connection = useConnection();
  const wallet: any = useWallet();
  const [profileInfo] = useAtom(userWeb3Info);

  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [loading, setLoading] = useState(false);
  const [coinList, setCoinList] = useState<any>([]);
  const [coins, setCoins] = useState<any>([]);
  const [fields, setFields] = useState({
    coin: "",
    amount: 0,
    unlockDate: "",
    creator: "",
    distribution: {
      curator: 0,
      creator: 0,
      promoter: 0,
      scout: 0,
      mutal: 0,
      inbound: 0,
      outbound: 0,
    },
  });

  const createMessage = (message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    setLoading(false);
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

  useEffect(() => {
    initFields();
  }, []);

  const initFields = async () => {
    try {
      const result: any = await axios.get("/api/project/list-coins");
      console.log("result.data ", result.data);
      setCoinList(result.data);
      let newCoins = [];
      for (let index = 0; index < result.data.length; index++) {
        const element = result.data[index];
        newCoins.push({
          label: element.name,
          value: element.key,
        });
      }
      setCoins(newCoins);
      if (newCoins.length > 0) {
        setFields({ ...fields, coin: newCoins[0].value });
      }
    } catch (error) {
      setCoins([]);
    }
  };

  const prepareNumber = (inputValue: any) => {
    if (isNaN(inputValue)) {
      return 0;
    }
    return inputValue;
  };

  const onSubmit = async () => {
    if (!wallet || !profileInfo) {
      createMessage(
        "Please connect your wallet before stake coins",
        "danger-container",
      );
      return;
    }
    if (profileInfo.mmoshBalance === 0) {
      createMessage(
        "Not enough mmosh balance to process stake",
        "danger-container",
      );
      return;
    }
    if (!validateFields()) {
      console.log("validation field");
      return;
    }
    let finalCoin = coinList.filter((coinItem: any) => {
      return coinItem.key === fields.coin;
    });

    if (finalCoin.length === 0) {
      console.log("coin not exist");
      return;
    }

    if (getTotalPercentage() !== 100) {
      createMessage("Giveaway is not 100%", "danger-container");
      return;
    }

    try {
      setLoading(true);
      const env = new anchor.AnchorProvider(connection.connection, wallet, {
        preflightCommitment: "processed",
      });
      anchor.setProvider(env);
      let communityConnection: Community = new Community(
        env,
        web3Consts.programID,
        new anchor.web3.PublicKey(finalCoin[0].projectkey),
      );
      const rootMainStateInfo =
        await communityConnection.program.account.mainState.fetch(
          communityConnection.mainState,
        );
      let gensis = rootMainStateInfo.genesisProfile.toBase58();

      let userConn: UserConn = new UserConn(env, web3Consts.programID);
      let projectOwner: any = await userConn.getNftProfileOwner(
        rootMainStateInfo.genesisProfile,
      );

      console.log("gensis ", projectOwner.profileHolder.toBase58());

      let balance: any = await userConn.getUserBalance({
        address: wallet.publicKey,
        token: fields.coin,
        decimals: web3Consts.LAMPORTS_PER_OPOS,
      });

      if (
        projectOwner.profileHolder.toBase58() !== wallet.publicKey.toBase58()
      ) {
        createMessage(
          "Only project owner only able to stake coins",
          "danger-container",
        );
        return;
      }

      if (balance < fields.amount) {
        createMessage(
          "Not enough balance to process stake",
          "danger-container",
        );
        return;
      }

      fields.creator = wallet.publicKey.toBase58();

      let stakePublicKey: any = process.env.NEXT_PUBLIC_PTV_WALLET_KEY;
      let txis = [];
      let stakeIns: any = await userConn.baseSpl.transfer_token_modified({
        mint: new anchor.web3.PublicKey(finalCoin[0].key),
        sender: wallet.publicKey,
        receiver: new anchor.web3.PublicKey(stakePublicKey),
        init_if_needed: true,
        amount: Math.ceil(fields.amount * web3Consts.LAMPORTS_PER_OPOS),
      });
      for (let index = 0; index < stakeIns.length; index++) {
        txis.push(stakeIns[index]);
      }

      const tx = new anchor.web3.Transaction().add(...txis);
      tx.recentBlockhash = (
        await userConn.connection.getLatestBlockhash()
      ).blockhash;
      tx.feePayer = userConn.provider.publicKey;

      const feeEstimate = await userConn.getPriorityFeeEstimate(tx);
      let feeIns;
      if (feeEstimate > 0) {
        feeIns = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: feeEstimate,
        });
      } else {
        feeIns = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        });
      }
      tx.add(feeIns);
      let res = await userConn.provider.sendAndConfirm(tx, []);
      console.log("res ", res);
      if (res) {
        await internalClient.post("/api/project/stake-coins", fields);
        setFields({ ...fields, amount: 0, unlockDate: "" });
      }
      setLoading(false);
      navigate.replace(`/rewards/` + fields.coin);
    } catch (error) {
      console.log("test6 ", error);
      setLoading(false);
    }
  };

  const validateFields = () => {
    if (fields.amount == 0) {
      createMessage(
        "Stake amount should be greater than zero",
        "danger-container",
      );
      return false;
    }

    if (fields.unlockDate == "") {
      createMessage("Expiry date is required", "danger-container");
    }

    let currentDate = new Date();
    let expiryDate = new Date(fields.unlockDate);
    if (getDateDiff(currentDate, expiryDate) < 0) {
      createMessage("Expiry date is invalid", "danger-container");
      return false;
    }

    return true;
  };

  const getDateDiff = (startDate: any, endDate: any) => {
    if (endDate.getTime() - startDate.getTime() > 0) {
      var diff = endDate.getTime() - startDate.getTime();
      var diffDays = Math.ceil(diff / (1000 * 3600 * 24));
      return diffDays;
    } else {
      return -1;
    }
  };

  const getTotalPercentage = () => {
    return (
      Number(fields.distribution.creator) +
      Number(fields.distribution.curator) +
      Number(fields.distribution.promoter) +
      Number(fields.distribution.scout) +
      Number(fields.distribution.mutal) +
      Number(fields.distribution.inbound) +
      Number(fields.distribution.outbound)
    );
  };

  return (
    <>
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size py-5 px-3.5 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      <div className="background-content">
        <div className="backdrop-container rounded-xl border border-white border-opacity-20 my-10 max-w-2xl mx-auto">
          <div className="border-b border-white border-opacity-20 p-3.5">
            <h2 className="text-center text-white font-goudy font-normal text-xl">
              Stake Community Coins
            </h2>
          </div>
          <div className="p-5">
            <div className="form-element pt-2.5">
              <p className="text-xs text-white">
                Choose Community Coin<sup>*</sup>
              </p>
              <Select
                value={fields.coin}
                onChange={(e: any) => {
                  setFields({ ...fields, coin: e.target.value });
                }}
                options={coins}
              />
            </div>
            <div className="form-element pt-2.5">
              <Input
                type="text"
                title="Stake Amount"
                required
                helperText=""
                placeholder="Stake Amount"
                value={fields.amount > 0 ? fields.amount.toString() : ""}
                onChange={(e) => {
                  setFields({
                    ...fields,
                    amount: prepareNumber(Number(e.target.value)),
                  });
                }}
              />
            </div>
            <div className="form-element pt-2.5">
              <p className="text-xs text-white">
                Expiry Date<sup>*</sup>
              </p>
              <label className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2">
                <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2">
                  <Calender />
                </div>

                <input
                  type="date"
                  className="grow text-base"
                  placeholder="Expiration Date"
                  value={fields.unlockDate}
                  onChange={(e) => {
                    setFields({ ...fields, unlockDate: e.target.value });
                  }}
                />
              </label>
            </div>

            <div className="project-share-royalties">
              <h4 className="text-header-small-font-size mt-5">
                Lineage Giveaway
              </h4>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-2.5">
                <div className="flex mt-2">
                  <label className="text-xs text-white leading-10 min-w-12">
                    Gen1
                  </label>
                  <div className="mx-2">
                    <input
                      type="text"
                      value={fields.distribution.curator}
                      onChange={(event) => {
                        let priceDetails = fields.distribution;
                        (priceDetails.curator = prepareNumber(
                          Number(event.target.value),
                        )),
                          setFields({
                            ...fields,
                            distribution: priceDetails,
                          });
                      }}
                      placeholder="0"
                      className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                    />
                  </div>
                </div>
                <div className="flex mt-2">
                  <label className="text-xs text-white leading-10 min-w-12">
                    Gen2
                  </label>
                  <div className="mx-2">
                    <input
                      type="text"
                      value={fields.distribution.creator}
                      onChange={(event) => {
                        let priceDetails = fields.distribution;
                        (priceDetails.creator = prepareNumber(
                          Number(event.target.value),
                        )),
                          setFields({
                            ...fields,
                            distribution: priceDetails,
                          });
                      }}
                      placeholder="0"
                      className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                    />
                  </div>
                </div>
                <div className="flex mt-2">
                  <label className="text-xs text-white leading-10 min-w-12">
                    Gen3
                  </label>
                  <div className="mx-2">
                    <input
                      type="text"
                      value={fields.distribution.promoter}
                      onChange={(event) => {
                        let priceDetails = fields.distribution;
                        (priceDetails.promoter = prepareNumber(
                          Number(event.target.value),
                        )),
                          setFields({
                            ...fields,
                            distribution: priceDetails,
                          });
                      }}
                      placeholder="0"
                      className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                    />
                  </div>
                </div>
                <div className="flex mt-2">
                  <label className="text-xs text-white leading-10 min-w-12">
                    Gen4
                  </label>
                  <div className="mx-2">
                    <input
                      type="text"
                      value={fields.distribution.scout}
                      onChange={(event) => {
                        let priceDetails = fields.distribution;
                        (priceDetails.scout = prepareNumber(
                          Number(event.target.value),
                        )),
                          setFields({
                            ...fields,
                            distribution: priceDetails,
                          });
                      }}
                      placeholder="0"
                      className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                    />
                  </div>
                </div>
              </div>
              <h4 className="text-header-small-font-size mt-5">
                Connection Giveaway
              </h4>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-2.5">
                <div className="flex mt-2">
                  <label className="text-xs text-white leading-10 min-w-12">
                    Mutal
                  </label>
                  <div className="mx-2">
                    <input
                      type="text"
                      value={fields.distribution.mutal}
                      onChange={(event) => {
                        let priceDetails = fields.distribution;
                        (priceDetails.mutal = prepareNumber(
                          Number(event.target.value),
                        )),
                          setFields({
                            ...fields,
                            distribution: priceDetails,
                          });
                      }}
                      placeholder="0"
                      className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                    />
                  </div>
                </div>
                <div className="flex mt-2">
                  <label className="text-xs text-white leading-10 min-w-12">
                    Inbound
                  </label>
                  <div className="mx-2">
                    <input
                      type="text"
                      value={fields.distribution.inbound}
                      onChange={(event) => {
                        let priceDetails = fields.distribution;
                        (priceDetails.inbound = prepareNumber(
                          Number(event.target.value),
                        )),
                          setFields({
                            ...fields,
                            distribution: priceDetails,
                          });
                      }}
                      placeholder="0"
                      className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                    />
                  </div>
                </div>
                <div className="flex mt-2">
                  <label className="text-xs text-white leading-10 min-w-12">
                    Outbound
                  </label>
                  <div className="mx-2">
                    <input
                      type="text"
                      value={fields.distribution.outbound}
                      onChange={(event) => {
                        let priceDetails = fields.distribution;
                        (priceDetails.outbound = prepareNumber(
                          Number(event.target.value),
                        )),
                          setFields({
                            ...fields,
                            distribution: priceDetails,
                          });
                      }}
                      placeholder="0"
                      className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3.5">
                <h6>
                  <label className="text-header-small-font-size text-white font-bold mr-2">
                    Giveaway Total (%):{" "}
                  </label>{" "}
                  <span className="text-header-small-font-size text-white font-bold">
                    {getTotalPercentage()}
                  </span>
                </h6>
              </div>
            </div>

            <div className="flex justify-center mt-10">
              {!loading && (
                <button
                  className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white"
                  onClick={onSubmit}
                >
                  Next
                </button>
              )}
              {loading && (
                <button className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white">
                  Loading...
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CommunityStake;
