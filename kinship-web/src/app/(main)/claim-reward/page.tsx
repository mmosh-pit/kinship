"use client";
import useWallet from "@/utils/wallet";
import axios from "axios";
import React, { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { Bars } from "react-loader-spinner";
import { useAtom } from "jotai";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { userWeb3Info } from "@/app/(main)/store";
import { getLineage } from "@/app/(main)/lib/forge/createProfile";

const ClaimPage = () => {
  const wallet = useWallet();
  const [profileInfo] = useAtom(userWeb3Info);
  const [history, setHistory] = useState({
    history: [],
    inPool: 0,
    rewards: 0,
  });
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [usage, setUsage] = useState(0);
  const [totalUsage, setTotalUsage] = useState(0);
  const [claimed, setClaimed] = useState(0);
  const [withdrawalAmount, setWithdrawalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [showLoader, setShowLoader] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [walletReward, setWalletReward] = useState({
    rewardAmount: 0,
    climedAmount: 0,
  });

  useEffect(() => {
    if (wallet) {
      getAgentInfo();
    }
  }, [wallet]);
  useEffect(() => {
    if (projectId) {
      getRewardInfo();
    }
  }, [projectId]);
  useEffect(() => {
    getMembershipHistory();
  }, [page]);

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

  const getRewardInfo = async () => {
    if (projectId === "my-wallet") {
      const result = await axios.get(
        `/api/membership/get-reward-by-wallet?wallet=${wallet?.publicKey.toBase58()}`,
        {
          headers: {
            authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      setWalletReward(result.data.result);
      setTotalUsage(0);
      setUsage(0);
      setClaimed(0);
      setShowLoader(false);
    } else {
      const token = localStorage.getItem("token") || "";
      const response = await axios.get(
        `/api/membership/get-reward?agentId=${projectId}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      );
      setUsage(response.data.result.usage);
      setClaimed(response.data.result.withdrawal);
      setTotalUsage(response.data.result.tolalUsage);
      setWithdrawalAmount(response.data.result.withdrawalAmount || 0);
      setShowLoader(false);
    }
  };

  const getAgentInfo = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const response = await axios.get(
        `/api/membership/get-agent-by-user?creator=${wallet?.publicKey.toString()}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      );
      setProjects([
        { name: "my wallet", key: "my-wallet" },
        ...response.data.result,
      ]);
      if (response.data.result[0] && projectId === "") {
        setProjectId(response.data.result[0].key);
      }
      if (response.data.result.length === 0) {
        setShowLoader(false);
      }
    } catch (error) {
      setShowLoader(false);
    }
  };

  const getMembershipHistory = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const response = await axios.get(
        `/api/membership/get-history?page=${page}&limit=${limit}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      );
      setHistory(response.data.result);
      const total = response.data.result.total || 0;
      setTotalPages(Math.ceil(total / limit));
    } catch (error) {
      console.error("Error fetching history", error);
      setHistory({
        history: [],
        inPool: 0,
        rewards: 0,
      });
    }
  };

  const getDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatAmount = (amount: number, decimals: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: decimals,
    }).format(amount);
  };

  const claimAmount = async () => {
    try {
      if (wallet) {
        const lineage = await getLineage(wallet.publicKey.toBase58());
        setIsLoading(true);
        const txAmount =
          projectId === "my-wallet"
            ? walletReward.rewardAmount / 10 ** 6
            : (usage - claimed / totalUsage) * history.inPool;
        const result: any = await internalClient.post("/api/membership/claim", {
          amount: txAmount,
          address: wallet.publicKey.toString(),
          parentAddress: lineage.parent,
        });
        if (result.data.status) {
          const connection = new Connection(
            process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
            {
              confirmTransactionInitialTimeout: 120000,
            }
          );
          const env = new anchor.AnchorProvider(connection, wallet, {
            preflightCommitment: "processed",
          });
          anchor.setProvider(env);

          const userConn: UserConn = new UserConn(env, web3Consts.programID);
          const data: any = Buffer.from(result.data.transaction, "base64");
          const tx = anchor.web3.VersionedTransaction.deserialize(data);
          const signature = await userConn.provider.sendAndConfirm(tx);
          console.log("_TRANSACTIOIN SIGNATURE_", signature);
          const updateRsult: any = await internalClient.post(
            "/api/membership/update-claim",
            {
              agentId: projectId,
              value: 0,
              withdrawal: usage - claimed,
              withdrawalAmount: txAmount,
              isRoyalty: projectId === "my-wallet",
              wallet: wallet.publicKey.toBase58(),
            }
          );
          getMembershipHistory();
          getAgentInfo();
          getRewardInfo();
          setIsLoading(false);
          createMessage(
            `Reward claimed successfully! ${signature}`,
            "success-container"
          );
        } else {
          createMessage(
            `An unexpected error occurred. Kindly try again later`,
            "danger-container"
          );
          setIsLoading(false);
        }
      }
    } catch (error) {
      createMessage(
        `An unexpected error occurred. Kindly try again later`,
        "danger-container"
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4">
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
      {showLoader && (
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
      )}
      {!showLoader && (
        <>
          {/* Dropdown Filter */}
          {projectId !== "" && (
            <div className="flex justify-center mb-4">
              <select
                className="text-white border border-white rounded-lg px-4 py-2 focus:outline-none bg-transparent"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {projects.map((project: any, index) => (
                  <option
                    key={index}
                    value={project.key}
                    className="text-black"
                  >
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Stat Boxes */}
          <div className="flex flex-wrap justify-center gap-6 mb-6">
            {/* Box 1 - In Pool */}
            <div className="rounded-xl border border-white p-4 w-60 text-center">
              <h2 className="text-xl font-bold text-white">In Pool</h2>
              <p className="text-2xl font-semibold text-white mt-1">
                {history.inPool}
              </p>
            </div>

            {/* Box 2 - Token Usage */}
            <div className="rounded-xl border border-white p-4 w-60 text-center">
              <h2 className="text-xl font-bold text-white">Token Usage</h2>
              {/* <p className="text-2xl font-semibold text-white mt-1">{formatAmount(usage).replace(/[$,]/g, '').replace(/\.00$/, '')}</p> */}
              <p className="text-2xl font-semibold text-white mt-1">
                {formatAmount(usage, 6)
                  .replace(/[$,]/g, "")
                  .replace(/\.00$/, "")}
              </p>
            </div>

            {/* Box 3 - Rewards */}
            <div className="rounded-xl border border-white p-4 w-60 text-center">
              <h2 className="text-xl font-bold text-white">Rewards</h2>
              <p className="text-2xl font-semibold text-white mt-1">
                {projectId === "my-wallet" && (
                  <>{formatAmount(walletReward.rewardAmount / 10 ** 6, 2)}</>
                )}
                {projectId !== "my-wallet" &&
                (usage - claimed / totalUsage) * history.inPool > 0
                  ? formatAmount(
                      (usage - claimed / totalUsage) * history.inPool,
                      6
                    )
                      .replace(/[$,]/g, "")
                      .replace(/\.00$/, "")
                  : 0}
              </p>
              {((usage - claimed / totalUsage) * history.inPool > 0 ||
                (projectId === "my-wallet" &&
                  walletReward.rewardAmount > 0)) && (
                <button
                  className="w-[70px] h-[21px] bg-[#FF00AE]/70 hover:bg-[#FF00AE] text-white rounded-[3px] text-[10px] font-bold0"
                  onClick={claimAmount}
                >
                  {isLoading ? "claiming..." : "Claim"}
                </button>
              )}
            </div>
            {/* Box 3 - Rewards */}
            <div className="rounded-xl border border-white p-4 w-60 text-center">
              <h2 className="text-xl font-bold text-white">claimed</h2>
              {projectId === "my-wallet" && (
                <p className="text-2xl font-semibold text-white mt-1">
                  {walletReward.climedAmount}
                </p>
              )}
              {projectId !== "my-wallet" && (
                <p className="text-2xl font-semibold text-white mt-1">
                  {formatAmount(withdrawalAmount, 6)
                    .replace(/[$,]/g, "")
                    .replace(/\.00$/, "")}
                </p>
              )}
            </div>
          </div>

          {/* History Table */}
          <h3 className="text-left pl-[20px] text-white text-lg mb-2">
            History
          </h3>
          <div className="overflow-x-auto">
            <table className="table text-white">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Wallet</th>
                  <th>Membership</th>
                  <th>Membership Type</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.history.map((item: any, index: number) => (
                  <tr key={index}>
                    <th>{index + 1}</th>
                    <td>{item.wallet}</td>
                    <td>{item.membership}</td>
                    <td>{item.membershiptype}</td>
                    <td>
                      {formatAmount(item.price, 6)
                        .replace(/[$,]/g, "")
                        .replace(/\.00$/, "")}
                    </td>
                    <td>{getDate(item.created_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-center mt-4 gap-4">
              <button
                className="px-4 py-2 border rounded text-white disabled:opacity-50"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span className="text-white px-2">
                Page {page} of {totalPages}
              </span>
              <button
                className="px-4 py-2 border rounded text-white disabled:opacity-50"
                onClick={() =>
                  setPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClaimPage;
