import React from "react";
import axios from "axios";
import TelegramIcon from "@/assets/icons/TelegramIcon";
import BlueskyIcon from "@/assets/icons/BlueskyIcon";
import LinkedinIcon from "@/assets/icons/LinkedinIcon";
import BlueskyAgentOption from "./BlueskyAgentOption";
import TelegramAgentOption from "./TelegramAgentOption";
import LinkedInAgentOption from "./LinkedInAgentOption";

const AgentStudioToolsCreate = ({ symbol }: { symbol: string }) => {
  const [selectedOption, setSelectedOption] = React.useState(0);

  const [projectDetail, setProjectDetail] = React.useState<any>(null);

  const getProjectDetailFromAPI = React.useCallback(async () => {
    try {
      let listResult = await axios.get(`/api/project/detail?symbol=${symbol}`);
      setProjectDetail(listResult.data);
    } catch (error) {
      setProjectDetail(null);
    }
  }, [symbol]);

  const getClassNameForItem = React.useCallback(
    (itemIndex: number) => {
      if (itemIndex === selectedOption) {
        return "flex items-center bg-[#D9D9D938] border-[1px] border-[#FFFFFFEB] rounded-2xl cursor-pointer px-3 py-1";
      }

      return "flex items-center bg-[#66666638] border-[1px] border-[#FFFFFF52] rounded-2xl cursor-pointer px-3 py-1";
    },
    [selectedOption],
  );

  React.useEffect(() => {
    getProjectDetailFromAPI();
  }, [symbol]);

  return (
    <div className="background-content">
      <div className="flex flex-col justify-center items-center mt-4">
        <div className="bg-[#00000045] my-4 rounded-2xl md:max-w-[40%] max-w-[75%] py-4 px-8">
          <p className="text-base text-white">
            Your agent's email address is {symbol}@kinship.codes
          </p>
        </div>

        <div className="flex items-center mt-2 mb-8">
          <div
            className={getClassNameForItem(1)}
            onClick={() => setSelectedOption(1)}
          >
            <TelegramIcon width={18} height={15} />{" "}
            <p className="text-base text-white ml-1"> Telegram </p>
          </div>

          <div className="px-6" />

          <div
            className={getClassNameForItem(2)}
            onClick={() => setSelectedOption(2)}
          >
            <BlueskyIcon  width={13} height={12} />{" "}
            <p className="text-base text-white ml-1"> Bluesky</p>
          </div>

          <div className="px-6" />

          <div
            className={getClassNameForItem(3)}
            onClick={() => setSelectedOption(3)}
          >
            <LinkedinIcon  width={13} height={13}/>{" "}
            <p className="text-base text-white ml-1"> LinkedIn</p>
          </div>
        </div>
        {selectedOption === 1 && (
          <TelegramAgentOption project={projectDetail?.project.key} />
        )}
        {selectedOption === 2 && (
          <BlueskyAgentOption project={projectDetail?.project.key} />
        )}
        {selectedOption === 3 && (
          <LinkedInAgentOption project={projectDetail?.project.key} />
        )}
      </div>
    </div>
  );
};

export default AgentStudioToolsCreate;
