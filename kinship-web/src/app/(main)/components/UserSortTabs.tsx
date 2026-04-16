import { useAtom } from "jotai";
import ArrowDown from "@/assets/icons/ArrowDown";
import ArrowUp from "@/assets/icons/ArrowUp";
import { sortDirection, sortOption } from "@/app/(main)/store";

const sortOptions = [
  { label: "Royalties", value: "royalty" },
  { label: "Seniority", value: "profile.seniority" },
  { label: "Points", value: "telegram.points" },
];

const UserSortTabs = () => {
  const [selectedSortOption, setSelectedSortOption] = useAtom(sortOption);
  const [selectedSortDirection, setSelectedSortDirection] =
    useAtom(sortDirection);

  const toggleSelectOption = (value: string) => {
    if (value === selectedSortOption) {
      setSelectedSortDirection(
        selectedSortDirection === "desc" ? "asc" : "desc"
      );
      return;
    }

    setSelectedSortOption(value);
    setSelectedSortDirection("asc");
  };

  return (
    <div id="filter-container">
      {sortOptions.map((option) => (
        <div
          className={`px-4 ${
            option.value === selectedSortOption && "selected-sort-option"
          } cursor-pointer relative flex items-center`}
          key={option.value}
          onClick={() => toggleSelectOption(option.value)}
        >
          <p className="text-sm text-white">{option.label}</p>
          {option.value === selectedSortOption && (
            <div className="ml-4">
              {selectedSortDirection === "desc" ? <ArrowDown /> : <ArrowUp />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default UserSortTabs;
