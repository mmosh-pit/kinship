import React from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { data } from "@/app/(main)/store";

const Tabs = () => {
  const router = useRouter();
  const [currentUser] = useAtom(data);

  return (
    <div className="flex justify-center items-center rounded-full border-[#FFFFFF47] border-[1px] bg-[#FFFFFF0F] px-4 py-2">
      <a
        className="text-base text-white cursor-pointer"
        onClick={() => {
          router.push("/chat");
        }}
      >
        Chat
      </a>

      {/*}
      <div className="lg:mx-4 md:mx-2" />

      <a
        className="text-base text-white cursor-pointer"
        onClick={() => {
          router.push("/bots");
        }}
      >
        Bots
      </a>
      {*/}

      <div className="lg:mx-4 md:mx-2" />

      <a
        className="text-base text-white cursor-pointer"
        onClick={() => router.push("/coins")}
      >
        Coins
      </a>

      <div className="lg:mx-4 md:mx-2" />

      <a className="text-base text-white cursor-pointer">Offers</a>

      <div className="lg:mx-4 md:mx-2" />

      <a
        className="text-base text-white cursor-pointer"
        onClick={() => router.push("/launchpad")}
      >
        Launchpad
      </a>

      <div className="lg:mx-4 md:mx-2" />

      <a
        className="text-base text-white cursor-pointer"
        onClick={() => router.push("/members")}
      >
        Members
      </a>

      {currentUser?.role === "wizard" && (
        <>
          <div className="lg:mx-4 md:mx-2" />

          <a
            className="flex items-center cursor-pointer relative "
            onClick={() => router.push("/studio")}
          >
            <p className="text-base text-white font-semibold">Studio</p>
          </a>
        </>
      )}

      <div className="lg:mx-4 md:mx-2" />
      <a
        className="text-base text-white cursor-pointer"
        onClick={() => {
          router.push("/wallet");
        }}
      >
        Wallet
      </a>

      <div className="lg:mx-4 md:mx-2" />
      <a
        className="text-base text-white cursor-pointer"
        href="https://docs.kinship.systems"
        target="_blank"
      >
        Docs
      </a>
    </div>
  );
};

export default Tabs;
