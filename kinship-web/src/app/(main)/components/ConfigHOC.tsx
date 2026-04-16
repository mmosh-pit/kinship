"use client";
import Script from "next/script";
import { useAtom } from "jotai";

import { usePathname } from "next/navigation";
import { settings } from "@/app/(main)/store";

const ConfigHOC = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const [isOnSettings] = useAtom(settings);

  const getClassName = () => {
    if (pathname.includes("create_") || pathname.includes("create/coins"))
      return "bg-without-picture";

    if (pathname.includes("create") || pathname.includes("communities"))
      return "common-bg";

    if (pathname === "/tos" || pathname === "/privacy") {
      return "bg-tos";
    }

    if (pathname !== "/coins" || isOnSettings) {
      return "bg-profile";
    }

    return "common-bg";
  };

  return (
    <>
      <Script
        async
        strategy="afterInteractive"
        type="text/javascript"
        src="https://telegram.org/js/telegram-widget.js?22"
      ></Script>
      <Script
        async
        strategy="beforeInteractive"
        type="text/javascript"
        src={`https://www.google.com/recaptcha/enterprise.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_KEY}`}
      ></Script>

      <div className={`${getClassName()} flex flex-col h-full`}>{children}</div>
    </>
  );
};

export default ConfigHOC;
