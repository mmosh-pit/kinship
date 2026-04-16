"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import BotIcon from "@/assets/icons/BotIcon";

function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

const ProjectCard = (projectData: any) => {
  const router = useRouter();
  if (!projectData) return <></>;

  return (
    <div
      className="flex bg-[#1E1D56] bg-opacity-40 px-6 py-4 rounded-3xl cursor-pointer"
      onClick={() => {
        router.push(
          `${process.env.NEXT_PUBLIC_APP_MAIN_URL}/bots/${projectData.data.symbol.toLowerCase()}`,
        );
      }}
    >
      <div className="self-center max-w-[30%] 2xl:mr-8 mr-4">
        <div className="relative w-[7vmax] h-[7vmax]">
          <Image
            src={projectData.data.image}
            alt="Profile Image"
            className="rounded-md"
            layout="fill"
          />
        </div>
      </div>

      <div className="w-full flex flex-col justify-between pt-2 pl-2">
        <div className="flex items-center">
          <p className="text-white 2xl:text-lg text-base underline mr-2">
            {" "}
            <span className="font-bold text-white 2xl:text-lg text-base">
              {projectData.data.name}
            </span>{" "}
            • {projectData.data.symbol}
          </p>
          <BotIcon />
        </div>

        <div className="2xl:my-4 my-3">
          <p className="text-white 2xl:text-base text-sm text-with-ellipsis max-w-[70%]">
            {projectData.data.desc}
          </p>
        </div>

        <div className="w-full flex justify-between items-end">
          <div className="flex">
            <p className="text-sm">
              By{" "}
              <span className="text-sm underline">
                {projectData.data.creatorUsername}
              </span>{" "}
              •{" "}
              <span className="text-sm underline">
                {capitalizeFirstLetter(
                  projectData.data.privacy != null &&
                    projectData.data.privacy !== ""
                    ? projectData.data.privacy
                    : "private",
                )}
              </span>
            </p>
          </div>

          <button className="self-start rounded-full h-8 bg-[#FF00AE] flex justify-center items-center px-4 py-2">
            <p className="2xl:text-base text-sm text-white">Activate</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
