import React from "react";

import PartyColorFilters from "./PartyColorFilter";
import Volume from "./Volume";
import TVL from "./TVL";
import Price from "./Price";

const PartiesGraphics = () => {
  const [selectedParties, setSelectedParty] = React.useState(["DEM", "REP"]);

  const handleChangeParty = (value: string) => {
    setSelectedParty((prev) => {
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
    <div className="w-full flex flex-col">
      <div className="w-full flex justify-between my-6">
        <div className="w-full flex items-center">
          <PartyColorFilters
            handleChangeFilterValue={handleChangeParty}
            selectedColor={selectedParties}
          />
        </div>

        <div className="w-full self-end flex items-center justify-end">
          {selectedParties.includes("REP") && (
            <div className="flex flex-col">
              <p className="text-white text-lg font-bold">Red Team</p>

              <div className="flex items-center bg-[#F4F4F426] rounded-full border-[#C2C2C229] border-[1px] p-1">
                <div className="bg-[#C90000] px-4 py-2 rounded-full">
                  <p className="text-base text-white font-bold">PTVR FDV</p>
                </div>

                <p className="ml-4 mr-6 text-base text-white">$234,2</p>
              </div>
            </div>
          )}

          {selectedParties.includes("DEM") && (
            <div className="flex flex-col ml-8">
              <p className="text-white text-lg font-bold">Blue Team</p>

              <div className="flex items-center bg-[#F4F4F426] rounded-full border-[#C2C2C229] border-[1px] p-1">
                <div className="bg-[#0029FF] px-4 py-2 rounded-full">
                  <p className="text-base text-white font-bold">PTVB FDV</p>
                </div>

                <p className="ml-4 mr-6 text-base text-white">$234,2</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-full flex justify-between" id="democrat-graphics">
        <TVL isBlue />
        <Volume isBlue />
        <Price isBlue />
      </div>

      <div
        className="w-full flex justify-between mt-6"
        id="republican-graphics"
      >
        <TVL isBlue={false} />
        <Volume isBlue={false} />
        <Price isBlue={false} />
      </div>
    </div>
  );
};

export default PartiesGraphics;
