import React from "react";
import { useAtom } from "jotai";

import HamburgerIcon from "@/assets/icons/HamburgerIcon";
import { isDrawerOpen } from "@/app/(main)/store";

const HomeMobileDrawer = () => {
  const [_, setIsDrawerOpen] = useAtom(isDrawerOpen);

  return (
    <div className="drawer">
      <input id="my-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content">
        <label
          htmlFor="my-drawer"
          className="btn drawer-button"
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
        <div className="flex flex-col menu p-8 w-80 min-h-full bg-[#09073A] text-base-content">
          <div className="flex flex-col gap-8">
            <a
              className="text-base text-white cursor-pointer"
              onClick={() => { }}
            >
              Training
            </a>


            <a
              className="text-base text-white cursor-pointer"
              onClick={() => { }}
            >
              Docs
            </a>

            <a
              className="text-base text-white cursor-pointer"
              onClick={() => { }}
            >
              Pricing
            </a>

            <a
              className="text-base text-white cursor-pointer"
              onClick={() => { }}
            >
              About
            </a>
          </div>

          <div className="h-[1px] w-[90%] bg-white mt-8" />
        </div>
      </div>
    </div>
  );
};

export default HomeMobileDrawer;
