"use client";
import React from "react";
import Button from "../common/Button";
import { data } from "@/app/(main)/store";
import { useAtom } from "jotai";
import client from "@/app/(main)/lib/httpClient";

const TelegramApp = () => {
  const [currentUser, setCurrentUser] = useAtom(data);

  const [isLoading, setIsLoading] = React.useState(false);

  const executeLogin = () => {
    window.Telegram.Login.auth(
      {
        bot_id: process.env.NEXT_PUBLIC_BOT_TOKEN,
        request_access: true,
      },
      async (data: any) => {
        if (!data.id) return;

        const telegramData = {
          id: data.id,
          firstName: data.first_name,
          username: data.username,
        };

        await client.post("/telegram", telegramData);

        setCurrentUser((prev) => ({ ...prev!, telegram: telegramData }));
      },
    );
  };

  const removeTelegram = React.useCallback(async () => {
    setIsLoading(true);

    await client.delete("/telegram");

    setCurrentUser((prev) => ({ ...prev!, telegram: null }));

    setIsLoading(false);
  }, []);

  return (
    <div
      className={`flex flex-col justify-center items-center md:min-w-[60%] min-w-[80%] my-2 bg-[#03000754] backdrop-filter backdrop-blur-[8px] rounded-lg p-6 min-h-[200px] mt-12 ${currentUser?.telegram?.id && "border-[1px] border-[#FF00AE59]"}`}
    >
      {!currentUser?.telegram?.id && (
        <Button
          size="large"
          title="Connect a Telegram Account"
          isLoading={isLoading}
          action={executeLogin}
          isPrimary
        />
      )}

      {!!currentUser?.telegram?.id && (
        <div className="w-full h-full flex flex-col justify-between items-center rounded-lg py-2 px-2">
          <div className="flex flex-col items-center">
            <p className="text-base text-white">
              🟢{" "}
              <span className="underline text-base text-white">
                Telegram username
              </span>
            </p>
            <p className="text-sm text-white ml-2">
              @{currentUser!.telegram.username}
            </p>
          </div>

          <button
            className="border-[1px] border-white rounded-lg px-4 py-2 cursor-pointer self-center"
            onClick={() => removeTelegram()}
          >
            <p className="text-base text-white">Disconnect</p>
          </button>
        </div>
      )}
    </div>
  );
};

export default TelegramApp;
