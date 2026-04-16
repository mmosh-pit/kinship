"use client";

import React from "react";
import { useRef, useState } from "react";
import AlertModal from "../(main)/components/Modal";
import KinshipBots from "@/assets/icons/KinshipBots";
import Button from "../(main)/components/common/Button";
import LandingPageDrawer from "../(main)/components/LandingPageDrawer";
import { testimonials } from "@/constants/testimonials";
import { Step1 } from "../(main)/components/EarlyAccess/Step1/Step1";
import { Step2 } from "../(main)/components/EarlyAccess/Step2/Step2";
import { Step3 } from "../(main)/components/EarlyAccess/Step3/Step3";
import { Step4 } from "../(main)/components/EarlyAccess/Step4/Step4";
import { Step5 } from "../(main)/components/EarlyAccess/Step5/Step5";
import { Step6 } from "../(main)/components/EarlyAccess/Step6/Step6";
import { Step7 } from "../(main)/components/EarlyAccess/Step7/Step7";
import { ErrorContainerVW } from "../(catfawn)/catfawn/components/ErrorContainer/ErrorContainerVW";
import { useRouter, useSearchParams } from "next/navigation";
import { useAtom } from "jotai";
import { data, isAuth, isAuthModalOpen, isAuthOverlayOpen } from "./store";
import client from "./lib/httpClient";
import WizardEditButton from "./components/AiPageEditor/WizardEditButton";
import AiPageEditor from "./components/AiPageEditor/AiPageEditor";
import { BlockRenderer } from "./components/BlockRenderer";
import type { NavItem } from "./page";

const STORAGE_KEY = "early-access-data";

type CMSBlock = Record<string, any> & { blockType: string; blockName?: string };

