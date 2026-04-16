import React from "react";
import Image from "next/image";
import { Candidate } from "@/app/(main)/models/candidate";
import { states } from "@/utils/states";
import { politicalParties } from "@/utils/politicalParties";
import { CandidateCoinsData } from "@/app/(main)/models/candidateCoinsData";
import axios from "axios";

type Props = {
  candidate: Candidate;
  borderRight?: boolean;
  noBorder?: boolean;
};

const CandidateCard = ({ candidate, noBorder, borderRight }: Props) => {
  const [coinsData, setCoinsData] = React.useState<CandidateCoinsData | null>(
    null,
  );

  const getColor = () => {
    switch (candidate.PARTY) {
      case "DEM":
        return 1;
      case "REP":
        return -1;
      default:
        return 0;
    }
  };

  const getImageUrl = (color: number): string => {
    if (candidate.CANDIDATE_ID.at(0) === "H") {
      switch (color) {
        case 1:
          return "https://storage.googleapis.com/mmosh-assets/candidates/House%20Blue%20Coin.png";
        case -1:
          return "https://storage.googleapis.com/mmosh-assets/candidates/House%20Red%20Coin.png";
        case 0:
          return "https://storage.googleapis.com/mmosh-assets/candidates/House%20Gray%20Coin.png";
      }
    }

    if (candidate.CANDIDATE_ID.at(0) === "S") {
      switch (color) {
        case 1:
          return "https://storage.googleapis.com/mmosh-assets/candidates/Senate%20Blue%20Coin.png";
        case -1:
          return "https://storage.googleapis.com/mmosh-assets/candidates/Senate%20Red%20Coin.png";
        case 0:
          return "https://storage.googleapis.com/mmosh-assets/candidates/Senate%20Gray%20Coin.png";
      }
    }

    if (candidate.CANDIDATE_ID.at(0) === "P") {
      switch (color) {
        case 1:
          return "https://storage.googleapis.com/mmosh-assets/candidates/President%20Blue%20Coin.png";
        case -1:
          return "https://storage.googleapis.com/mmosh-assets/candidates/President%20Red%20Coin.png";
        case 0:
          return "https://storage.googleapis.com/mmosh-assets/candidates/President%20Gray%20Coin.png";
      }
    }

    return "";
  };

  const getImage = () => {
    const color = getColor();

    if (coinsData?.coin.image) {
      return coinsData!.coin.image;
    }

    return getImageUrl(color);
  };

  const getBorderClassName = () => {
    if (candidate.PARTY === "REP") {
      return "republican-border-color";
    }

    if (candidate.PARTY === "DEM") {
      return "democrat-border-color";
    }

    return "other-border-color";
  };

  const getTypeName = () => {
    if (candidate.CANDIDATE_ID.at(0) === "H") {
      return "Congressional";
    }

    if (candidate.CANDIDATE_ID.at(0) === "P") {
      return "Presidential";
    }

    if (candidate.CANDIDATE_ID.at(0) === "S") {
      return "Senatorial";
    }

    return "";
  };

  const getBorderRadiusClassName = React.useCallback(() => {
    if (borderRight) {
      return "md:rounded-tr-[4vmax] rounded-tr-[5vmax] rounded-tl-xl rounded-b-xl";
    }

    if (!borderRight && !noBorder) {
      return "md:rounded-tl-[4vmax] rounded-tl-[5vmax] rounded-tr-xl rounded-b-xl";
    }

    return "rounded-xl";
  }, [borderRight, noBorder]);

  const getCandidateCoinsData = React.useCallback(async () => {
    const result = await axios.get(
      `/api/get-candidate-fdv-values?candidate=${candidate.CANDIDATE_ID}`,
    );

    setCoinsData(result.data);
  }, [candidate]);

  React.useEffect(() => {
    getCandidateCoinsData();
  }, [candidate]);

  return (
    <div className="relative grid w-full">
      <div
        className={`flex justify-between bg-[#030007] bg-opacity-40 px-4 py-4 ${getBorderRadiusClassName()} ${getBorderClassName()}`}
      >
        <div className="flex flex-col">
          <div className="max-w-[30%] mr-4 mb-2">
            <div className="relative md:w-[5vmax] md:h-[5vmax] w-[6vmax] h-[6vmax]">
              <Image
                src={getImage()}
                alt="Profile Image"
                className="rounded-full"
                layout="fill"
              />
            </div>
          </div>

          <p className="text-base text-white underline">
            {coinsData?.coin.name}
          </p>
          <p className="text-sm">{coinsData?.coin.symbol?.toUpperCase()}</p>
        </div>

        <div className="flex flex-col justify-start grow">
          <p className="text-base text-white underline">
            {candidate.CANDIDATE_NAME.split(",").reverse().join(" ")}
          </p>
          <div className="flex flex-col mt-2">
            <p className="text-sm">{politicalParties[candidate.PARTY]}</p>
            <p className="text-sm">{getTypeName()}</p>
            <p className="text-sm">{states[candidate.REG_ABBR]}</p>
          </div>
        </div>

        <div className="flex flex-col">
          <p className="text-white text-base mb-4">FDV</p>

          <div className="flex items-center">
            <p className="text-sm mr-2">All</p>
            <p className="text-sm text-white">
              {coinsData?.total}
              <span className="text-tiny ml-1">
                {coinsData?.coin.symbol || "USDC"}
              </span>
            </p>
          </div>

          <div className="flex items-center my-4">
            <p className="text-sm mr-2">For</p>
            <p className="text-sm text-white">
              {coinsData?.forResult}
              <span className="text-tiny ml-1">
                {coinsData?.coin.symbol || "USDC"}
              </span>
            </p>
          </div>

          <div className="flex items-center">
            <p className="text-sm mr-2">Against</p>
            <p className="text-sm text-white">
              {coinsData?.againstResult}
              <span className="text-tiny ml-1">
                {coinsData?.coin.symbol || "USDC"}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidateCard;
