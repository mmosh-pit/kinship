import Image from "next/image";
import React from "react";
import axios from "axios";
import { useAtom } from "jotai";
import { FrostWallet } from "@/utils/frostWallet";
import { User } from "@/app/(main)/models/user";
import { data } from "@/app/(main)/store";
import { useRouter } from "next/navigation";
import { Connection } from "@solana/web3.js";
import useWallet from "@/utils/wallet";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { bagsConfirmation, bagsModalAck, bagsNotifier } from "@/app/(main)/store/bags";
import internalClient from "@/app/(main)/lib/internalHttpClient";

type Props = {
  user: any;
  wallet?: FrostWallet;
  currentuser?: User;
  badge: String;
  onRefresh: () => void;
};

const ConnectionItem = ({
  user,
  wallet,
  currentuser,
  onRefresh,
  badge,
}: Props) => {
  const router = useRouter();
  const rendered = React.useRef(false);
  const [loader, setLoader] = React.useState(false);
  const [___, setCurrentUser] = useAtom(data);
  const [requestloader, setReqestLoader] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState(0);
  const [bagsRequest, setBagsRequest] = useAtom(bagsConfirmation);
  const [bagsAck, setBagsAck] = useAtom(bagsModalAck);
  const [_bagsNotify, setBagsNotify] = useAtom(bagsNotifier);

  React.useEffect(() => {
    if (!rendered.current) {
      rendered.current = true;
    }
    setConnectionStatus(user.status);
  }, []);

  React.useEffect(() => {
    if (!bagsRequest) {
      setReqestLoader(false);
    }
  }, [bagsRequest]);

  React.useEffect(() => {
    if (bagsAck) {
      console.log("bagsAck ", bagsAck);
      if (bagsAck.module == "connections" && bagsAck.data == badge) {
        console.log("testing 1");
        setBagsAck(null);

        processBurn();
      } else if (bagsAck.module == "burn" && bagsAck.data == badge) {
        setBagsAck(null);
        processUnFollow();
      }
    }
  }, [bagsAck]);

  const processBurn = async () => {
    console.log("testing 2");
    if (!currentuser) {
      return;
    }

    await internalClient.post("/api/connections/send", {
      sender: user.sender[0].wallet,
      receiver: currentuser.wallet,
      badge: "",
      status: 5,
    });
    setConnectionStatus(2);
    setBagsRequest(null);
    setBagsNotify({
      message: "The connection has been rejected",
      type: "danger-container",
    });
    onRefresh();
  };

  const processUnFollow = async () => {
    if (!currentuser) {
      return;
    }
    await internalClient.post("/api/connections/send", {
      sender: user.sender[0].wallet,
      receiver: currentuser.wallet,
      badge: "",
      status: 3,
    });
    setConnectionStatus(2);
    setBagsRequest(null);
    setBagsNotify({
      message: "The connection has been burned",
      type: "danger-container",
    });
    onRefresh();
  };

  const connectionAction = async (type: any) => {
    if (!currentuser) {
      return;
    }
    try {
      setReqestLoader(true);
      if (type === "accept") {
        await internalClient.post("/api/connections/send", {
          sender: user.sender[0].wallet,
          receiver: currentuser.wallet,
          badge: "",
          status: 4,
        });
        setConnectionStatus(1);
        setReqestLoader(false);
        onRefresh();
        setBagsNotify({
          message: "You've accepted new Connection!",
          type: "success-container",
        });
      } else if (type === "unfollow") {
        setBagsRequest({
          module: "burn",
          data: badge,
        });
      } else {
        setBagsRequest({
          module: "connections",
          data: badge,
        });
      }
    } catch (error) {
      setReqestLoader(false);
    }
  };

  React.useEffect(() => {
    console.log("current user ", connectionStatus);
  }, [connectionStatus]);

  const openExplorer = (item: any) => {
    window.open(
      "https://solscan.io/account/" + item + "?cluster=mainnet",
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="flex bg-[#2E3C4E80] px-4 py-2 rounded-2xl mb-4 relative overflow-hidden">
      <div className="self-center max-w-[30%] mr-4">
        <div
          className="relative w-[100px] h-[100px] cursor-pointer"
          onClick={() => {
            router.push("/" + user.sender[0].name.toLowerCase());
          }}
        >
          <Image
            src={user.sender[0].profile.image}
            alt="Bot Image"
            className="rounded-md object-cover"
            layout="fill"
          />
        </div>
      </div>
      <div className="w-full flex flex-col">
        <div className="flex items-center">
          <p
            className="text-white text-base underline cursor-pointer"
            onClick={() => {
              router.push("/" + user.sender[0].name.toLowerCase());
            }}
          >
            {" "}
            <span className="font-bold text-white text-base capitalize">
              {user.sender[0].profile.name}
            </span>{" "}
            • @{user.sender[0].profile.username}
          </p>
        </div>

        <div className="my-2">
          <p className="text-white text-sm text-with-ellipsis max-w-[70%] line-clamp-2">
            {user.sender[0].profile.bio}
          </p>
        </div>

        <div className="my-4">
          <div className="flex justify-between">
            <p
              className="text-white text-xs underline cursor-pointer"
              onClick={() => {
                openExplorer(user.sender[0].wallet);
              }}
            >
              View on Solscan
            </p>
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

            {!requestloader && connectionStatus == 1 && (
              <div className="flex">
                <button
                  className="btn btn-xs bg-[#7295C399] rounded-md text-white mx-2.5 font-normal border-b-[2px] border-b-[rgba(255,255,255,0.56)] border-l-[1px] border-l-[rgba(255,255,255,0.56)] border-r-[2px] border-r-[rgba(255,255,255,0.56)]"
                  onClick={() => {
                    connectionAction("unfollow");
                  }}
                >
                  Burn
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
      </div>
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
    </div>
  );
};

export default ConnectionItem;