export default function LandingPage({
  layout = [],
  navItems = [],
}: {
  layout?: CMSBlock[];
  navItems?: NavItem[];
}) {
  const searchParams = useSearchParams();
  const [isUserAuthenticated, setIsUserAuthenticated] = useAtom(isAuth);
  const router = useRouter();
  const [_, setShowAuthOverlay] = useAtom(isAuthOverlayOpen);
  const [__, setIsAuthModalOpen] = useAtom(isAuthModalOpen);
  const [currentUser, setCurrentUser] = useAtom(data);

  const [isLoadingLogout, setIsLoadingLogout] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalStep, setInitialModalStep] = useState(0);

  const earlyAccessRef = useRef<HTMLDivElement>(null);
  const mainSection = useRef<HTMLDivElement>(null);
  const testimonialsSection = useRef<HTMLDivElement>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const itemsPerSlide = 3;

  const totalSlides = Math.ceil((testimonials?.length || 0) / itemsPerSlide);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setCurrentStep(Number(parsed.currentStep) || 1);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setCurrentStep(1);
    }
  }, []);

  const checkIfIsAuthenticated = React.useCallback(async () => {
    const url = `/is-auth`;

    try {
      const result = await client.get(url);

      const user = result.data?.data?.user;

      if (!!user && !isUserAuthenticated) {
        router.replace("/early");
      }

      setShowAuthOverlay(!user);
      setIsAuthModalOpen(!user);
      setIsUserAuthenticated(!!user);
      setCurrentUser(user);
    } catch (err) {
      // router.replace("/");
    }
  }, [STORAGE_KEY, isUserAuthenticated]);

  const prevSlide = () => {
    if (!totalSlides) return;
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const nextSlide = () => {
    if (!totalSlides) return;
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const visibleTestimonials = (testimonials ?? []).slice(
    currentSlide * itemsPerSlide,
    currentSlide * itemsPerSlide + itemsPerSlide,
  );

  const [currentStep, setCurrentStep] = useState<number>(1);

  React.useEffect(() => {
    checkIfIsAuthenticated();
  }, []);

  const scrollWithOffset = (
    ref: React.RefObject<HTMLElement | null>,
    offset = 120,
  ) => {
    if (!ref.current) return;

    const elementTop =
      ref.current.getBoundingClientRect().top + window.pageYOffset;

    window.scrollTo({
      top: elementTop - offset,
      behavior: "smooth",
    });
  };

  const scrollToId = (id: string, offset = 120) => {
    const el = document.getElementById(id);
    console.log("Scrolling to ID: ", id, el);
    if (!el) return;
    // const top = el.offsetTop;
    // window.scrollTo({ top: top, behavior: "scooth" });
    el.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    const menuType = searchParams.get("menu_type");
    if (menuType === "origin_story") {
      scrollToId("origin-story");
    } else if (menuType === "kinship_intelligence") {
      scrollToId("ai-infrastructure");
    } else if (menuType === "co_op_economics") {
      scrollToId("creator-economy");
    } else if (menuType === "founding_sages") {
      scrollToId("pricing");
    } else if (menuType === "join_early_access") {
      scrollWithOffset(earlyAccessRef);
    }
  }, []);

  const logout = async () => {
    if (isLoadingLogout) return;

    setIsLoadingLogout(true);
    await client.delete("/logout", {});
    window.localStorage.removeItem("token");
    setIsLoadingLogout(false);

    setIsUserAuthenticated(false);
    setCurrentUser(null);
    setIsAuthModalOpen(false);
    setShowAuthOverlay(true);
  };

  const [showMsg, setShowMsg] = React.useState(true);
  const [msgClass, setMsgClass] = React.useState("success");
  const [msgText, setMsgText] = React.useState("");

  // When loaded in the preview iframe, hide editor UI
  const isPreviewMode = searchParams.get("_wizard_preview") === "1";

  return (
    <div className="relative h-full">
      {!isPreviewMode && <AiPageEditor />}
      <header className="w-full fixed flex justify-center z-10">
        <div className="flex justify-between items-center max-2xl:container px-4 max-xl:py-4 py-8 bg-[#32323212] backdrop-filter backdrop-blur-[13px] sm:rounded-full w-full 2xl:mx-40 self-center">
          <button
            className="hidden xl:block"
            onClick={() =>
              mainSection.current?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <KinshipBots />
          </button>

          <div className="flex xl:hidden flex-col items-center justify-center">
            <LandingPageDrawer scrollToId={scrollToId} navItems={navItems} />
          </div>
          <div className="hidden xl:flex justify-center items-center rounded-full border-[#FFFFFF47] border-[1px] bg-[#FFFFFF0F] px-4 py-2">
            {navItems.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="xl:mx-4 md:mx-2" />}
                <a
                  className="text-base text-white cursor-pointer"
                  onClick={() =>
                    item.actionType === "scroll"
                      ? scrollToId(item.sectionId ?? "")
                      : router.push(item.url ?? "/")
                  }
                >
                  {item.label}
                </a>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {currentUser == null && (
              <div className="font-bold">
                <Button
                  action={() => router.push("/login")}
                  size="small"
                  isPrimary
                  title="Login"
                  isLoading={false}
                />
              </div>
            )}

            {currentUser != null && (
              <div className="font-bold">
                <Button
                  action={logout}
                  size="small"
                  isPrimary
                  title="Logout"
                  isLoading={false}
                />
              </div>
            )}

            {!isPreviewMode && <WizardEditButton />}
            <div className="font-bold">
              <Button
                action={() => scrollWithOffset(earlyAccessRef)}
                size="small"
                isPrimary
                title="Join Early Access"
                isLoading={false}
              />
            </div>
          </div>
        </div>
        <ErrorContainerVW
          showMessage={showMsg}
          className={msgClass}
          messageText={msgText}
        />
      </header>

      <AlertModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isHome={false}
        initialStep={initialModalStep}
      />
      <div
        className="bg-[#050824] text-white min-h-screen mx-auto overflow-hidden top-0 w-full"
        ref={mainSection}
      >
        {layout.map((block, i) => (
          <BlockRenderer
            key={block.id || i}
            block={block}
            onScrollToEarlyAccess={() => scrollWithOffset(earlyAccessRef)}
          />
        ))}

        {currentStep === 1 && (
          <Step1
            onSuccess={() => setCurrentStep(2)}
            earlyAccessRef={earlyAccessRef}
            setShowMsg={setShowMsg}
            setMsgClass={setMsgClass}
            setMsgText={setMsgText}
          />
        )}
        {currentStep === 2 && (
          <Step2
            onSuccess={() => setCurrentStep(3)}
            earlyAccessRef={earlyAccessRef}
            onBack={() => setCurrentStep(1)}
            setShowMsg={setShowMsg}
            setMsgClass={setMsgClass}
            setMsgText={setMsgText}
          />
        )}
        {currentStep === 3 && (
          <Step3
            onSuccess={() => setCurrentStep(4)}
            earlyAccessRef={earlyAccessRef}
            onBack={() => setCurrentStep(1)}
            setShowMsg={setShowMsg}
            setMsgClass={setMsgClass}
            setMsgText={setMsgText}
          />
        )}
        {currentStep === 4 && (
          <Step4
            onSuccess={() => setCurrentStep(5)}
            earlyAccessRef={earlyAccessRef}
            onBack={() => setCurrentStep(3)}
            setShowMsg={setShowMsg}
            setMsgClass={setMsgClass}
            setMsgText={setMsgText}
          />
        )}
        {currentStep === 5 && (
          <Step5
            onSuccess={() => setCurrentStep(6)}
            earlyAccessRef={earlyAccessRef}
            onBack={() => setCurrentStep(4)}
            setShowMsg={setShowMsg}
            setMsgClass={setMsgClass}
            setMsgText={setMsgText}
          />
        )}
        {currentStep === 6 && (
          <Step7
            earlyAccessRef={earlyAccessRef}
            onBack={() => setCurrentStep(6)}
            setShowMsg={setShowMsg}
            setMsgClass={setMsgClass}
            setMsgText={setMsgText}
          />
        )}

        <section
          className="px-4 max-md:my-6 my-10 mx-auto"
          ref={testimonialsSection}
        >
          <div className="w-full px-4">
            <div className="relative max-w-[80rem] mx-auto">
              <button
                onClick={prevSlide}
                className="absolute top-1/2 left-[-2%] 2xl:left-[-5%] transform -translate-y-1/2 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white z-10"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>

              <button
                onClick={nextSlide}
                className="absolute top-1/2 right-[-2%] 2xl:right-[-5%] transform -translate-y-1/2 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white z-10"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>

              <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
                {visibleTestimonials.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-[linear-gradient(155deg,#070a38_0%,#07052e_109.53%)] text-white rounded-xl p-6 shadow-xl text-center border border-[#FFFFFF42]"
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      className="mx-auto mb-4 w-16 h-16 rounded-full object-cover border-2 border-white"
                    />
                    <p className="text-base italic mb-4 font-avenir">
                      &ldquo;{item.text}&rdquo;
                    </p>
                    <h3 className="font-extrabold text-lg font-avenirLtStd">
                      {item.name}
                    </h3>
                    <p className="text-sm text-gray-300 font-avenirLtStd">
                      {item.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
