"use client";
import React from "react";
import axios, { CancelTokenSource } from "axios";

import { useRouter } from "next/navigation";
import Search from "../../components/common/Search";
import Card from "../../components/Forge/common/Card";
import { Community, CommunityAPIResult } from "@/app/(main)/models/community";

const Communities = () => {
  const navigate = useRouter();
  const cancelRequestToken = React.useRef<CancelTokenSource | null>(null);

  const [isLoading, setIsLoading] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const [communities, setCommunities] = React.useState<CommunityAPIResult[]>(
    [],
  );

  const getCommunities = React.useCallback(async () => {
    try {
      if (cancelRequestToken.current) {
        cancelRequestToken.current.cancel();
        cancelRequestToken.current = null;
      }
      cancelRequestToken.current = axios.CancelToken.source();

      setIsLoading(true);
      const listResult = await axios.get(
        `/api/list-communities?searchText=${searchText}`,
        {
          cancelToken: cancelRequestToken.current.token,
        },
      );
      setCommunities(listResult.data);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      setCommunities([]);
    }
  }, [searchText]);

  const onCommunitySelect = (community: Community) => {
    navigate.push(`/create/communities/${community.symbol}`);
  };

  React.useEffect(() => {
    getCommunities();
  }, [searchText]);

  return (
    <div className="background-content flex justify-center">
      <div className="w-full flex flex-col items-center mt-20">
        <div className="flex flex-col items-center lg:w-[30%] md:w-[50%] sm:w-[60%] w-[85%]">
          <h4 className="my-12">Community Directory</h4>

          <Search
            value={searchText}
            onChange={(value) => setSearchText(value)}
            placeholder="Type the name or symbol of the Project you want to search"
          />
        </div>

        <div className="w-full px-6 md:px-12 grid grid-cols-auto md:grid-cols-3 lg:grid-cols-4 gap-16 mt-4">
          {communities.map((value) => (
            <div
              className="cursor-pointer"
              onClick={() => onCommunitySelect(value.data)}
              key={value._id?.toString()}
            >
              <Card
                name={value.data.name}
                image={value.data.image}
                username={value.data.symbol}
                description={value.data.description}
                key={value.data.tokenAddress}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Communities;
