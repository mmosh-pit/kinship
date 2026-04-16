import React from "react";
import BlueskyIcon from "@/assets/icons/BlueskyIcon";
import TelegramIcon from "@/assets/icons/TelegramIcon";
import BlueskyApp from "./BlueskyApp";
import TelegramApp from "./TelegramApp";

const Apps = () => {
  const [selectedOption, setSelectedOption] = React.useState(-1);

  const getPage = React.useCallback(() => {
    if (selectedOption === 0) return <BlueskyApp />;
    if (selectedOption === 1) return <TelegramApp />;

    return <></>;
  }, [selectedOption]);

  return (
    <div className="w-full flex flex-col items-center w-[85%] md:w-[60%] pt-12">
      <h1 className="font-bold text-white font-goudy text-2xl">Connect Apps</h1>

      <div className="w-full flex justify-around mt-12">
        <button
          className={`flex items-center bg-[#D9D9D938] ${selectedOption === 0 && "border-[1px] border-[#FFFFFFEB]"} rounded-2xl px-3 py-2 mb-2 min-w-[100px] justify-center`}
          onClick={() => setSelectedOption(0)}
        >
          <BlueskyIcon  width={13} height={12}/>
          <div className="mx-2" />
          <p className="text-sm text-white">{" Bluesky"}</p>
        </button>

        <button
          className={`flex items-center bg-[#D9D9D938] ${selectedOption === 1 && "border-[1px] border-[#FFFFFFEB]"} rounded-2xl px-3 py-2 mb-2 min-w-[100px] justify-center`}
          onClick={() => setSelectedOption(1)}
        >
          <TelegramIcon />
          <div className="mx-2" />
          <p className="text-sm text-white">{" Telegram"}</p>
        </button>
      </div>

      {getPage()}
    </div>
  );
};

export default Apps;
