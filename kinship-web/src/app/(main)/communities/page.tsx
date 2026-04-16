"use client";
import React from "react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";

import Button from "../components/common/Button";
import SearchIcon from "@/assets/icons/SearchIcon";
import TelegramMagentaIcon from "@/assets/icons/TelegramMagentaIcon";
import { isDrawerOpen } from "@/app/(main)/store";

const Page = () => {
  const router = useRouter();

  const [isDrawerShown] = useAtom(isDrawerOpen);

  const containerRef = React.useRef<any>(null);
  const fetching = React.useRef(false);
  const lastPageTriggered = React.useRef(false);

  const [currentPage, setCurrentPage] = React.useState(0);
  const [communities, setCommunities] = React.useState<GroupCommunity[]>([]);
  const [searchText, setSearchText] = React.useState("");

  const getCommunities = React.useCallback(
    async (page: number) => {
      const response = await axios.get(
        `/api/get-groups-communities?search=${searchText}&skip=${page * 50}`,
      );

      setCommunities(response.data);
      setCurrentPage(page + 1);
    },
    [searchText],
  );

  const handleScroll = () => {
    if (!containerRef.current) return;
    if (
      containerRef.current.scrollHeight - containerRef.current.scrollTop <=
        containerRef.current.clientHeight + 50 &&
      !lastPageTriggered.current &&
      !fetching.current
    ) {
      getCommunities(currentPage);
    }
  };

  React.useEffect(() => {
    getCommunities(0);
  }, [searchText]);

  return (
    <div
      className={`background-content flex flex-col ${isDrawerShown ? "z-[-1]" : ""} relative`}
    >
      <div className="w-full flex justify-between items-end my-16 px-12">
        <div className="w-[33%]" />

        <div className="flex flex-col items-center w-[33%]">
          <h6>Community Directory</h6>

          <div className="w-full flex justify-between mt-4">
            <div className="w-full flex items-center bg-[#010623] bg-opacity-[0.15] border-[1px] border-[#C2C2C229] rounded-full p-1 backdrop-filter backdrop-blur-[10px]">
              <button className="flex bg-[#5A00FF] rounded-full p-2 items-center">
                <SearchIcon />
              </button>

              <input
                placeholder="Type your search terms"
                className="ml-4 w-full bg-transparent outline-none"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="w-[33%] flex justify-end">
          <div className="max-w-[250px]">
            <Button
              isLoading={false}
              size="large"
              title="Create New Community"
              action={() => {
                router.push("/communities/create");
              }}
              isPrimary
            />
          </div>
        </div>
      </div>

      <div
        className="w-full px-4 py-2 grid gap-4 grid-cols-auto xs:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {communities.map((community) => (
          <div
            className="relative grid w-full flex justify-between bg-[#030007] bg-opacity-40 px-4 py-4 rounded-2xl cursor-pointer"
            key={`${community.symbol}-${community.name}`}
            onClick={() => {
              router.push(`/communities/${community.symbol}`);
            }}
          >
            <div className="flex flex-col">
              <div className="w-full flex justify-center mx-4 mb-2">
                <div className="self-center relative md:w-[8vmax] md:h-[5vmax] w-[8vmax] h-[6vmax]">
                  <Image
                    src={community.passImage}
                    alt="Profile Image"
                    className="rounded-full"
                    layout="fill"
                  />
                </div>

                <div className="flex flex-col ml-6">
                  <div className="flex flex-col my-2">
                    <p className="text-base text-white">{community.name}</p>
                    <p className="text-sm underline">{community.symbol}</p>
                  </div>

                  <div className="my-2">
                    <p className="text-base text-white">
                      {community.description}
                    </p>
                  </div>

                  <div className="flex flex-col my-2">
                    <div className="flex items-center">
                      <TelegramMagentaIcon width={12} height={12} />

                      <p className="text-sm text-[#FF00C7] ml-1">Telegram</p>
                    </div>

                    <div className="flex flex-wrap">
                      {community.groups.map((group) => (
                        <a
                          className="text-sm underline mx-1"
                          href={`https://t.me/${group.handle}`}
                          target="_blank"
                        >
                          t.me/{group.handle}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Page;
