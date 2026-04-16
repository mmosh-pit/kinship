import React from "react";

import { Candidate } from "@/app/(main)/models/candidate";
import axios from "axios";
import ArrowDown from "@/assets/icons/ArrowDown";
import ArrowUp from "@/assets/icons/ArrowUp";

type Props = {
  value: Candidate | null;
  onChangeValue: (value: Candidate | null) => void;
  selectedCoin: string;
};

const CoinsCandidatesSelect = ({
  value,
  onChangeValue,
  selectedCoin,
}: Props) => {
  const divHeight = 50;
  const [presidentialCandidates, setPresidentialCandidates] = React.useState<
    Candidate[]
  >([]);
  const [senatorialCandidates, setSenatorialCandidates] = React.useState<
    Candidate[]
  >([]);
  const [congressCandidates, setCongressCandidates] = React.useState<
    Candidate[]
  >([]);
  const [searchText, setSearchText] = React.useState("");
  const [displayItems, setDisplayItems] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const isQuerying = React.useRef(false);

  const animating = React.useRef(false);

  const getCandidates = async () => {
    isQuerying.current = true;
    const presidentialResponse = await axios.get(
      `/api/get-candidates-for-selects?search=${searchText}&type=0`,
    );

    const senatorialResponse = await axios.get(
      `/api/get-candidates-for-selects?search=${searchText}&type=1`,
    );

    const congressResponse = await axios.get(
      `/api/get-candidates-for-selects?search=${searchText}&type=2`,
    );

    setPresidentialCandidates(presidentialResponse.data);
    setSenatorialCandidates(senatorialResponse.data);
    setCongressCandidates(congressResponse.data);
    isQuerying.current = false;
  };

  React.useEffect(() => {
    if (!isOpen) {
      animating.current = true;
      setTimeout(() => {
        setDisplayItems(false);
        animating.current = false;
      }, 100);
      return;
    }

    setDisplayItems(true);
  }, [isOpen]);

  const toggleContainer = () => {
    if (animating.current) return;
    setIsOpen(!isOpen);
  };

  React.useEffect(() => {
    getCandidates();
  }, [searchText]);

  return (
    <div className="flex flex-col w-full relative">
      <p className="text-sm text-white">
        Search for Candidate by Name, Party or State<sup>*</sup>
      </p>

      <div
        className={`candidates-select absolute top-[14px] md:top-[16px] ${isOpen && "opened"} px-[1vmax] mt-2`}
        style={{
          height: !isOpen ? `${divHeight}px` : "300px",
        }}
      >
        <div
          className="w-full flex justify-between items-center self-center"
          onClick={toggleContainer}
        >
          {isOpen ? (
            <div className="w-[90%]" onClick={(e) => e.stopPropagation()}>
              <input
                className="input input-ghost w-full mt-2"
                value={searchText}
                placeholder="Search for Candidate by Name, Party or State"
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex">
              {value ? (
                <p className="text-xs text-white">
                  {value.CANDIDATE_NAME.split(",").reverse().join(" ")}
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Search for Candidate by Name, Party or State
                </p>
              )}
            </div>
          )}

          {isOpen ? <ArrowUp /> : <ArrowDown />}
        </div>
        {displayItems && (
          <div className="candidates-select-open" ref={containerRef}>
            <div className="w-full h-[1px] bg-[#6E5FB1] px-4 my-2" />

            <div className="w-full flex flex-col">
              <p className="text-lg text-white font-bold my-3">Presidential</p>

              {presidentialCandidates.map((candidate) => {
                return (
                  <div
                    className="flex items-center my-2 cursor-pointer"
                    key={candidate.CANDIDATE_ID}
                    onClick={() => {
                      setIsOpen(false);
                      onChangeValue(candidate);
                    }}
                  >
                    <p className="text-gray-200 text-xs">
                      {candidate.CANDIDATE_NAME.split(",").reverse().join(" ")}
                    </p>
                  </div>
                );
              })}

              <p className="text-lg text-white font-bold my-3">Senatorial</p>

              {senatorialCandidates.map((candidate) => {
                return (
                  <div
                    className="flex items-center my-2 cursor-pointer"
                    key={candidate.CANDIDATE_ID}
                    onClick={() => {
                      setIsOpen(false);
                      onChangeValue(candidate);
                    }}
                  >
                    <p className="text-gray-200 text-xs">
                      {candidate.CANDIDATE_NAME.split(",").reverse().join(" ")}
                    </p>
                  </div>
                );
              })}

              <p className="text-lg text-white font-bold my-3">Congressional</p>

              {congressCandidates.map((candidate) => {
                return (
                  <div
                    className="flex items-center my-2 cursor-pointer"
                    key={candidate.CANDIDATE_ID}
                    onClick={() => {
                      setIsOpen(false);
                      onChangeValue(candidate);
                    }}
                  >
                    <p className="text-gray-200 text-xs">
                      {candidate.CANDIDATE_NAME.split(",").reverse().join(" ")}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {["DEM", "REP"].includes(value?.PARTY ?? "") && (
        <p className="text-xs text-white mt-14">
          Based on the Coin and the Candidate you've selected, you're{" "}
          <span className="font-bold text-white text-xs">
            {(value?.PARTY === "DEM" && selectedCoin === "PTVB") ||
            (value?.PARTY === "REP" && selectedCoin === "PTVR")
              ? "For"
              : "Against"}
          </span>{" "}
          this Candidate.
        </p>
      )}
    </div>
  );
};

export default CoinsCandidatesSelect;
