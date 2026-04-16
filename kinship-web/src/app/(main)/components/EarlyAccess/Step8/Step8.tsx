"use client";
import { BackArrowVW } from "@/app/(catfawn)/catfawn/components/BackArrow/BackArrowVW";
import { EarlyAccessCircleVW } from "@/app/(catfawn)/catfawn/components/EarlyAccessCircle/EarlyAccessCircleVW";
import Spinner from "@/app/(catfawn)/catfawn/components/Spinner";
import axios from "axios";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

interface Step8Props {
  onBack?: () => void;
  earlyAccessRef: any;
  setShowMsg: (data: any) => void;
  setMsgText: (data: any) => void;
  setMsgClass: (data: any) => void;
}

export const Step8 = ({
  onBack,
  setShowMsg,
  setMsgText,
  setMsgClass,
  earlyAccessRef,
}: Step8Props) => {
  const router = useRouter();

  const [cachedData, setCachedData] = useState<any>({});
  const [aboutYou, setAboutYou] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const msgTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("early-access-data");
    if (!stored) return router.replace("/");

    try {
      const parsed = JSON.parse(stored);
      setCachedData(parsed);
      setAboutYou(parsed.aboutYou || "");

      if (parsed?.completedSteps !== undefined && parsed.completedSteps < 7) {
        router.replace(`/${parsed.currentStep}`);
      }
    } catch {
      router.replace("/");
    }
  }, []);

  const createMessage = (message: string, type: "error" | "success") => {
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);

    if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current);
    msgTimeoutRef.current = setTimeout(() => {
      setShowMsg(false);
      msgTimeoutRef.current = null;
    }, 4000);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!aboutYou.trim()) {
      createMessage("Please tell us about yourself.", "error");
      return;
    }

    if (aboutYou.trim().length < 50) {
      createMessage("Please enter at least 50 characters.", "error");
      return;
    }

    try {
      setIsLoading(true);

      const updatedData = {
        ...cachedData,
        about: aboutYou.trim(),
        completedSteps: 8,
        currentStep: "complete",
      };

      const res = await axios.post(
        "/api/visitors/save-early-access",
        updatedData,
      );

      if (!res.data?.status) {
        createMessage(
          res.data?.message || "Unable to save information",
          "error",
        );
        setIsLoading(false);
        return;
      }

      localStorage.removeItem("early-access-data");
      createMessage("Successfully submitted.", "success");
      router.replace("/early");
    } catch {
      createMessage("Something went wrong", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    const updated = { ...cachedData, currentStep: "7" };
    localStorage.setItem("early-access-data", JSON.stringify(updated));
    if (onBack) onBack();
  };

  return (
    <>
      <div ref={earlyAccessRef} className="bg-[#09073A] py-10 px-4 md:px-8 my-10">
        <div className="lg:flex items-center justify-center">
          <EarlyAccessCircleVW />
          <div className="min-h-[29.875rem] lg:ml-[5rem] m-2  xl:w-[36.188rem] bg-[#100E59] rounded-[1.25rem] pt-[1.563rem] pb-[0.938rem] pl-[3.125rem] pe-[3.313rem] max-md:px-5 max-md:py-8">
            <h2 className="relative font-poppinsNew text-center text-[1.563rem] max-md:text-lg leading-[100%] font-bold bg-gradient-to-r from-[#FFFFFF] to-[#FFFFFF88] bg-clip-text text-transparent">
              <BackArrowVW onClick={handleBack} />
              Request Early Access
            </h2>

            <p className="max-sm:text-base text-[#FFFFFFE5] font-avenirNext max-md:text-sm font-bold leading-snug lg:leading-[88%] mt-5 -tracking-[0.04em]">
              Step 8 of 8: Enter a Kinship Code from your Referrer. <br />
              <span className="font-normal font-avenir">
                Tell us about yourself, challenges you may be facing, and your
                major aspirations. From what you’ve learned, how can Kinship
                Intelligence support you and your work in the world? What can
                you bring to contribute to our cooperative?
              </span>
            </p>

            <form
              className="mt-[1.188rem] min-h-63.5 text-base max-md:text-sm font-normal"
              onSubmit={handleSubmit}
            >
              <div className="text-[1rem]">
                <textarea
                  value={aboutYou}
                  onChange={(e) => setAboutYou(e.target.value)}
                  placeholder="5,000 characters"
                  maxLength={5000}
                  className="textarea textarea-xs w-full min-h-[12rem] bg-[#FFFFFF14] border-[1px] border-[#FFFFFF29]"
                ></textarea>
              </div>

              <button
                type="submit"
                className="steps_btn_submit mt-2 text-white font-bold btn bg-[#EB8000] border-[#FF710F33] w-full hover:bg-[#EB8000] hover:border-[#FF710F33]"
              >
                {isLoading ? <Spinner size="sm" /> : "Join Early Access"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};
