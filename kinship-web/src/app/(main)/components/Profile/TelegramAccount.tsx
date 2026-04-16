import React from "react";
import axios from "axios";

import { User } from "@/app/(main)/models/user";
import TelegramMagentaIcon from "@/assets/icons/TelegramMagentaIcon";
import useWallet from "@/utils/wallet";
import internalClient from "@/app/(main)/lib/internalHttpClient";

type Props = {
  isMyProfile: boolean;
  userData: User | undefined;
  setUserData: any;
};

const TelegramAccount = ({ userData, setUserData, isMyProfile }: Props) => {
  const wallet = useWallet();

  const executeLogin = () => {
    window.Telegram.Login.auth(
      {
        bot_id: process.env.NEXT_PUBLIC_BOT_TOKEN,
        request_access: true,
      },
      async (data: any) => {
        if (!data.id) return;

        const user = await axios.get(`/api/get-bot-user?id=${data.id}`);

        const telegramData = {
          id: data.id,
          firstName: data.first_name,
          username: data.username,
          points: user.data?.points || 0,
        };

        await internalClient.put("/api/update-wallet-data", {
          wallet: wallet!.publicKey,
          field: "telegram",
          value: telegramData,
        });

        if (!user.data) {
          setUserData((prev: any) => ({
            ...prev,
            telegram: telegramData,
          }));
          return;
        }

        setUserData((prev: any) => ({
          ...prev,
          telegram: telegramData,
        }));
      },
    );
  };

  return (
    <div className="relative flex flex-col xl:max-w-[25%] lg:max-w-[30%] md:max-w-[35%] sm:max-w-[50%] max-w-[65%]">
      <div className="flex items-center">
        <TelegramMagentaIcon />
        <p className="text-lg text-white ml-2">Telegram</p>
      </div>
      {isMyProfile && !userData?.telegram?.id && (
        <>
          <p className="text-sm leading-6 text-white">
            Connect your Telegram account to fully activate the MMOSH and{" "}
            <span id="onboarding-points-gradient">earn 200 points.</span>
          </p>
          <button
            className="rounded-full p-4 bg-[#09073A] mt-2 cursor-pointer"
            onClick={executeLogin}
          >
            Connect Telegram
          </button>
        </>
      )}
      {userData?.telegram?.id && (
        <>
          <p className="text-base text-white">
            {userData?.telegram?.firstName}
          </p>
          <a
            className="cursor-pointer"
            href={`https://t.me/${userData.telegram.username}`}
          >
            <p className="text-base">@{userData?.telegram?.username}</p>
          </a>
        </>
      )}
    </div>
  );
};

export default TelegramAccount;
