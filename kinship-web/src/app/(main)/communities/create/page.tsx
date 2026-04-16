"use client";
import CreateCommunity from "../../components/Forge/Communities/CreateCommunity";
import { isDrawerOpen } from "@/app/(main)/store";
import { useAtom } from "jotai";

const Page = () => {
  const [isDrawerShown] = useAtom(isDrawerOpen);
  return (
    <div
      className={`background-content flex justify-center ${isDrawerShown ? "z-[-1]" : ""}`}
    >
      <CreateCommunity />
    </div>
  );
};

export default Page;
