"use client";

import { Connection } from "@solana/web3.js";
import { useEffect, useState, use } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import axios from "axios";
import { useRouter } from "next/navigation";
import MessageBanner from "../../components/common/MessageBanner";
import useWallet from "@/utils/wallet";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const ClaimPage = (props: { params: Promise<{ coin: string }> }) => {
  const params = use(props.params);
  const navigate = useRouter();
  const wallet = useWallet();
  const [countDownDate, setCountDownDate] = useState(0);
  const [coinDetail, setCoinDetail] = useState<any>(null);
  const [countDown, setCountDown] = useState(0);
  const [message, setMessage] = useState({
    message: "",
    type: "",
  });
  const [loader, setLoader] = useState({
    active: false,
    type: "",
  });

  const [details, setDetails] = useState({
    total: 0,
    staked: 0,
    claimed: 0,
    unclaimed: 0,
    available: 0,
    claimable: 0,
    unstakeable: 0,
    user: {
      swapped: 0,
      unstaked: 0,
      total: 0,
    },
  });

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
    getTokenData(params.coin);
  }, [wallet]);

  const getTokenData = async (tokenAddress: any) => {
    try {
      if (!wallet) {
        return;
      }
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
        {
          confirmTransactionInitialTimeout: 120000,
        },
      );

      const env = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "processed",
      });
      const userConn = new UserConn(env, web3Consts.programID);

      const stakePublicKey = process.env.NEXT_PUBLIC_PTV_WALLET_KEY!;

      let ptvOwner = new anchor.web3.PublicKey(stakePublicKey);

      let supplyData = await userConn.connection.getTokenSupply(
        new anchor.web3.PublicKey(tokenAddress),
      );
      console.log("tokenaddress ", tokenAddress);
      let overallSupply = await userConn.getUserBalance({
        token: tokenAddress,
        address: ptvOwner,
        decimals: web3Consts.LAMPORTS_PER_OPOS,
      });

      let data = await axios(
        "/api/ptv/rewards?coin=" +
        params.coin +
        "&&wallet=" +
        wallet.publicKey.toBase58(),
      );

      setDetails({
        total: supplyData.value.uiAmount ? supplyData.value.uiAmount : 0,
        staked: overallSupply ? overallSupply : 0,
        claimed: data.data.totalclaim,
        unclaimed: data.data.totalunclaimed,
        available:
          (overallSupply ? overallSupply : 0) - data.data.totalavailable,
        unstakeable: data.data.unstakable,
        claimable: data.data.claimable,
        user: {
          swapped: data.data.swapped,
          unstaked: data.data.unstaked,
          total: data.data.total,
        },
      });
    } catch (error) {
      console.log("tokendata error ", error);
    }
  };

  const getCountDownValues = (countDown: any) => {
    // calculate time left
    const days = Math.floor(countDown / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (countDown % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((countDown % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((countDown % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds };
  };

  useEffect(() => {
    getCoinDetail();
  }, []);

  const getCoinDetail = async () => {
    let result: any = await axios.get(
      "/api/project/coin-detail?coin=" + params.coin,
    );
    if (result.data.info) {
      setCountDownDate(new Date(result.data.info.unlockDate).getTime());
    }

    if (result.data.coin) {
      setCoinDetail(result.data.coin);
    }
  };

  const unstakeAction = async (type: any, value: any) => {
    if (!wallet) {
      setMessage({
        type: "error",
        message: "Wallet is not connected",
      });
      return;
    }

    try {
      setLoader({
        type,
        active: true,
      });
      const result: any = await internalClient.post("/api/ptv/claim", {
        address: wallet.publicKey.toBase58(),
        coin: params.coin,
      });

      if (result.data.status) {
        const connection = new Connection(
          process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
          {
            confirmTransactionInitialTimeout: 120000,
          },
        );
        const env = new anchor.AnchorProvider(connection, wallet, {
          preflightCommitment: "processed",
        });

        anchor.setProvider(env);

        const userConn: UserConn = new UserConn(env, web3Consts.programID);
        const data: any = Buffer.from(result.data.transaction, "base64");
        const tx = anchor.web3.VersionedTransaction.deserialize(data);
        const signature = await userConn.provider.sendAndConfirm(tx);
        await internalClient.post("/api/ptv/update-rewards", {
          type,
          wallet: wallet.publicKey.toBase58(),
          method: "unstake",
          value: value,
        });

        getTokenData(process.env.NEXT_PUBLIC_PTVB_TOKEN);
        getTokenData(process.env.NEXT_PUBLIC_PTVR_TOKEN);
      } else {
        setMessage({
          type: "error",
          message: result.data.message,
        });
      }
      setLoader({
        type: "",
        active: false,
      });
    } catch (error) {
      setMessage({
        type: "error",
        message: "Something went wrong",
      });
      setLoader({
        type: "",
        active: false,
      });
    }
  };

  return (
    <div>
      <MessageBanner message={message.message} type={message.type} />
      <div className="mt-10">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h2 className="text-center text-white font-goudy font-normal text-xl">
                Claim Token
              </h2>

              <div className="border-container p-px rounded-xl">
                <div className="background-content-claim p-3.5 rounded-xl">
                  {coinDetail && (
                    <div className="grid grid-cols-1">
                      <div>
                        <h3 className="text-left text-sub-title-font-size border-b border-white border-opacity-20 pb-3.5 mb-3.5 pl-3.5">
                          {coinDetail.name}
                        </h3>
                        <div className="pl-3.5">
                          <div className="flex mt-1.5">
                            <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-20">
                              Total Supply:
                            </label>
                            <span className="text-header-small-font-size text-white font-poppins leading-6">
                              {details.total}
                            </span>
                          </div>
                          <div className="flex mt-1.5">
                            <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-20">
                              Staked:
                            </label>
                            <span className="text-header-small-font-size text-white font-poppins leading-6">
                              {details.staked}
                            </span>
                          </div>
                          <div className="flex mt-1.5">
                            <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-20">
                              Claimed:
                            </label>
                            <span className="text-header-small-font-size text-white font-poppins leading-6">
                              {details.claimed}
                            </span>
                          </div>
                          <div className="flex mt-1.5">
                            <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-20">
                              UnClaimed:
                            </label>
                            <span className="text-header-small-font-size text-white font-poppins leading-6">
                              {details.unclaimed}
                            </span>
                          </div>
                          <div className="flex mt-1.5">
                            <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-20">
                              Available:
                            </label>
                            <span className="text-header-small-font-size text-white font-poppins leading-6">
                              {details.available}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {coinDetail && (
                <div className="grid grid-cols-1">
                  <div>
                    <div className="text-center">
                      <div className="bg-black bg-opacity-[0.2] text-header-small-font-size text-white font-poppins py-2.5 px-10 inline-block font-semibold mb-2.5">
                        {details.claimable} {coinDetail.symbol}
                      </div>
                      <div>
                        <button
                          className="btn-sm bg-primary text-white border-none hover:bg-primary hover:text-white w-32 rounded-md"
                          onClick={() => {
                            navigate.push(`/swap`);
                          }}
                        >
                          Claim {coinDetail.symbol}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-center text-white font-goudy font-normal text-xl">
                Unstake your Token
              </h2>

              <div className="border-container p-px rounded-xl">
                <div className="background-content-claim p-3.5 rounded-xl">
                  {coinDetail && (
                    <div className="grid grid-cols-1">
                      <h3 className="text-left text-sub-title-font-size border-b border-white border-opacity-20 pb-3.5 mb-3.5 pl-3.5">
                        {coinDetail.name}
                      </h3>
                      <div className="pl-3.5">
                        <div className="flex mt-1.5">
                          <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-24">
                            Hold in Wallet:
                          </label>
                          <span className="text-header-small-font-size text-white font-poppins leading-6">
                            {details.user.total}
                          </span>
                        </div>
                        <div className="flex mt-1.5">
                          <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-24">
                            Staked:
                          </label>
                          <span className="text-header-small-font-size text-white font-poppins leading-6">
                            {details.unstakeable}
                          </span>
                        </div>
                        <div className="flex mt-1.5">
                          <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-24">
                            UnStaked:
                          </label>
                          <span className="text-header-small-font-size text-white font-poppins leading-6">
                            {details.user.unstaked}
                          </span>
                        </div>
                        <div className="flex mt-1.5">
                          <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-24">
                            Seasoned:
                          </label>
                          <span className="text-header-small-font-size text-white font-poppins leading-6">
                            {details.claimable}
                          </span>
                        </div>
                        <div className="flex mt-1.5">
                          <label className="text-header-small-font-size text-white font-poppins font-semibold leading-6 w-24">
                            Swapped:
                          </label>
                          <span className="text-header-small-font-size text-white font-poppins leading-6">
                            {details.user.swapped}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {coinDetail && (
                <div className="grid grid-cols-1">
                  <div>
                    <div className="text-center">
                      <div className="bg-black bg-opacity-[0.2] text-header-small-font-size text-white font-poppins py-2.5 px-10 inline-block font-semibold mb-2.5">
                        {details.unstakeable} {coinDetail.symbol}
                      </div>
                      <div>
                        {loader.active && loader.type === "Blue" && (
                          <button className="btn-sm bg-claim-color text-white border-none hover:bg-claim-color hover:text-white w-32 rounded-md">
                            Unstaking...
                          </button>
                        )}
                        {!loader.active && (
                          <button
                            className="btn-sm bg-claim-color text-white border-none hover:bg-claim-color hover:text-white w-32 rounded-md"
                            onClick={() => {
                              unstakeAction("Blue", details.unstakeable);
                            }}
                          >
                            Unstake {coinDetail.symbol}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-para-font-size light-gray-color text-center para-line-height mb-5 mt-1 text-light-gray leading-4">
          Congratulations! You've earned the Tokens. Claim them here:
        </p>

        <p className="max-w-3xl mx-auto text-para-font-size light-gray-color text-center para-line-height mb-1.5 mt-1 text-light-gray leading-4 px-10">
          {" "}
          Return here to unstake your tokens and trade them freely. Staked
          tokens must be traded with memecoins at least once before they are
          unstaked Countdown to all polls chlosed and results are in
        </p>
        <div className="leader-container max-w-sm mx-auto p-2.5 mb-5">
          <div className="flex justify-center">
            <div>
              <div className="w-16 font-goudy text-xl text-center text-white flex justify-center align-center items-center">
                {getCountDownValues(countDown).days}
              </div>
              <p className="text-header-small-font-size text-center">days</p>
            </div>
            <div>
              <div className="w-16 font-goudy text-xl text-center text-white flex justify-center align-center items-center">
                {getCountDownValues(countDown).hours}
              </div>
              <p className="text-header-small-font-size text-center">Hours</p>
            </div>
            <div>
              <div className="w-16 font-goudy text-xl text-center text-white flex justify-center align-center items-center">
                {getCountDownValues(countDown).minutes}
              </div>
              <p className="text-header-small-font-size text-center">Minutes</p>
            </div>
            <div>
              <div className="w-16 font-goudy text-xl text-center text-white rounded-md flex justify-center align-center items-center">
                {getCountDownValues(countDown).seconds}
              </div>
              <p className="text-header-small-font-size text-center">Seconds</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClaimPage;
