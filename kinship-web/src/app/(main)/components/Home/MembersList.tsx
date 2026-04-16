import React from "react";
import { useAtom } from "jotai";

import { User } from "@/app/(main)/models/user";
import { selectedSearchFilter } from "@/app/(main)/store/home";
import { textSearch } from "@/app/(main)/store/membership";
import UserCard from "../UserCard";
import { data } from "@/app/(main)/store";
import useWallet from "@/utils/wallet";
import client from "@/app/(main)/lib/httpClient";

const MembersList = () => {
  const [selectedFilters] = useAtom(selectedSearchFilter);
  const [searchText] = useAtom(textSearch);

  const [isLoading, setIsLoading] = React.useState(false);
  const fetching = React.useRef(false);
  const containerRef = React.useRef<any>(null);
  const [currentPage, setCurrentPage] = React.useState(0);
  const allUsers = React.useRef<User[]>([]);
  const lastPageTriggered = React.useRef(false);
  const [users, setUsers] = React.useState<User[]>([]);
  const wallet = useWallet();
  const [currentUser] = useAtom(data);

  const getUsers = React.useCallback(async () => {
    if (
      selectedFilters.includes("members") ||
      selectedFilters.includes("all")
    ) {
      fetching.current = true;
      setIsLoading(true);
      const url = `/members?page=${currentPage}&search=${searchText}`;

      const result = await client.get(url);

      if (result.data.data.length === 0) {
        lastPageTriggered.current = true;
        setIsLoading(false);
        fetching.current = false;
        return;
      }

      if (currentPage === 0) {
        setUsers(result.data.data);
      } else {
        setUsers((prev) => [...prev, ...result.data.data]);
      }

      allUsers.current = result.data.data;
      setIsLoading(false);
      fetching.current = false;
    } else {
      setUsers([]);
    }
  }, [searchText, selectedFilters, currentPage, wallet]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    if (
      containerRef.current.scrollHeight - containerRef.current.scrollTop <=
      containerRef.current.clientHeight + 50 &&
      !lastPageTriggered.current
    ) {
      setCurrentPage(currentPage + 1);
    }
  };

  React.useEffect(() => {
    if (fetching.current) return;
    getUsers();
  }, [searchText, currentPage]);

  if (isLoading) return <></>;

  if (users?.length === 0) return <></>;

  return (
    <div className="flex w-full flex-col" id="members">
      <div
        className="px-12 py-8 grid grid-cols-auto grid-cols-1 md:grid-cols-2 gap-6 mt-4 overflow-y-auto mt-8 bg-[#181747] rounded-lg"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {users.map((user) => (
          <UserCard
            user={user}
            currentuser={currentUser || undefined}
            isHome={false}
          />
        ))}
      </div>
    </div>
  );
};

export default MembersList;
