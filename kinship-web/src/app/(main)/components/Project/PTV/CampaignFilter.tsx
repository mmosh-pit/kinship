import { useAtom } from "jotai";

import { selectedCampaigns } from "@/app/(main)/store/candidates";

const CampaignFilter = ({}) => {
  const [selectedCandidateFilter, setSelectedCandidateFilter] =
    useAtom(selectedCampaigns);

  const handleChangeFilterValue = (value: string) => {
    setSelectedCandidateFilter((prev) => {
      let newItems = [...prev];

      if (newItems.includes(value)) {
        newItems = newItems.filter((element) => element !== value);
      } else {
        newItems.push(value);
      }

      return newItems;
    });
  };

  return (
    <div className="flex flex-col">
      <p className="text-white text-lg font-bold">Campaigns</p>

      <div className="flex items-center mt-4">
        <div
          className="flex items-center justify-center"
          onClick={(_) => {
            handleChangeFilterValue("P");
          }}
        >
          <input
            id="radio1"
            type="radio"
            className="radio radio-secondary candidates-checkboxes"
            checked={selectedCandidateFilter.includes("P")}
            onChange={() => {}}
          />
          <p className="text-white text-base md:ml-2">Presidential</p>
        </div>

        <div
          className="flex items-center justify-center mx-4"
          onClick={(_) => {
            handleChangeFilterValue("S");
          }}
        >
          <input
            id="radio1"
            type="radio"
            className="radio radio-secondary candidates-checkboxes"
            checked={selectedCandidateFilter.includes("S")}
            onChange={() => {}}
          />
          <p className="text-white text-base md:ml-2">Senatorial</p>
        </div>

        <div
          className="flex items-center justify-center md:ml-2"
          onClick={(_) => {
            handleChangeFilterValue("H");
          }}
        >
          <input
            id="radio1"
            type="radio"
            className="radio radio-secondary candidates-checkboxes"
            checked={selectedCandidateFilter.includes("H")}
            onChange={() => {}}
          />
          <p className="text-white text-base md:ml-2">Congressional</p>
        </div>
      </div>
    </div>
  );
};

export default CampaignFilter;
