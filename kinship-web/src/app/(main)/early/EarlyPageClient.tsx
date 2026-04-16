"use client";

import BlueskyIcon from "@/assets/icons/BlueskyIcon";
import LinkedinIcon from "@/assets/icons/LinkedinIcon";
import SubstackIcon from "@/assets/icons/SubstackIcon";
import InstagramIcon from "@/assets/icons/InstagramIcon";
import FacebookIcon from "@/assets/icons/FacebookIcon";
import ThreadsIcon from "@/assets/icons/ThreadsIcon";
import YoutubeIcon from "@/assets/icons/YoutubeIcon";
import TiktokIcon from "@/assets/icons/TiktokIcon";
import XIcon from "@/assets/icons/XIcon";
import KinshipBots from "@/assets/icons/KinshipBots";
import { useRouter } from "next/navigation";
import React from "react";

const platformIcons: Record<string, React.ReactNode> = {
  bluesky: <BlueskyIcon width={13} height={12} />,
  linkedin: <LinkedinIcon width={13} height={13} />,
  substack: <SubstackIcon width={14} height={15} />,
  instagram: <InstagramIcon width={14} height={15} />,
  facebook: <FacebookIcon width={17} height={17} />,
  threads: <ThreadsIcon width={14} height={15} />,
  youtube: <YoutubeIcon width={16} height={11} />,
  tiktok: <TiktokIcon width={12} height={13} />,
  x: <XIcon />,
};

export type SocialLink = {
  platform: string;
  label: string;
  url?: string;
};

export type EarlyPageData = {
  heading?: string;
  description?: string;
  youtubeUrl?: string;
  socialLinks?: SocialLink[];
  bottomImageUrl?: string;
};

export default function EarlyPageClient({ data }: { data: EarlyPageData }) {
  const router = useRouter();

  const {
    heading = "Welcome Home",
    description = "We're still building out our platform, and we'll let you know as soon as we're ready to greet you.",
    youtubeUrl = "https://www.youtube.com/embed/o-VRMB0-R98?si=8oxsdk9dn3fsP8aO",
    socialLinks = [],
    bottomImageUrl = "https://storage.googleapis.com/mmosh-assets/home/home_logged_in.png",
  } = data;

  return (
    <div className="w-full h-full background-content flex flex-col home-loggedin-bg">
      <header className="w-full flex justify-center">
        <div className="flex justify-between items-center md:px-16 px-4 py-8 bg-[#32323212] md:backdrop-filter md:backdrop-blur-[13px] md:rounded-full w-full lg:w-[80%] self-center">
          <div className="w-[25%]" onClick={() => router.push("/")}>
            <KinshipBots />
          </div>
          <div className="w-[25%]" />
        </div>
      </header>

      <div className="w-full flex flex-col items-center py-8">
        <h1 className="text-[4vmax] transition duration-300 mt-5 sm:mt-0 text-[3vmax] md:text-[5vmax] sm:leading-[70px] font-goudy bg-[linear-gradient(155deg,#FFF_11.53%,rgba(255,255,255,0.30)_109.53%)] bg-clip-text text-transparent stroke-text md:py-6 py-2">
          {heading}
        </h1>

        <div className="my-6" />

        <p className="text-xl text-white md:max-w-[40%] max-w-[60%] text-center">
          {description}
        </p>

        <div className="my-6" />

        {youtubeUrl && (
          <iframe
            width="560"
            height="315"
            src={youtubeUrl}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}

        <div className="my-6" />

        {socialLinks.length > 0 && (
          <div className="grid grid-cols-3 grid-rows-3 gap-6">
            {socialLinks.map((link) => {
              const icon = platformIcons[link.platform];
              const inner = (
                <div className="flex justify-center items-center rounded-full border-[1px] border-[#FFFFFF32] bg-[#66666622] w-[100px] h-12 mx-8 min-w-[150px]">
                  {icon}
                  <div className="mx-2" />
                  <p className="text-sm text-white">{" " + link.label}</p>
                </div>
              );

              return link.url ? (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {inner}
                </a>
              ) : (
                <div key={link.platform} className="opacity-50 cursor-not-allowed">
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {bottomImageUrl && (
        <div className="relative w-full flex justify-center mt-12">
          <img
            src={bottomImageUrl}
            alt=""
            className="md:w-[60%] w-[80%]"
          />
        </div>
      )}
    </div>
  );
}
