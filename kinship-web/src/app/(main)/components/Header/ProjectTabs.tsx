import React from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useAtom } from "jotai";
import { settings } from "@/app/(main)/store";

const ProjectTabs = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [isOnSettings] = useAtom(settings);

  const getHeaderBackground = React.useCallback(() => {
    let defaultClass =
      "w-full flex justify-center items-center pb-6 pt-2 px-8 relative z-0 ";

    if (pathname.includes("create")) {
      defaultClass += "bg-black bg-opacity-[0.56] backdrop-blur-[10px]";
    } else if (pathname !== "/" || isOnSettings) {
      defaultClass += "bg-white bg-opacity-[0.07] backdrop-blur-[2px]";
    } else if (pathname === "/" && !isOnSettings) {
      defaultClass += "bg-black bg-opacity-[0.56] backdrop-blur-[2px]";
    }

    return defaultClass;
  }, [pathname]);

  return (
    <div className={getHeaderBackground()}>
      <div className="lg:w-[50%] md:w-[60%] flex justify-center">
        <div
          className="relative w-[1.5vmax] h-[1.5vmax] cursor-pointer"
          onClick={() => router.replace("/projects/ptv")}
        >
          <Image
            src="https://storage.googleapis.com/mmosh-assets/ptv_logo.png"
            alt="logo"
            layout="fill"
          />
        </div>

        <div className="mx-6" />

        <a
          className="text-base text-white cursor-pointer self-center"
          onClick={() => router.replace("/projects/ptv")}
        >
          Pump the Vote
        </a>

        <div className="mx-6" />

        <a
          onClick={() => router.replace("/projects/ptv/candidates")}
          className="text-base text-white cursor-pointer self-center"
        >
          Candidates
        </a>

        <div className="mx-6" />

        <a
          className="text-base text-white cursor-pointer self-center"
          onClick={() => {
            router.push("/projects/ptv/bounties");
          }}
        >
          Bounties
        </a>
      </div>
    </div>
  );
};

export default ProjectTabs;
