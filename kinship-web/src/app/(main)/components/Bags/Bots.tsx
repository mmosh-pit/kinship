"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import internalClient from "@/app/(main)/lib/internalHttpClient";
const Bots = (botData: any) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [bots, setBots] = React.useState([]);

  useEffect(() => {
    listBotsApi();
  }, []);

  const listBotsApi = async () => {
    try {
      setLoading(true);
      let url = "/api/project/mylist?creator=" + botData.address;
      let apiResult = await internalClient.get(url);
      setBots(apiResult.data);

      console.log("bots list ", apiResult.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setBots([]);
    }
  };

  const openExplorer = (item: any) => {
    window.open(
      "https://solscan.io/account/" + item.key + "?cluster=mainnet",
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="mt-6">
      {loading && (
        <div className="text-center text-gray-500 pb-6">
          <p className="text-lg font-medium">Loading...</p>
        </div>
      )}
      {!loading && bots.length == 0 && (
        <div className="text-center text-gray-500 pb-6">
          <p className="text-lg font-medium">No Bots Available</p>
        </div>
      )}

      {!loading && bots.length > 0 && (
        <div className="px-14">
          {bots.map((item: any, index: number) => (
            <div className="flex bg-[#2E3C4E80] px-4 py-2 rounded-2xl mb-4">
              <div className="self-center max-w-[30%] mr-4">
                <div
                  className="relative w-[100px] h-[100px] cursor-pointer"
                  onClick={() => {
                    router.push("/bots/" + item.symbol.toLowerCase());
                  }}
                >
                  <Image
                    src={item.image}
                    alt="Bot Image"
                    className="rounded-md object-cover"
                    layout="fill"
                  />
                </div>
              </div>
              <div className="w-full flex flex-col">
                <div className="flex items-center">
                  <p
                    className="text-white text-base underline cursor-pointer"
                    onClick={() => {
                      router.push("/bots/" + item.symbol.toLowerCase());
                    }}
                  >
                    {" "}
                    <span className="font-bold text-white text-base capitalize">
                      {item.name}
                    </span>{" "}
                    • {item.symbol}
                  </p>
                </div>

                <div className="my-2">
                  <p className="text-white text-sm text-with-ellipsis max-w-[70%] line-clamp-2">
                    {item.desc}
                  </p>
                </div>

                <div className="my-4">
                  <p
                    className="text-white text-sm underline cursor-pointer"
                    onClick={() => {
                      openExplorer(item);
                    }}
                  >
                    View on Solscan
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Bots;
