import { data, UserStatus, status } from "@/app/(main)/store";
import axios from "axios";
import { useAtom } from "jotai";
import React from "react";

const WithTelegramNoAccount = () => {
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const [_, setUserStatus] = useAtom(status);
  const [userData] = useAtom(data);

  const checkForTelegramAccount = React.useCallback(async () => {
    const user = await axios.get(
      `/api/get-bot-user?id=${userData?.telegram?.id}`,
    );

    if (user.data) {
      setUserStatus(UserStatus.noTwitter);
    }

    clearInterval(intervalRef.current!);
  }, []);

  const startChecking = React.useCallback(() => {
    const interval = setInterval(() => {
      checkForTelegramAccount();
    }, 2000);
    intervalRef.current = interval;
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center mt-6">
      <div className="md::max-w-[40%] max-w-[90%]">
        <h3 className="text-center text-white font-goudy font-normal mb-12">
          Activate the Bot
        </h3>
        <p className="text-center">
          Activate our Telegram bot to receive messages and guidance along your
          journey.
        </p>
      </div>

      <div className="mt-8" onClick={startChecking}>
        <a
          className="bg-[#CD068E] py-4 px-4 rounded-md flex items-center"
          href="https://t.me/MMOSHBot"
          target="_blank"
        >
          <p className="text-white text-lg">Activate Bot</p>
        </a>
      </div>
    </div>
  );
};

export default WithTelegramNoAccount;
