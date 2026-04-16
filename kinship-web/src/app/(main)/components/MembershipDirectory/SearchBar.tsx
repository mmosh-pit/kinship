import React from "react";
import { useAtom } from "jotai";

import SearchIcon from "@/assets/icons/SearchIcon";
import useCheckMobileScreen from "@/app/(main)/lib/useCheckMobileScreen";
import { textSearch } from "@/app/(main)/store/membership";

const SearchBar = () => {
  const isMobile = useCheckMobileScreen();
  const [localText, setLocalText] = React.useState("");

  const [selectedFilter, setSelectedFilter] = React.useState("username");

  const [_, setSearchText] = useAtom(textSearch);

  const executeSearch = () => {
    setSearchText(localText);
  };

  return (
    <div className="w-full flex flex-col items-center px-8">
      {isMobile && (
        <div className="w-[75%] flex md:items-center bg-[#010623] bg-opacity-[0.15] border-[1px] border-[#C2C2C229] rounded-full p-1 backdrop-filter backdrop-blur-[10px]">
          <button
            className="flex bg-[#5A00FF] rounded-full px-6 py-4 items-center"
            onClick={executeSearch}
          >
            <SearchIcon width={24} height={24} />

            <p className="text-white font-bold text-base ml-2.5 md:block hidden">
              Search
            </p>
          </button>

          <input
            placeholder="Type your search terms"
            className="ml-4 w-full bg-transparent outline-none"
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onKeyUp={(e) => {
              if (e.key === "Enter") {
                executeSearch();
              }
            }}
          />
        </div>
      )}
      <div className="w-full flex justify-between">
        <div className="members-filter-bar w-[33%]">
          <div className="w-full h-full flex justify-start items-stretch bg-[#0a083c] rounded-[0.5rem]">
            <div
              className={`${selectedFilter === "username" && "members-selected-filter"}`}
            >
              <button
                className={`px-4 py-2 bg-[#0a083c] h-full rounded-[0.5rem]`}
                onClick={() => setSelectedFilter("username")}
              >
                <p className="text-base text-white">Username</p>
              </button>
            </div>

            <div
              className={`${selectedFilter === "recents" && "members-selected-filter"} px-4 py-2`}
            >
              <button
                className={`px-4 py-2 bg-[#0a083c] h-full rounded-[0.5rem]`}
                onClick={() => setSelectedFilter("recents")}
              >
                <p className="text-base text-white">Recents</p>
              </button>
            </div>

            <div
              className={`${selectedFilter === "connections" && "members-selected-filter"} px-4 py-2`}
            >
              <button
                className={`px-4 py-2 bg-[#0a083c] h-full rounded-[0.5rem]`}
                onClick={() => setSelectedFilter("connections")}
              >
                <p className="text-base text-white">Connections</p>
              </button>
            </div>

            <div
              className={`${selectedFilter === "earnings" && "members-selected-filter"} px-4 py-2`}
            >
              <button
                className={`px-4 py-2 bg-[#0a083c] h-full rounded-[0.5rem]`}
                onClick={() => setSelectedFilter("earnings")}
              >
                <p className="text-base text-white">Earnings</p>
              </button>
            </div>
          </div>
        </div>
        {!isMobile && (
          <div className="w-[50%] md:w-[20%] flex md:items-center bg-[#010623] bg-opacity-[0.15] border-[1px] border-[#C2C2C229] rounded-full p-1 backdrop-filter backdrop-blur-[10px]">
            <button
              className="flex bg-[#5A00FF] rounded-full px-6 py-4 items-center"
              onClick={executeSearch}
            >
              <SearchIcon width={24} height={24} />

              <p className="text-white font-bold text-base ml-2.5 md:block hidden">
                Search
              </p>
            </button>

            <input
              placeholder="Type your search terms"
              className="ml-4 w-full bg-transparent outline-none"
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              onKeyUp={(e) => {
                if (e.key === "Enter") {
                  executeSearch();
                }
              }}
            />
          </div>
        )}

        {!isMobile && <div className="w-[33%]" />}
      </div>
    </div>
  );
};

export default SearchBar;
