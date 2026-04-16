import React from "react";

import SearchIcon from "@/assets/icons/SearchIcon";

type Props = {
  setSearchText: (value: string) => void;
};

const VaultSearchBar = ({ setSearchText }: Props) => {
  const [localText, setLocalText] = React.useState("");

  return (
    <div className="w-full flex justify-between">
      <div className="w-full flex items-center bg-[#FFFFFF14] border-[1px] border-[#FFFFFF47]  my-5 mx-14
      rounded-full p-4">
          <SearchIcon  className="w-6 h-6"/>

        <input
          placeholder="Type your search terms"
          className="ml-4 w-full bg-transparent outline-none"
          value={localText}
          onChange={(e) => {
            setLocalText(e.target.value);
            setSearchText(e.target.value);
          }}
        />
      </div>
    </div>
  );
};

export default VaultSearchBar;
