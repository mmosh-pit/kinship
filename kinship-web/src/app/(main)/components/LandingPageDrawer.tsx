import React from "react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";

import HamburgerIcon from "@/assets/icons/HamburgerIcon";
import { isDrawerOpen } from "@/app/(main)/store";
import type { NavItem } from "@/app/(main)/page";

interface Props {
  scrollToId: (id: string) => void;
  navItems: NavItem[];
}

const LandingPageDrawer = ({ scrollToId, navItems }: Props) => {
  const [, setIsDrawerOpen] = useAtom(isDrawerOpen);
  const router = useRouter();

  const handleClick = (action?: () => void) => {
    action?.();
    setIsDrawerOpen(false);
  };

  return (
    <div className="drawer">
      <input id="my-drawer" type="checkbox" className="drawer-toggle" />

      <div className="drawer-content">
        <label
          htmlFor="my-drawer"
          className="btn drawer-button bg-transparent border-none"
          onClick={() => setIsDrawerOpen(true)}
        >
          <HamburgerIcon />
        </label>
      </div>

      <div className="drawer-side z-50">
        <label
          htmlFor="my-drawer"
          className="drawer-overlay"
          aria-label="close sidebar"
          onClick={() => setIsDrawerOpen(false)}
        />

        <div className="flex flex-col menu p-8 w-80 min-h-full bg-[#09073A] text-base-content">
          <div className="flex flex-col gap-8">
            {navItems.map((item, i) => (
              <label
                key={i}
                htmlFor="my-drawer"
                className="text-base text-white cursor-pointer"
                onClick={() =>
                  handleClick(() =>
                    item.actionType === "scroll"
                      ? scrollToId(item.sectionId ?? "")
                      : router.push(item.url ?? "/")
                  )
                }
              >
                {item.label}
              </label>
            ))}
          </div>

          <div className="h-[1px] w-[90%] bg-white mt-8" />
        </div>
      </div>
    </div>
  );
};

export default LandingPageDrawer;
