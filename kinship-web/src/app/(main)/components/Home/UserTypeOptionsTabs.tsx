import { userType } from "@/app/(main)/store";
import { useAtom } from "jotai";

const userTypeOptions = [
  { label: "All", value: "all" },
  { label: "Members", value: "members" },
  {
    label: "Guests",
    value: "guests",
  },
];

const UserTypeOptionsTabs = () => {
  const [selectedFilter, setSelectedFilter] = useAtom(userType);

  return (
    <div className="flex self-start bg-[#020028] rounded-2xl">
      {userTypeOptions.map((type) => (
        <div
          className={`py-2 px-6 ${
            type.value === selectedFilter && "bg-[#0A083C] rounded-2xl"
          } cursor-pointer`}
          onClick={() => setSelectedFilter(type.value)}
          key={type.value}
        >
          <p className="text-base text-white">{type.label}</p>
        </div>
      ))}
    </div>
  );
};

export default UserTypeOptionsTabs;
