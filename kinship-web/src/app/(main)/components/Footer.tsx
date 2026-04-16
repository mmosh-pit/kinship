"use client";

import KinshipMainIcon from "@/assets/icons/KinshipMainIcon";
import { usePathname } from "next/navigation";

const Footer = () => {
  const pathname = usePathname();

  if (
    ["/login", "/sign-up", "/forgot-password", "/preview"].includes(pathname)
  ) {
    return <></>;
  }

  return (
    <footer className="flex flex-col items-start pb-12 md:px-16 lg:px-32 px-8 pt-8">
      <div className="w-full flex justify-between">
        <div className="w-[25%]">
          <KinshipMainIcon />
        </div>

        <div className="w-full flex justify-around">
          <a
            href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/privacy`}
            className="text-white text-base"
          >
            Privacy
          </a>

          <a
            href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/tos`}
            className="text-white text-base"
          >
            Terms and Conditions
          </a>
        </div>

        <div className="w-[25%]" />
      </div>

      <div className="flex flex-col mt-12">
        <p className="text-sm">
          © 2025 Kinship Bots Club. All Rights Reserved.
        </p>
        <p className="text-sm">
          Kinship Bots™ and Where AI Belongs™ are trademarks of
        </p>
        <p className="text-sm">Kinship Bots Club.</p>
      </div>
    </footer>
  );
};

export default Footer;
