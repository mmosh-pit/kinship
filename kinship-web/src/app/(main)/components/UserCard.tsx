import Image from "next/image";
import React from "react";

import TwitterDarkIcon from "@/assets/icons/TwitterDarkIcon";
import TelegramDarkIcon from "@/assets/icons/TelegramDarkIcon";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { User } from "@/app/(main)/models/user";

type Props = {
  user: User;
  isHome: boolean;
  currentuser?: User;
};

const UserCard = ({ user, currentuser }: Props) => {
  const [connectionStatus, setConnectionStatus] = React.useState(0);
  const [hasRequest, setHasRequest] = React.useState(false);
  const [requestloader, setReqestLoader] = React.useState(false);

  React.useEffect(() => {
    setConnectionStatus(user.profile.connection ? user.profile.connection : 0);
    setHasRequest(user.profile.request ? user.profile.request : false);
  }, [user.wallet]);

  const connectionAction = async (type: any) => {
    if (!currentuser) {
      return;
    }
    try {
      setReqestLoader(true);
      if (type === "accept") {
        await internalClient.post("/api/connections/send", {
          sender: user.wallet,
          receiver: currentuser.wallet,
          badge: "",
          status: 4,
        });
        if (connectionStatus == 2) {
          setConnectionStatus(4);
        } else {
          setConnectionStatus(3);
        }
      } else {
        await internalClient.post("/api/connections/send", {
          sender: user.wallet,
          receiver: currentuser.wallet,
          badge: "",
          status: 5,
        });
        setConnectionStatus(0);
      }
      setHasRequest(false);
      setReqestLoader(false);
    } catch (error) {
      setReqestLoader(false);
    }
  };

  let image = user.profile.image;
  let name = user.profile.name;
  let username = user.profile.username;
  let bio = user.profile.bio;

  if (!image) {
    image = user.guest_data.picture;
  }

  if (!name) {
    name = user.guest_data.name;
    if (!name) {
      name = user.name;
    }
  }

  if (!username) {
    username = user.guest_data.username;
  }

  if (!bio) {
    bio = user.guest_data.bio;
  }

  return (
    <div
      className="flex bg-[#09073A] px-4 py-4 rounded-2xl"
      id={user.wallet && "member-container-home"}
    >
      <div className="self-center max-w-[30%] mr-8">
        <div className="relative w-[6vmax] h-[6vmax]">
          <Image
            src={image}
            alt="Profile Image"
            className="rounded-full"
            layout="fill"
          />
        </div>
      </div>

      <div className="w-full flex flex-col">
        <div className="w-full flex justify-between items-center">
          <p className="text-white text-lg">
            {name} •{" "}
            <p className="text-base text-blue underline">@{username}</p>
          </p>

          <div className="rounded-lg enjoyer-indicator p-2">
            <p className="text-base text-white">Enjoyer</p>
          </div>
        </div>

        <div className="my-4">
          <p className="text-white text-base text-with-ellipsis">{bio}</p>
        </div>

        <div>
          {user.telegram?.username && (
            <div className="flex items-center">
              <TelegramDarkIcon />

              <a
                target="_blank"
                href={`https://t.me/${user.telegram.username}`}
                className="text-base ml-4 underline text-[#9493B2]"
              >
                https://t.me/{user.telegram.username}
              </a>
            </div>
          )}

          {user.twitter?.username && (
            <div className="flex items-center mt-2">
              <TwitterDarkIcon />

              <a
                target="_blank"
                href={`https://twitter.com/${user.twitter.username}`}
                className="text-base ml-4 underline text-[#9493B2]"
              >
                https://twitter.com/{user.twitter.username}
              </a>
            </div>
          )}
        </div>

        {user.profile.request && (
          <div className="flex justify-end">
            {requestloader && (
              <button className="btn btn-xs bg-[#372E4F] rounded-md text-white mx-2.5">
                processing...
              </button>
            )}

            {!requestloader && hasRequest && (
              <>
                <p className="text-white text-sm">Request</p>
                <button
                  className="btn btn-xs bg-[#372E4F] rounded-md text-white mx-2.5"
                  onClick={() => {
                    connectionAction("accept");
                  }}
                >
                  Accept
                </button>
                <button
                  className="btn btn-xs bg-[#372E4F] rounded-md text-white"
                  onClick={() => {
                    connectionAction("reject");
                  }}
                >
                  Reject
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex justify-between">
          <div className="flex flex-col">
            <p className="text-sm text-white font-bold">Connections</p>
            <div className="flex justify-start">
              <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg w-[30%]">
                <p className="text-white text-xs font-bold">All</p>
                <p className="text-white text-xs">00</p>
              </div>

              <div className="mx-1" />

              <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg w-[30%]">
                <p className="text-white text-xs font-bold">Guild</p>
                <p className="text-white text-xs">00</p>
              </div>

              <div className="mx-1" />

              <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg w-[30%]">
                <p className="text-white text-xs font-bold">Clan</p>
                <p className="text-white text-xs">00</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <p className="text-sm text-white font-bold">Earnings</p>
            <div className="flex justify-start">
              <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg w-[30%]">
                <p className="text-white text-xs font-bold">All</p>
                <p className="text-white text-xs">00.00USDC</p>
              </div>

              <div className="mx-1" />

              <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg w-[30%]">
                <p className="text-white text-xs font-bold">Creator</p>
                <p className="text-white text-xs">00.00USDC</p>
              </div>

              <div className="mx-1" />

              <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg w-[30%]">
                <p className="text-white text-xs font-bold">Promoter</p>
                <p className="text-white text-xs">00.00USDC</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserCard;
