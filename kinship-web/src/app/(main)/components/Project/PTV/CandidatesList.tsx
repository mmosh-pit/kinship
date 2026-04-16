import React from "react";
import axios from "axios";
import { useAtom } from "jotai";

import CandidateCard from "../Candidates/CandidateCard";
import { Candidate } from "@/app/(main)/models/candidate";
import { filterText, selectedCampaigns } from "@/app/(main)/store/candidates";

const CandidatesList = () => {
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [searchText] = useAtom(filterText);
  const [campaigns] = useAtom(selectedCampaigns);

  const getCandidates = React.useCallback(async () => {
    const res = await axios.get(
      `/api/get-leaderboard-candidates?search=${searchText}&types=${campaigns.join(",")}&count=10`,
    );

    setCandidates(res.data);
  }, [searchText, campaigns]);

  React.useEffect(() => {
    getCandidates();
  }, [searchText, campaigns]);

  return (
    <div className="flex w-full flex-col" id="coins">
      <div className="w-full flex justify-between px-4">
        <p className="text-white text-base">
          Candidates<span className="text-gray-500"></span>
        </p>

        <a
          className="underline text-white cursor-pointer text-base"
          href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/create/projects/ptv/candidates`}
        >
          Go to Candidate Directory
        </a>
      </div>
      <div className="w-full px-4 py-2 grid grid-cols-auto xs:grid-cols-1 xl:grid-cols-2 gap-8 mt-4">
        {candidates.map((candidate) => (
          <CandidateCard candidate={candidate} />
        ))}
      </div>
    </div>
  );
};

export default CandidatesList;
