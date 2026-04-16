"use client";
import React, { use } from "react";
import Image from "next/image";
import axios from "axios";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";

import { isDrawerOpen } from "@/app/(main)/store";
import Button from "../../components/common/Button";
import { currentGroupCommunity } from "@/app/(main)/store/community";
import { Coin } from "@/app/(main)/models/coin";

const Page = (props: { params: Promise<{ symbol: string }> }) => {
  const params = use(props.params);
  const router = useRouter();

  const [isDrawerShown] = useAtom(isDrawerOpen);

  const [community, setCommunity] = useAtom(currentGroupCommunity);

  const [coin, setCoin] = React.useState<Coin | null>(null);

  const fetchCoin = React.useCallback(async () => {
    const result = await axios.get<Coin>(
      `/api/get-token-by-symbol?symbol=${community?.coinSymbol}`,
    );

    setCoin(result.data);
  }, []);

  const fetchCommunity = React.useCallback(async () => {
    const result = await axios.get(
      `/api/get-group-community?symbol=${params.symbol}`,
    );

    setCommunity(result.data);
  }, [params]);

  React.useEffect(() => {
    fetchCommunity();
  }, [params]);

  React.useEffect(() => {
    if (community) {
      fetchCoin();
    }
  }, [community]);

  if (!community) return <div className="background-content" />;

  return (
    <div
      className={`background-content-full-bg flex flex-col ${isDrawerShown ? "z-[-1]" : ""}`}
    >
      <div className="flex flex-col w-full mt-8 md:px-32 px-16">
        <div className="flex md:flex-row flex-col justify-around py-6 md:px-16 px:8 rounded-xl border-[1px] border-[#FFFFFF22] bg-[#100E5242] backdrop-blur-[4px]">
          <div className="flex">
            <div className="flex flex-col">
              <p className="font-bold text-base text-white">Founder</p>

              <div className="relative w-[7vmax] h-[7vmax] mt-2">
                <Image
                  src={community?.founder.image!}
                  alt={`${community?.founder.name ?? "Founder"}'s image`}
                  layout="fill"
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col justify-between ml-6">
              <div className="flex flex-col my-4">
                <p className="text-lg text-white font-bold">
                  {community?.founder.name}
                </p>
                <p className="text-sm">{community?.founder.username}</p>
              </div>

              <div className="mt-4">
                <p className="text-sm">{community?.founder.bio}</p>
              </div>

              <a
                className="underline text-base font-normal text-[#FF00C7]"
                href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/${community?.founder.username}`}
              >
                {community?.founder.name} the {community?.founder.descriptor}
              </a>
            </div>
          </div>

          {coin && (
            <div className="flex">
              <div className="flex flex-col">
                <p className="font-bold text-base text-white">Community Coin</p>

                <div className="relative w-[7vmax] h-[7vmax] mt-2">
                  <Image
                    src={coin?.image!}
                    alt={`${coin?.name ?? "Coin"}'s image`}
                    layout="fill"
                    className="rounded-lg"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-between ml-6">
                <div className="flex flex-col my-4">
                  <p className="text-lg text-white font-bold">{coin?.name}</p>
                  <p className="text-sm">{coin?.symbol.toUpperCase()}</p>
                </div>

                <div className="mt-4">
                  <p className="text-sm">{coin?.desc}</p>
                </div>

                <a
                  className="underline text-base font-normal text-[#FF00C7]"
                  href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/coins/${coin?.symbol}`}
                >
                  {coin?.symbol}
                </a>
              </div>
            </div>
          )}

          {/*<div className="flex">
            <div className="flex flex-col">
              <p className="font-bold text-base text-white">Community Pass</p>

              <div className="relative w-[7vmax] h-[7vmax] mt-2">
                <Image
                  src={community?.passImage!}
                  alt={`${community?.name ?? "Community"}'s image`}
                  layout="fill"
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="flex flex-col self-center items-center ml-6">
              <div className="flex flex-col my-2">
                <Button
                  size="large"
                  title="Mint"
                  action={() => {}}
                  isLoading={false}
                  isPrimary
                />

                <p className="text-sm text-center">
                  Price 12 {community?.coinSymbol}
                </p>
                <p className="text-tiny text-center">
                  Plus you will be charged a small amount of SOL in transaction
                  fees.
                </p>
              </div>

              <div className="flex flex-col">
                <div className="flex">
                  <p className="text-sm ">Current balance</p>
                  <p className="text-sm mx-2">88.888</p>
                  <p className="text-sm ">{community?.coinSymbol}</p>
                </div>

                <div className="flex mt-1">
                  <p className="text-sm ">Current balance</p>
                  <p className="text-sm mx-2">88.888</p>
                  <p className="text-sm ">SOL</p>
                </div>
              </div>
            </div>
          </div>*/}
        </div>

        <div className="w-full px-4 py-2 grid gap-4 grid-cols-auto xs:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-24">
          {community?.groups.map((group, index) => (
            <div
              className="flex flex-col justify-between border-[1px] border-[#FFFFFF22] rounded-2xl py-4 backdrop-blur-[4px]"
              key={`${group.handle}-${index}`}
            >
              <div className="self-center">
                <a
                  className="text-base text-white font-bold underline"
                  href={`https://t.me/${group.handle}`}
                  target="_blank"
                >
                  {group.handle}
                </a>
              </div>

              {group.privacy === "coin" && (
                <div className="self-center my-2">
                  <p className="text-sm">
                    Amount of Tokens required to join this group:{" "}
                    {group.assetPrice} {community?.coinSymbol}
                  </p>
                </div>
              )}

              {group.privacy !== "open" && (
                <div className="w-[75%] self-center">
                  <Button
                    isPrimary
                    isLoading={false}
                    title={group.privacy === "coin" ? "Swap" : "Mint"}
                    action={() => {
                      if (group.privacy === "coin") {
                        router.push("/swap");
                        return;
                      }
                    }}
                    size="large"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Page;
