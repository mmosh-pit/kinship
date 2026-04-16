"use client";
import React from "react";
import useConnection from "@/utils/connection";
import axios from "axios";
import { useAtom } from "jotai";
import Image from "next/image";

import { init } from "@/app/(main)/lib/firebase";
import { UserStatus, data, profileFilter, status } from "@/app/(main)/store";
import { User } from "@/app/(main)/models/user";

import { Connectivity as Community } from "@/anchor/community";
import * as anchor from "@coral-xyz/anchor";
import { web3Consts } from "@/anchor/web3Consts";
import { pinFileToShadowDriveUrl } from "@/app/(main)/lib/uploadFileToShdwDrive";
import { calcNonDecimalValue } from "@/anchor/curve/utils";
import useWallet from "@/utils/wallet";
import ProfileFilters from "./ProfileFilters";
import GuildList from "../GuildList";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import useCheckDeviceScreenSize from "@/app/(main)/lib/useCheckDeviceScreenSize";

const Profile = ({ username }: { username: any }) => {
  const screenSize = useCheckDeviceScreenSize();
  const rendered = React.useRef(false);
  const wallet = useWallet();
  const [_, setUserStatus] = useAtom(status);
  const [selectedFilter] = useAtom(profileFilter);

  const connection = useConnection();

  const [userData, setUserData] = React.useState<User>();
  const [loader, setLoader] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState("");
  const [connectionStatus, setConnectionStatus] = React.useState(0);
  const [currentUser, setCurrentUser] = useAtom(data);
  const [requestloader, setReqestLoader] = React.useState(false);

  const isMobileScreen = screenSize < 1200;

  const getUserData = React.useCallback(async () => {
    let url = `/api/get-user-data?username=${username}`;
    console.log("wallet", currentUser);
    if (currentUser) {
      url = url + "&requester=" + currentUser.wallet;
    }
    const result = await axios.get(url);

    setUserData({
      ...result.data,
    });
    setConnectionStatus(
      result.data?.profile.connection ? result.data.profile.connection : 0,
    );
  }, [username, currentUser]);

  const isMyProfile = currentUser?.wallet === userData?.wallet;

  React.useEffect(() => {
    setUserStatus(UserStatus.fullAccount);
    if (!username) return;
    getUserData();
  }, [username, currentUser]);

  React.useEffect(() => {
    if (!userData) return;
  }, [userData]);

  React.useEffect(() => {
    if (!rendered.current) {
      init();
      rendered.current = true;
    }
  }, []);

  if (!userData) return <></>;

  const bannerImage =
    userData.profile?.banner !== ""
      ? userData.profile?.banner
      : userData.guest_data?.banner !== ""
        ? userData.guest_data?.banner
        : "https://storage.googleapis.com/mmosh-assets/default_banner.png";

  const profileImage =
    userData.profile?.image !== ""
      ? userData.profile?.image
      : userData.guest_data?.picture;

  return (
    <div className="background-content-full-bg flex flex-col">
      <div className="flex flex-col bg-[#181747] backdrop-blur-[6px] rounded-md relative md:mx-16 mx-2 rounded-xl px-3 pt-3 pb-12">
        <div className="md:h-[500px] h-[250px] md:m-4 m-2 mb-0 overflow-hidden relative">
          <Image
            src={bannerImage}
            alt="banner"
            className={`w-full rounded-lg ${isMobileScreen ? "object-cover" : ""}`}
            layout="fill"
          />

          {isMobileScreen && (
            <div
              className={`absolute right-[5px] bottom-[5px] px-4 py-1 creator-btn rounded-md ml-6`}
            >
              <p className={`text-black text-base`}>{"Creator"}</p>
            </div>
          )}
        </div>

        <div className="relative md:mx-8 mx-2 mb-4">
          <div className="md:w-[220px] md:h-[220px] w-[120px] h-[120px] absolute top-[-80px]">
            <Image
              src={profileImage}
              alt="Project"
              className="rounded-lg"
              layout="fill"
            />
          </div>
          <div className="lg:pl-[250px] mt-8 md:mt-20 lg:mt-0">
            <div className="lg:flex justify-between items-end mb-4">
              <div className="flex flex-col md:mt-4 mt-12 md:max-w-[60%] w-full">
                <div className="flex items-center mb-4">
                  <h5 className="font-bold text-white text-lg capitalize">
                    {userData.profile?.displayName !== ""
                      ? userData.profile?.displayName
                      : userData.guest_data?.displayName !== ""
                        ? userData.guest_data.displayName
                        : userData.name}
                  </h5>
                  <span className="font-bold text-lg text-white mx-2">•</span>
                  <p className="text-base">
                    {userData.profile?.name !== ""
                      ? `${userData.profile?.name} ${userData.profile?.lastName ?? ""}`
                      : `${userData.guest_data.name} ${userData.guest_data.lastName ?? ""}`}
                  </p>

                  <p className="ml-4 text-base text-[#FF00AE]">
                    @
                    {userData.profile?.username !== ""
                      ? userData.profile?.username
                      : userData.guest_data.username}
                  </p>

                  {!isMobileScreen && (
                    <div className={`px-4 py-1 creator-btn rounded-md ml-6`}>
                      <p className={`text-black text-base`}>Creator</p>
                    </div>
                  )}
                </div>

                <p className="text-sm">
                  {userData.profile?.bio !== ""
                    ? userData.profile?.bio
                    : userData.guest_data.bio}
                </p>
              </div>
            </div>

            {!isMobileScreen && (
              <div className="flex flex-col">
                <p className="text-base text-white font-bold">Earnings</p>
                <div className="flex justify-start items-start mt-2">
                  <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg">
                    <p className="text-white text-xs font-bold">Creator</p>
                    <p className="text-white text-xs">00.00USDC</p>
                  </div>

                  <div className="mx-1" />

                  <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg">
                    <p className="text-white text-xs font-bold">Promoter</p>
                    <p className="text-white text-xs">00.00USDC</p>
                  </div>

                  <div className="mx-1" />

                  <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg">
                    <p className="text-white text-xs font-bold">Total</p>
                    <p className="text-white text-xs">00.00USDC</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {isMobileScreen && (
            <div className="flex flex-col">
              <p className="text-base text-white font-bold">Earnings</p>
              <div className="flex justify-start items-start mt-2">
                <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg">
                  <p className="text-white text-xs font-bold">Creator</p>
                  <p className="text-white text-xs">00.00USDC</p>
                </div>

                <div className="mx-1" />

                <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg">
                  <p className="text-white text-xs font-bold">Promoter</p>
                  <p className="text-white text-xs">00.00USDC</p>
                </div>

                <div className="mx-1" />

                <div className="flex flex-col justify-center items-center bg-[#3C39BE33] bg-opacity-50 p-2 rounded-lg">
                  <p className="text-white text-xs font-bold">Total</p>
                  <p className="text-white text-xs">00.00USDC</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <ProfileFilters isGuest={!userData.wallet} />

        {!!userData.wallet && (
          <>
            {selectedFilter === 1 && (
              <GuildList
                wallet={userData.wallet}
                userName={
                  userData.profile?.username !== ""
                    ? userData.profile?.username
                    : userData.guest_data.username
                }
                isMyProfile={isMyProfile}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Profile;
