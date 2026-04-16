"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Community } from "@/app/(main)/models/community";

type Props = {
  community: Omit<Community, "coin">;
};

const CommunityCard = ({ community }: Props) => {
  const router = useRouter();
  return (
    <div
      className="flex bg-[#030007] bg-opacity-40 px-4 py-2 rounded-2xl border-[1px] border-[#353485] cursor-pointer"
      onClick={() => {
        router.push(
          `${process.env.NEXT_PUBLIC_APP_MAIN_URL}/projects/${community.symbol.toLowerCase()}`,
        );
      }}
    >
      <div className="self-center max-w-[30%] mr-8">
        <div className="relative w-[4vmax] h-[4vmax]">
          <Image
            src={community.image}
            alt="Profile Image"
            className="rounded-lg"
            layout="fill"
          />
        </div>
      </div>

      <div className="w-full flex flex-col">
        <div>
          <p className="text-white text-lg">{community.name} • </p>
          <p className="text-base">{community.symbol}</p>
        </div>

        <div className="my-4">
          <p className="text-white text-base text-with-ellipsis">
            {community.description}
          </p>
        </div>

        <div className="flex flex-col mt-4">
          <div className="flex max-w-[5vmax] items-center rounded-lg bg-[#353485B2] px-2">
            <p className="text-sm text-white">
              <span className="font-bold text-sm text-white mr-4">TVL</span>
              123 USDC
            </p>
          </div>

          <a
            className="text-sm text-[#FF00C7] underline"
            href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/communities/${community.symbol.toLowerCase()}`}
          >
            {community.name}
          </a>
        </div>
      </div>
    </div>
  );
};

export default CommunityCard;
