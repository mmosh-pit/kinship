"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Connection } from "@solana/web3.js";
import useWallet from "@/utils/wallet";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { useAtom } from "jotai";
import { bagsConfirmation, bagsModalAck, bagsNotifier } from "@/app/(main)/store/bags";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const OfferItem = (offerData: any) => {
  const wallet = useWallet();
  const router = useRouter();
  const [requestloader, setReqestLoader] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState(0);
  const [bagsRequest, setBagsRequest] = useAtom(bagsConfirmation);
  const [bagsAck, setBagsAck] = useAtom(bagsModalAck);
  const [_bagsNotify, setBagsNotify] = useAtom(bagsNotifier);

  React.useEffect(() => {
    setConnectionStatus(offerData.status);
  }, []);

  const gotoDetails = async () => {
    let listResult = await axios.get(
      `/api/project/detail?address=${offerData.data.project}`,
    );
    router.push(
      "/projects/" +
      listResult.data.symbol.toLowerCase() +
      "/" +
      offerData.data.symbol.toLowerCase(),
    );
  };

  React.useEffect(() => {
    if (!bagsRequest) {
      setReqestLoader(false);
    }
  }, [bagsRequest]);

  React.useEffect(() => {
    if (bagsAck) {
      console.log("bagsAck ", bagsAck);
      if (bagsAck.module == "offer" && bagsAck.data == offerData.invitekey) {
        console.log("testing 1");
        setBagsAck(null);

        processReject();
      }
    }
  }, [bagsAck]);

  const processReject = async () => {
    let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    let connection = new Connection(rpcUrl, {
      confirmTransactionInitialTimeout: 120000,
    });
    const env = new anchor.AnchorProvider(connection, wallet!, {
      preflightCommitment: "processed",
    });
    let userConn: UserConn = new UserConn(env, web3Consts.programID);

    console.log("offerdata invite key", offerData.invitekey);

    let result = await userConn.burnToken(
      new anchor.web3.PublicKey(offerData.invitekey),
    );
    console.log(result);
    if (result.Err) {
      setReqestLoader(false);
      return;
    }

    await internalClient.post("/api/offer/update-invite", {
      wallet: offerData.address,
      offerkey: offerData.data.key,
      type: "reject",
    });
    setConnectionStatus(2);
    setBagsRequest(null);
    setBagsNotify({
      message: "The offer has been burned",
      type: "danger-container",
    });
    offerData.onRefresh();
  };

  const connectionAction = async (type: any) => {
    try {
      setReqestLoader(true);
      if (type === "reject") {
        setBagsRequest({
          module: "offer",
          data: offerData.invitekey,
        });
      } else {
        await internalClient.post("/api/offer/update-invite", {
          wallet: offerData.address,
          offerkey: offerData.data.key,
          type,
        });
        setConnectionStatus(1);
        setReqestLoader(false);
        setBagsNotify({
          message: "The offer accepted successfully",
          type: "success-container",
        });
        offerData.onRefresh();
      }
    } catch (error) {
      setReqestLoader(false);
    }
  };

  if (!offerData) return <></>;

  return (
    <div className="flex bg-[#2E3C4E80] bg-opacity-40 px-4 py-2 rounded-2xl cursor-pointer mb-4 relative overflow-hidden">
      <div className="self-center max-w-[30%] mr-4">
        <div
          className="relative w-[100px] h-[100px] cursor-pointer"
          onClick={gotoDetails}
        >
          <Image
            src={offerData.data.image}
            alt="Profile Image"
            className="rounded-md object-cover"
            layout="fill"
          />
        </div>
      </div>

      <div className="w-full flex flex-col">
        <div className="flex items-center">
          <p
            className="text-white text-lg underline cursor-pointer"
            onClick={gotoDetails}
          >
            {" "}
            <span className="font-bold text-white text-lg capitalize">
              {offerData.data.name}
            </span>{" "}
            • {offerData.data.symbol}
          </p>
        </div>

        <div className="my-4">
          <p className="text-white text-base text-with-ellipsis max-w-[70%] line-clamp-2">
            {offerData.data.desc}
          </p>
        </div>

        <div className="flex flex-col mt-4">
          <div className="flex items-center rounded-lg px-2">
            <p className="text-sm text-white">
              <span className="font-bold text-sm text-white mr-4">
                Type of Offer
              </span>
            </p>
            <div className="px-2 bg-[#19066B] rounded-lg">
              <p className="text-sm text-white">
                {offerData.data.pricetype === "onetime"
                  ? "One Time"
                  : "Subscription"}
              </p>
            </div>
          </div>
          {offerData.data.pricetype === "onetime" && (
            <div className="flex items-center rounded-lg px-2 mt-2">
              <p className="text-sm text-white">
                <span className="font-bold text-sm text-white mr-4">Price</span>
              </p>
              <div className="px-2 bg-[#19066B] rounded-lg">
                <p className="text-sm text-white">
                  {"USDC " + offerData.data.priceonetime}
                </p>
              </div>
            </div>
          )}
          {offerData.data.pricetype !== "onetime" && (
            <>
              <div className="flex items-center rounded-lg px-2 mt-2">
                <p className="text-sm text-white">
                  <span className="font-bold text-sm text-white mr-4">
                    Price
                  </span>
                </p>
                {offerData.data.pricemonthly > 0 && (
                  <div className="px-2 bg-[#19066B] rounded-lg mr-2">
                    <p className="text-sm text-white">
                      {"Monthly : USDC " + offerData.data.pricemonthly}
                    </p>
                  </div>
                )}
                {offerData.data.priceyearly > 0 && (
                  <div className="px-2 bg-[#19066B] rounded-lg">
                    <p className="text-sm text-white">
                      {"Yearly : USDC " + offerData.data.priceyearly}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {offerData.isinvite == 1 && (
          <div className="flex justify-end my-4">
            {!requestloader && connectionStatus == 0 && (
              <div className="flex">
                <button
                  className="btn btn-xs bg-[#7295C399] rounded-md text-white mx-2.5 font-normal border-b-[2px] border-b-[rgba(255,255,255,0.56)] border-l-[1px] border-l-[rgba(255,255,255,0.56)] border-r-[2px] border-r-[rgba(255,255,255,0.56)]"
                  onClick={() => {
                    connectionAction("accept");
                  }}
                >
                  Accept
                </button>
                <button
                  className="btn btn-xs bg-[#7B4143] rounded-md text-white font-normal border-b-[2px] border-b-[rgba(255,255,255,0.56)] border-l-[1px] border-l-[rgba(255,255,255,0.56)] border-r-[2px] border-r-[rgba(255,255,255,0.56)]"
                  onClick={() => {
                    connectionAction("reject");
                  }}
                >
                  Reject
                </button>
              </div>
            )}

            {!requestloader && connectionStatus == 2 && (
              <button className="btn btn-xs bg-[#7B4143] rounded-md text-white font-normal border-b-[2px] border-b-[rgba(255,255,255,0.56)] border-l-[1px] border-l-[rgba(255,255,255,0.56)] border-r-[2px] border-r-[rgba(255,255,255,0.56)]">
                Rejected
              </button>
            )}

            {requestloader && (
              <button className="btn btn-xs bg-[#7295C399] rounded-md text-white font-normal border-b-[2px] border-b-[rgba(255,255,255,0.56)] border-l-[1px] border-l-[rgba(255,255,255,0.56)] border-r-[2px] border-r-[rgba(255,255,255,0.56)]">
                Processing...
              </button>
            )}
          </div>
        )}
      </div>

      {offerData.isinvite == 1 && (
        <>
          {connectionStatus == 0 && (
            <div className="bg-[#0F015E] absolute right-[-10px] top-[-4px] rounded-2xl pl-4 pr-6 py-2 text-xs font-normal">
              Pending
            </div>
          )}
          {connectionStatus == 1 && (
            <div className="bg-[#03E3E059] absolute right-[-10px] top-[-4px] rounded-2xl pl-4 pr-6 py-2 text-xs font-normal">
              Accepted
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default OfferItem;
