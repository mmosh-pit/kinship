import axios from "axios";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import SimpleMemberCard from "../common/SimpleMemberCard";
import { AgentStats } from "@/app/(main)/models/AgentStats";
import { User } from "@/app/(main)/models/user";
import AgentOfferItem from "./AgentOfferItem";

const AgentPageInfo = ({
  agentKey,
  roles,
}: {
  agentKey: string;
  roles: any;
}) => {
  const navigate = useRouter();

  const [members, setMembers] = React.useState<User[]>([]);
  const [offers, setOffers] = React.useState<any[]>([]);
  const [projectDetail, setProjectDetail] = React.useState<any>(null);
  const [stats, setStats] = React.useState<AgentStats>({
    offers: 0,
    subscribers: 0,
    teams: 0,
  });
  const [selectedTab, setSelectedTab] = React.useState(0);

  const getAgentStats = React.useCallback(async () => {
    const result = await axios.get(
      `/api/get-agent-total-values?key=${agentKey}`,
    );

    setStats(result.data);
  }, [agentKey]);

  const getAgentMembers = React.useCallback(async () => {
    const result = await axios.get(
      `/api/get-agent-subscribers?key=${agentKey}`,
    );

    setMembers(result.data);
  }, [agentKey]);

  const getAgentOffers = React.useCallback(async () => {
    const result = await axios.get(
      `/api/offer/list-project?project=${agentKey}`,
    );

    setOffers(result.data);
  }, [agentKey]);

  const getAgentTeams = React.useCallback(async () => { }, [agentKey]);

  React.useEffect(() => {
    getAgentStats();
    getAgentMembers();
    getAgentOffers();
    getAgentTeams();
    getProjectDetailFromAPI();
  }, [agentKey]);

  const getProjectDetailFromAPI = async () => {
    try {
      let listResult = await axios.get(
        `/api/project/detail?address=${agentKey}`,
      );
      setProjectDetail(listResult.data);
    } catch (error) {
      setProjectDetail(null);
    }
  };

  return (
    <div className="w-full items-center flex flex-col">
      <div className="flex bg-[#FFFFFF08] border-[1px] border-[#FFFFFF28] rounded-full p-2">
        <div
          className={`flex items-center cursor-pointer ${selectedTab === 0 && "border-[1px] border-[#FFFFFF28] bg-[#FFFFFF20]"} rounded-full p-2`}
          onClick={() => setSelectedTab(0)}
        >
          <p className="text-base text-white">Subscribers</p>
        </div>

        <div className="mx-4" />

        <div
          className={`flex items-center cursor-pointer ${selectedTab === 1 && "border-[1px] border-[#FFFFFF28] bg-[#FFFFFF20]"} rounded-full p-2`}
          onClick={() => setSelectedTab(1)}
        >
          <p className="text-base text-white">Offers</p>
        </div>
      </div>

      {selectedTab === 0 && (
        <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 2xl:px-8 md:px-4 px-6 py-6 overflow-y-auto">
          {members.map((member) => (
            <SimpleMemberCard user={member} />
          ))}
        </div>
      )}

      {selectedTab === 1 && (
        <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 2xl:px-8 md:px-4 px-6 py-6 overflow-y-auto">
          {offers.map((offer) => (
            <AgentOfferItem data={offer} project={projectDetail.project} />
          ))}
        </div>
      )}

      {selectedTab === 2 && (
        <div className="w-full h-full gap-4 2xl:px-8 md:px-4 px-6 py-6 overflow-y-auto">
          {roles.map((role: any) => (
            <>
              {role.data.length > 0 && role.enabled && (
                <>
                  <h2 className="text-base text-white mb-2.5">
                    {role.value}
                    <span className="font-normal text-sm ml-1">
                      ({role.data.length})
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
                    {role.data.map((profile: any) => (
                      <>
                        {profile.profile && (
                          <div className="relative bg-[#030007] bg-opacity-40 p-2.5 rounded-2xl border-[1px] border-[#353485] cursor-pointer min-h-[120px]">
                            <div className="self-center absolute left-2.5 top-2.5 mr-8">
                              <div className="w-[100px] h-[100px]">
                                <Image
                                  src={profile.profile.image}
                                  alt="Profile Image"
                                  className="rounded-md object-cover"
                                  layout="fill"
                                />
                              </div>
                            </div>

                            <div className="pl-[120px]">
                              <p className="text-white text-base">
                                <div className="member-header relative pr-10">
                                  <h2 className="font-bold text-white text-base capitalize break-words">
                                    {profile.profile.name}
                                  </h2>
                                </div>
                                <p
                                  className="cursor-pointer text-primary text-sm underline"
                                  onClick={() => {
                                    navigate.push(
                                      "/" + profile.profile.username,
                                    );
                                  }}
                                >
                                  @{profile.profile.username}
                                </p>
                              </p>

                              <div className="mt-2.5">
                                <p className="text-white text-base text-with-ellipsis max-w-[70%] line-clamp-2">
                                  {profile.profile.bio}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ))}
                  </div>
                </>
              )}
            </>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentPageInfo;
