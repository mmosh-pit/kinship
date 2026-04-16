import { useAtom } from "jotai";

import SearchBar from "../Candidates/SearchBar";
import { filterText } from "@/app/(main)/store/candidates";
import CampaignFilter from "./CampaignFilter";

const LeaderboardFilters = () => {
  const [_, setSearchText] = useAtom(filterText);

  return (
    <div className="w-full flex justify-between items-center">
      <CampaignFilter />

      <div className="lg:w-[30%] md:w-[35%] sm:w-[45%] w-[60%]">
        <SearchBar setSearchText={setSearchText} />
      </div>
    </div>
  );
};

export default LeaderboardFilters;
