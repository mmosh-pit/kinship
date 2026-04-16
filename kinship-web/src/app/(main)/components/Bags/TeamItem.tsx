"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Connection } from "@solana/web3.js";
import useWallet from "@/utils/wallet";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { useAtom } from "jotai";
import { bagsConfirmation, bagsModalAck, bagsNotifier } from "@/app/(main)/store/bags";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const TeamItem = (projectData: any) => {
  const wallet = useWallet();
  const router = useRouter();
  const [requestloader, setReqestLoader] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState(0);
  const [bagsRequest, setBagsRequest] = useAtom(bagsConfirmation);
  const [bagsAck, setBagsAck] = useAtom(bagsModalAck);
  const [_bagsNotify, setBagsNotify] = useAtom(bagsNotifier);

  React.useEffect(() => {
    setConnectionStatus(projectData.data.status);
  }, []);

  React.useEffect(() => {
    if (!bagsRequest) {
      setReqestLoader(false);
    }
  }, [bagsRequest]);

  React.useEffect(() => {
    if (bagsAck) {
      if (bagsAck.module == "teams" && bagsAck.data == projectData.data.key) {
        setBagsAck(null);
        processReject();
      }
    }
  }, [bagsAck]);

  const gotoDetails = async () => {
    router.push(
      "/projects/" + projectData.data.project[0].symbol.toLowerCase(),
    );
  };

  const gotoProfile = async () => {
    router.push("/" + projectData.data.sender[0].name.toLowerCase());
  };

  const processReject = async () => {
    let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    let connection = new Connection(rpcUrl, {
      confirmTransactionInitialTimeout: 120000,
    });
    const env = new anchor.AnchorProvider(connection, wallet!, {
      preflightCommitment: "processed",
    });
    let userConn: UserConn = new UserConn(env, web3Consts.programID);

    console.log("projectData.data.key", projectData.data.key);

    let result = await userConn.burnToken(
      new anchor.web3.PublicKey(projectData.data.key),
    );
    console.log(result);
    if (result.Err) {
      setReqestLoader(false);
      return;
    }

    await internalClient.post("/api/project/update-profile", {
      wallet: projectData.address,
      projectkey: projectData.data.project[0].key,
      type: "reject",
    });
    setConnectionStatus(2);
    setBagsNotify({
      message: "The team request has been burned",
      type: "danger-container",
    });
    projectData.onRefresh();
  };

  const connectionAction = async (type: any) => {
    try {
      setReqestLoader(true);

      if (type === "reject") {
        setBagsRequest({
          module: "teams",
          data: projectData.data.key,
        });
      } else {
        await internalClient.post("/api/project/update-profile", {
          wallet: projectData.address,
          projectkey: projectData.data.project[0].key,
          type,
        });
        setConnectionStatus(1);
        setReqestLoader(false);
        setBagsNotify({
          message: "The team request accepted successfully",
          type: "success-container",
        });
        projectData.onRefresh();
      }
    } catch (error) {
      setReqestLoader(false);
    }
  };

  if (!projectData) return <></>;

  return (
    <div className="flex bg-[#2E3C4E80] bg-opacity-40 px-4 py-2 rounded-2xl cursor-pointer mb-4 relative overflow-hidden">
      <div className="self-center max-w-[30%] mr-4">
        <div
          className="relative w-[100px] h-[100px] cursor-pointer"
          onClick={gotoDetails}
        >
          <Image
            src={projectData.data.project[0].image}
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
              {projectData.data.project[0].name}
            </span>{" "}
            • {projectData.data.project[0].symbol}
          </p>
        </div>

        <div className="my-4">
          <p
            className="text-white text-base text-with-ellipsis max-w-[70%] line-clamp-2 cursor-pointer"
            onClick={gotoProfile}
          >
            from @{projectData.data.sender[0].name}
          </p>
        </div>

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
      </div>

      <div className="bg-[#0F015E] absolute right-[-10px] top-[-4px] rounded-2xl pl-4 pr-6 py-2 text-xs font-normal">
        {projectData.data.role}
      </div>
    </div>
  );
};

export default TeamItem;
