"use client";
import { BackArrowVW } from "@/app/(catfawn)/catfawn/components/BackArrow/BackArrowVW";
import { EarlyAccessCircleVW } from "@/app/(catfawn)/catfawn/components/EarlyAccessCircle/EarlyAccessCircleVW";
import { InputVW } from "@/app/(catfawn)/catfawn/components/Input/InputVW";
import Spinner from "@/app/(catfawn)/catfawn/components/Spinner";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { data as userDataAtom, isAuth, isAuthOverlayOpen } from "@/app/(main)/store";
import client from "@/app/(main)/lib/httpClient";

interface Step7Props {
  onBack?: () => void;
  earlyAccessRef: any;
  setShowMsg: (data: any) => void;
  setMsgText: (data: any) => void;
  setMsgClass: (data: any) => void;
}

export const Step7 = ({
  onBack,
  setShowMsg,
  setMsgText,
  setMsgClass,
  earlyAccessRef,
}: Step7Props) => {
  const router = useRouter();

  const [cachedData, setCachedData] = React.useState<any>({});
  const msgTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [noCodeChecked, setNoCodeChecked] = React.useState(false);
  const [kinshipCode, setKinshipCode] = React.useState("");

  const [isLoading, setIsLoading] = useState(false);

  const [, setIsUserAuthenticated] = useAtom(isAuth);
  const [, setShowAuthOverlay] = useAtom(isAuthOverlayOpen);
  const [, setUser] = useAtom(userDataAtom);

  React.useEffect(() => {
    const stored = localStorage.getItem("early-access-data");
    if (!stored) {
      return router.replace("/");
    }
    try {
      const result = JSON.parse(stored);
      setCachedData(result);
      if (result?.completedSteps !== undefined && result?.completedSteps < 24) {
        router.replace(`/${result.currentStep}`);
      }
      setKinshipCode(result.referedKinshipCode);
      setNoCodeChecked(result.noCodeChecked);
    } catch {
      router.replace("/");
    }
  }, []);

  const onSuccess = async () => {
    try {
      setIsLoading(true);

      const updatedData = {
        ...cachedData,
        completedSteps: 8,
        currentStep: "complete",
      };

      const res = await client.post("/visitors/save-early-access", updatedData);

      if (!res.data?.status) {
        createMessage(
          res.data?.message || "Unable to save information",
          "error",
        );
        setIsLoading(false);
        return;
      }

      localStorage.removeItem("early-access-data");

      if (res.data?.token) {
        window.localStorage.setItem("token", res.data.token);
        setIsUserAuthenticated(true);
        setShowAuthOverlay(false);
        if (res.data?.user) setUser(res.data.user);
      }

      createMessage("Successfully submitted.", "success");
      router.replace("/early");
    } catch {
      createMessage("Something went wrong", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const submitKinshipCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!kinshipCode && !noCodeChecked) {
      createMessage(
        "Please enter a Kinship Code or confirm that you don’t have code.",
        "error",
      );
      return;
    }

    if (noCodeChecked && !kinshipCode) {
      setIsLoading(true);
      localStorage.setItem(
        "early-access-data",
        JSON.stringify({
          ...cachedData,
          referedKinshipCode: "",
          currentStep: "complete",
          noCodeChecked: true,
        }),
      );
      if (onSuccess) onSuccess();
      return;
    }

    if (kinshipCode.length < 3) {
      createMessage(
        "Kinship Code must be between 3 and 20 characters.",
        "error",
      );
      return;
    }

    if (kinshipCode.length > 20) {
      createMessage(
        "Kinship Code must be between 3 and 20 characters.",
        "error",
      );
      return;
    }

    try {
      setIsLoading(true);

      const response = await client.post("/visitors/has-code-exist", {
        code: kinshipCode,
      });

      if (!response.data?.status || !response.data?.result?.exists) {
        createMessage("Invalid Kinship Code. Please try again.", "error");
        setIsLoading(false);
        return;
      }

      localStorage.setItem(
        "early-access-data",
        JSON.stringify({
          ...cachedData,
          referedKinshipCode: kinshipCode,
          noCodeChecked: false,
          currentStep: "complete",
        }),
      );

      if (onSuccess) onSuccess();
    } catch {
      createMessage("Unable to verify Kinship Code.", "error");
      setIsLoading(false);
    }
  };

  const createMessage = (message: string, type: "error" | "success") => {
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);

    if (msgTimeoutRef.current) {
      clearTimeout(msgTimeoutRef.current);
    }

    msgTimeoutRef.current = setTimeout(() => {
      setShowMsg(false);
      msgTimeoutRef.current = null;
    }, 4000);
  };

  const handleBackNavigation = () => {
    const updatedData = { ...cachedData, currentStep: "6" };
    localStorage.setItem("early-access-data", JSON.stringify(updatedData));
    setCachedData(updatedData);
    if (onBack) onBack();
  };

  return (
    <>
      <div ref={earlyAccessRef} className="bg-[#09073A] py-10 px-4 md:px-8 my-10">
        <div className="lg:flex items-center justify-center">
          <EarlyAccessCircleVW />
          <div className="min-h-[29.875rem] lg:ml-[5rem] m-2  xl:w-[36.188rem] bg-[#100E59] rounded-[1.25rem] pt-[1.563rem] pb-[0.938rem] pl-[3.125rem] pe-[3.313rem] max-md:px-5 max-md:py-8">
            <h2 className="relative font-poppinsNew text-center text-[1.563rem] max-md:text-lg leading-[100%] font-bold bg-gradient-to-r from-[#FFFFFF] to-[#FFFFFF88] bg-clip-text text-transparent">
              <BackArrowVW onClick={handleBackNavigation} />
              Request Early Access
            </h2>

            <p className="mt-2 text-sm text-white/90">
              <span className="font-bold">
                Step 6 of 6: Enter your Kinship Code
              </span>{" "}
              Kinship is currently invite-only. Enter a code from a member,
              organization, or agent to join early access.
            </p>

            <form
              className="mt-[1.188rem] min-h-63.5 text-base max-md:text-sm font-normal"
              onSubmit={submitKinshipCode}
            >
              <div className="text-[1rem] mt-[2rem]">
                <InputVW
                  labelText="Kinship Code"
                  value={kinshipCode}
                  placeHolder="Enter code"
                  inputType="text"
                  isRequired={false}
                  type="kinship-code"
                  onChange={(event) => {
                    setKinshipCode(event.target.value.trim());
                    if (event.target.value) setNoCodeChecked(false);
                  }}
                  maxLength={20}
                />

                <label className="flex items-center gap-0.5 text-[#FFFFFFE5] opacity-70 text-[0.75rem] max-md:text-xs leading-[140%] mt-2 -tracking-[0.02em] cursor-pointer">
                  {
                    <input
                      type="checkbox"
                      className="w-[1.438rem] h-[1.438rem] rounded-[0.313rem] cursor-pointer"
                      checked={noCodeChecked}
                      onChange={(e) => {
                        setNoCodeChecked(e.target.checked);
                        if (e.target.checked) setKinshipCode("");
                      }}
                    />
                  }
                  I don’t have a code yet — I’ll add one later
                </label>
              </div>

              <button
                type="submit"
                className="steps_btn_submit mt-[10.438rem] text-white font-bold btn bg-[#EB8000] border-[#FF710F33] w-full hover:bg-[#EB8000] hover:border-[#FF710F33]"
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
