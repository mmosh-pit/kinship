import React from "react";
import { useRouter } from "next/navigation";

import useCheckMobileScreen from "@/app/(main)/lib/useCheckMobileScreen";
// import TVL from "./TVL";
// import Volume from "./Volume";
import Price from "./Price";
import Button from "../common/Button";
import { useAtom } from "jotai";
import { selectedDirectory } from "@/app/(main)/store/home";

const Graphics = () => {
  const router = useRouter();

  const [selectedTab, setSelectedTab] = React.useState("tvl");
  const [selectedCoin, setSelectedCoin] = React.useState("mmosh");
  const [selectedCoinDirectory, setSelectedCoinDirectory] =
    useAtom(selectedDirectory);

  const isMobile = useCheckMobileScreen();

  // const renderGraphicComponent = React.useCallback(() => {
  //   if (selectedTab === "tvl") return <TVL />;
  //
  //   if (selectedTab === "volume") return <Volume withFilters />;
  //
  //   return <Price symbol={selectedCoinDirectory} />;
  // }, [selectedTab]);

  React.useEffect(() => {
    console.log("selectedCoin ", selectedCoin);
    setSelectedCoinDirectory(selectedCoin.toUpperCase());
  }, [selectedCoin]);

  return (
    <>
      <div className="w-full flex justify-between">
        <div className="flex items-center mt-4 mb-6">
          <div
            className="flex items-center justify-center"
            onClick={(_) => {
              setSelectedCoin("mmosh");
            }}
          >
            <input
              id="radio1"
              type="radio"
              className="radio radio-secondary candidates-checkboxes"
              checked={selectedCoin === "mmosh"}
              onChange={() => {}}
            />
            <p className="text-white text-base md:ml-2">MMOSH</p>
          </div>

          <div
            className="flex items-center justify-center mx-8"
            onClick={(_) => {
              setSelectedCoin("ptvb");
            }}
          >
            <input
              id="radio1"
              type="radio"
              className="radio radio-secondary candidates-checkboxes"
              checked={selectedCoin === "ptvb"}
              onChange={() => {}}
            />
            <p className="text-white text-base md:ml-2">PTVB</p>
          </div>

          <div
            className="flex items-center justify-center mx-4"
            onClick={(_) => {
              setSelectedCoin("ptvr");
            }}
          >
            <input
              id="radio1"
              type="radio"
              className="radio radio-secondary candidates-checkboxes"
              checked={selectedCoin === "ptvr"}
              onChange={() => {}}
            />
            <p className="text-white text-base md:ml-2">PTVR</p>
          </div>
        </div>

        <div className="">
          <Button
            title="Create a Coin"
            isPrimary
            size="small"
            action={() => {
              router.push("/create/coins");
            }}
            isLoading={false}
          />
        </div>
      </div>

      {/* {!isMobile && ( */}
      <div className="w-full">
        {/* <TVL symbol={selectedCoinDirectory}/>

          <Volume withFilters /> */}

        <Price symbol={selectedCoinDirectory} />
      </div>
      {/* )} */}

      {/* {isMobile && (
        <div className="w-full flex flex-col">
          <div className="w-full flex flex-col">
            <div className="w-full flex">
              <div
                className="mx-2 cursor-pointer"
                onClick={() => setSelectedTab("tvl")}
              >
                <p
                  className={`${selectedTab === "tvl" ? "text-white font-bold" : "text-[#AEAEB2] font-normal"} text-base`}
                >
                  TVL
                </p>
              </div>

              <div
                className="mx-2 cursor-pointer"
                onClick={() => setSelectedTab("volume")}
              >
                <p
                  className={`${selectedTab === "volume" ? "text-white font-bold" : "text-[#AEAEB2] font-normal"} text-base`}
                >
                  Volume
                </p>
              </div>

              <div
                className="mx-2 cursor-pointer"
                onClick={() => setSelectedTab("price")}
              >
                <p
                  className={`${selectedTab === "price" ? "text-white font-bold" : "text-[#AEAEB2] font-normal"} text-base`}
                >
                  MMOSH Price
                </p>
              </div>
            </div>

            <div className="w-full h-[1px] bg-[#AEAEB260] my-2" />
          </div>

          {renderGraphicComponent()}
        </div>
      )} */}
    </>
  );
};

export default Graphics;
