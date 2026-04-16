"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

const AgentOfferItem = (offerData: any) => {
  const router = useRouter();
  if (!offerData) return <></>;

  return (
    <div
      className="flex bg-[#030007] bg-opacity-40 px-4 py-2 rounded-2xl border-[1px] border-[#353485] cursor-pointer"
      onClick={() => {
        console.log("offer data", offerData)
        router.push(
          "/projects/"+offerData.project.symbol.toLowerCase() + "/" + offerData.data.symbol.toLowerCase(),
        );
      }} 
    >
      <div className="self-center max-w-[30%] mr-8">
        <div className="relative w-[7vmax] h-[7vmax]">
          <Image
            src={offerData.data.image}
            alt="Profile Image"
            className="rounded-md object-cover"
            layout="fill"
          />
        </div>
      </div>

      <div className="w-full flex flex-col">
        <div className="flex items-center">
          <p className="text-white text-lg underline">
            {" "}
            <span className="font-bold text-white text-lg capitalize">
              {offerData.data.name}
            </span>{" "}
            • {offerData.data.symbol}
          </p>
        </div>

        <div className="my-4">
          <p className="text-white text-base text-with-ellipsis max-w-[70%] line-clamp-2">
            {offerData.data.desc}
          </p>
        </div>

        <div className="flex flex-col mt-4">
          <div className="flex items-center rounded-lg px-2">
            <p className="text-sm text-white">
              <span className="font-bold text-sm text-white mr-4">
                Type of Offer
              </span>
            </p>
            <div className="px-2 bg-[#19066B] rounded-lg">
              <p className="text-sm text-white">{offerData.data.pricetype === "onetime" ? "One Time" : "Subscription"}</p>
            </div>
          </div>
          {offerData.data.pricetype === "onetime" &&
            <div className="flex items-center rounded-lg px-2 mt-2">
                <p className="text-sm text-white">
                <span className="font-bold text-sm text-white mr-4">
                    Price
                </span>
                </p>
                <div className="px-2 bg-[#19066B] rounded-lg">
                   <p className="text-sm text-white">{"USDC "+ offerData.data.priceonetime}</p>
                </div>
            </div>
          }
          {offerData.data.pricetype !== "onetime" &&
            <>
                <div className="flex items-center rounded-lg px-2 mt-2">
                    <p className="text-sm text-white">
                    <span className="font-bold text-sm text-white mr-4">
                        Price
                    </span>
                    </p>
                    {offerData.data.pricemonthly > 0 &&
                      <div className="px-2 bg-[#19066B] rounded-lg mr-2">
                        <p className="text-sm text-white">{"Monthly : USDC "+ offerData.data.pricemonthly}</p>
                      </div>
                    }
                    {offerData.data.priceyearly > 0 &&
                      <div className="px-2 bg-[#19066B] rounded-lg">
                        <p className="text-sm text-white">{"Yearly : USDC "+ offerData.data.priceyearly}</p>
                      </div>
                    }
                </div>
            </>

          }
          
        </div>
      </div>

    </div>
  );
};

export default AgentOfferItem;
