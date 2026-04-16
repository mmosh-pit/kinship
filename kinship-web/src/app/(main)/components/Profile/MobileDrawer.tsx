import React from "react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";

import HamburgerIcon from "@/assets/icons/HamburgerIcon";
import { data, isDrawerOpen } from "@/app/(main)/store";

const MobileDrawer = () => {
  const router = useRouter();
  const [_, setIsDrawerOpen] = useAtom(isDrawerOpen);
  const [currentUser] = useAtom(data);

  return (
    <div className="drawer w-[15%]">
      <input id="my-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content block">
        <label
          htmlFor="my-drawer"
          className="padding-0 transparent"
          onClick={() => setIsDrawerOpen(true)}
        >
          <HamburgerIcon />
        </label>
      </div>

      <div className="drawer-side z-10">
        <label
          htmlFor="my-drawer"
          aria-label="close sidebar"
          className="drawer-overlay"
          onClick={() => setIsDrawerOpen(false)}
        ></label>
        <div className="flex flex-col menu p-4 w-80 min-h-full bg-[#09073A] text-base-content">
          <div className="flex flex-col">
            <a
              className="text-base text-white cursor-pointer"
              onClick={() => {
                router.push("/chat");
              }}
            >
              Chat
            </a>

            {/*}
            <div className="lg:my-4 md:my-2" />

            <a
              className="text-base text-white cursor-pointer"
              onClick={() => {
                router.push("/bots");
              }}
            >
              Bots
            </a>
            {*/}

            <div className="lg:my-4 my-2" />

            <a
              className="text-base text-white cursor-pointer"
              onClick={() => router.push("/coins")}
            >
              Coins
            </a>

            <div className="lg:my-4 my-2" />

            <a className="text-base text-white cursor-pointer">Offers</a>

            <div className="lg:my-4 my-2" />

            <a className="text-base text-white cursor-pointer">Launchpad</a>

            <div className="lg:my-4 my-2" />

            <a
              className="text-base text-white cursor-pointer"
              onClick={() => router.push("/members")}
            >
              Members
            </a>

            {currentUser?.role === "wizard" && (
              <>
                <div className="lg:my-4 my-2" />

                <a
                  className="flex items-center cursor-pointer relative "
                  onClick={() => router.push("/studio")}
                >
                  <p className="text-base text-white font-semibold">Studio</p>
                </a>
              </>
            )}

            <div className="lg:my-4 my-2" />
            <a
              className="text-base text-white cursor-pointer"
              onClick={() => {
                router.push("/wallet");
              }}
            >
              Wallet
            </a>

            <div className="lg:my-4 my-2" />

            <a
              className="text-base text-white cursor-pointer"
              href="https://docs.kinship.systems"
              target="_blank"
            >
              Docs
            </a>
          </div>

          {currentUser?.profile?.image && (
            <>
              <div className="mt-2" />
              <a
                className="text-sm text-white"
                onClick={() =>
                  router.push(`/${currentUser?.profile?.username}`)
                }
              >
                My Profile
              </a>
              <div className="my-2" />
            </>
          )}

          <div className="h-[1px] w-[90%] bg-white my-4" />

          <a
            className="text-sm text-white"
            onClick={() => router.push("/settings")}
          >
            Settings
          </a>
        </div>
      </div>
    </div>
  );
};

export default MobileDrawer;
