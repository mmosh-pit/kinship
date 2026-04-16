"use client";

import KinshipMainIcon from "@/assets/icons/KinshipMainIcon";
import { usePathname } from "next/navigation";
import YoutubeIcon from "@/assets/icons/YoutubeIcon";
import TiktokIcon from "@/assets/icons/TiktokIcon";
import TwitterIcon from "@/assets/icons/TwitterIcon";
import InstagramIcon from "@/assets/icons/InstagramIcon";
import ThreadsIcon from "@/assets/icons/ThreadsIcon";
import FacebookIcon from "@/assets/icons/FacebookIcon";
import SubstackIcon from "@/assets/icons/SubstackIcon";
import BlueskyIcon from "@/assets/icons/BlueskyIcon";
import LinkedinIcon from "@/assets/icons/LinkedinIcon";
import KinshipBots from "@/assets/icons/KinshipBots";

const Footer = () => {
  const pathname = usePathname();

  const scrollTo = (id: string, offset = 120) => {
    const element = document.getElementById(id);
    if (!element) return;

    const top =
      element.getBoundingClientRect().top + window.pageYOffset - offset;

    window.scrollTo({
      top,
      behavior: "smooth",
    });
  };

  if (
    ["/login", "/sign-up", "/forgot-password", "/preview"].includes(pathname)
  ) {
    return <></>;
  }

  return (
    <footer className="items-start pb-12 max-w-[82.625rem] mx-auto px-8 pt-8">
      <div className="items-center flex max-xl:flex-col justify-between">
        <div className="">
          <KinshipBots />
        </div>

        <ul className="flex max-md:flex-col max-xl:gap-2 gap-8 xl:justify-between font-normal mt-8 xl:mt-0">
          <li>
            <a
              className="cursor-pointer"
              onClick={() => scrollTo("origin-story")}
            >
              {" "}
              Origin Story
            </a>
          </li>
          <li>
            <a
              className="cursor-pointer"
              onClick={() => scrollTo("kinship-intelligence")}
            >
              {" "}
              Kinship Intelligence
            </a>
          </li>
          <li>
            <a
              className="cursor-pointer"
              onClick={() => scrollTo("collective-economic")}
            >
              {" "}
              Co-op Economics
            </a>
          </li>
          <li>
            <a
              className="cursor-pointer"
              onClick={() => scrollTo("founding-creator")}
            >
              {" "}
              Founding Sages{" "}
            </a>
          </li>
        </ul>
      </div>

      <div className="xl:flex justify-between items-center mt-12 place-self-center">
        <div>
          <p className="text-sm">
            © 2025 Kinship Media Syndicate. All Rights Reserved.
          </p>
          <p className="text-sm">
            Read our{" "}
            <a href="/tos" target="_blank">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank">
              Privacy Policy
            </a>
          </p>
        </div>
        <div>
          <ul className="flex max-md:flex-wrap max-md:justify-center max-md:gap-3 xl:ml-96 space-x-6 items-center mt-6 xl:mt-0">
            <li>
              <a href="#">
                <YoutubeIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <TiktokIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <TwitterIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <InstagramIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <ThreadsIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <FacebookIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <SubstackIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <BlueskyIcon width={24} height={24} />
              </a>
            </li>
            <li>
              <a href="#">
                <LinkedinIcon width={24} height={24} />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
