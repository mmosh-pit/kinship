"use client";
import React from "react";
import { useRouter } from "next/navigation";

import Spinner from "@/app/(catfawn)/catfawn/components/Spinner";
import { BackArrowVW } from "@/app/(catfawn)/catfawn/components/BackArrow/BackArrowVW";
import { EarlyAccessCircleVW } from "@/app/(catfawn)/catfawn/components/EarlyAccessCircle/EarlyAccessCircleVW";
import client from "@/app/(main)/lib/httpClient";

interface Step2Props {
  onSuccess?: () => void;
  onBack?: () => void;
  earlyAccessRef: any;
  setShowMsg: (data: any) => void;
  setMsgText: (data: any) => void;
  setMsgClass: (data: any) => void;
}

export const Step2: React.FC<Step2Props> = ({
  onSuccess,
  onBack,
  setShowMsg,
  setMsgText,
  setMsgClass,
  earlyAccessRef,
}) => {
  const [cachedData, setCachedData] = React.useState<any>({});
  const [otp, setOtp] = React.useState(["", "", "", "", "", ""]);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasInvalid, setHasInvalid] = React.useState(false);
  const [hasLoadingResendOTP, setHasLoadingResendOTP] = React.useState(false);

  const router = useRouter();

  const msgTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("early-access-data");
      if (!stored) {
        router.replace("/");
        return;
      }
      const parsed = JSON.parse(stored);
      setCachedData(parsed);
    } catch {
      router.replace("/");
    }
  }, []);

  const createMessage = (
    message: string,
    type: "error" | "success" | "warn",
  ) => {
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);

    if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current);
    msgTimeoutRef.current = setTimeout(() => {
      setShowMsg(false);
      msgTimeoutRef.current = null;
    }, 4000);
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^[0-9]?$/.test(value)) return;
    setHasInvalid(false);

    const updated = [...otp];
    updated[index] = value;
    setOtp(updated);

    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    setHasInvalid(false);

    if (e.key === "Backspace") {
      e.preventDefault();
      const updated = [...otp];
      if (otp[index]) {
        updated[index] = "";
        setOtp(updated);
        inputRefs.current[index]?.focus();
      } else if (index > 0) {
        updated[index - 1] = "";
        setOtp(updated);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    e.preventDefault();
    setHasInvalid(false);

    const pasteData = e.clipboardData.getData("text").trim();
    if (!/^\d+$/.test(pasteData)) return;

    const digits = pasteData.split("").slice(0, 6);
    const updated = [...otp];
    digits.forEach((digit, i) => {
      if (index + i < 6) updated[index + i] = digit;
    });

    setOtp(updated);
    const nextPos = Math.min(index + digits.length - 1, 5);
    inputRefs.current[nextPos]?.focus();
  };

  const verifyOTP = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) {
      createMessage("Please enter all 6 digits", "error");
      setHasInvalid(true);
      return;
    }

    try {
      setIsLoading(true);
      const result = await client.post("/visitors/verify-otp", {
        email: cachedData.email,
        otp: code,
        type: "email",
      });

      if (result.data.status) {
        const updatedData = {
          ...cachedData,
          hasVerifiedEmail: true,
          currentStep: "3",
        };

        localStorage.setItem("early-access-data", JSON.stringify(updatedData));
        setCachedData(updatedData);

        client
          .post("/visitors/upsert-early-access", {
            email: cachedData.email,
            hasVerifiedEmail: true,
            currentStep: "3",
          })
          .catch(() => { });

        if (onSuccess) {
          onSuccess();
        }
      } else {
        setHasInvalid(true);
        createMessage(
          result.data.message || "Invalid verification code.",
          "error",
        );
      }
    } catch {
      createMessage("Something went wrong. Please try again.", "error");
      setHasInvalid(true);
    } finally {
      setIsLoading(false);
    }
  };

  const resendOTP = async () => {
    setHasInvalid(false);
    setHasLoadingResendOTP(true);

    try {
      const result = await client.post("/visitors/resend-otp", {
        email: cachedData.email,
        type: "email",
      });

      if (result.data.status) {
        setOtp(["", "", "", "", "", ""]);
        if (result.data.code === "OTP_ALREADY_SENT") {
          createMessage(result.data.message, "warn");
        } else if (result.data.code === "OTP_SENT") {
          createMessage(result.data.message, "success");
        }
      } else {
        createMessage(result.data.message, "error");
        setHasInvalid(true);
      }
    } finally {
      setHasLoadingResendOTP(false);
    }
  };

  const handleBackNavigation = () => {
    const updatedData = {
      ...cachedData,
      currentStep: "1",
    };
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
            <p className="max-sm:text-base font-avenirNext max-md:text-sm font-bold leading-[130%] mt-[0.313rem] -tracking-[0.06em]">
              Step 2 of 6: Enter your name and email address.
              <span className="text-[#FFFFFFE5] font-normal font-avenir -tracking-[0.02em]">
                {" "}
                We sent a security code to {cachedData.email}
                {". "}Please follow the steps below.
              </span>
              <div className="mt-[0.563rem] text-[0.938rem] text-[#FFFFFFE5] leading-relaxed lg:leading-[105%] max-md:text-sm font-normal max-lg:w-max max-lg:mx-auto max-md:w-auto max-lg:text-start text-wrap -tracking-[0.02em]">
                <ul className="ml-6 list-disc font-avenir">
                  <li>Open your email</li>
                  <li>Look for a message from security@kinship.systems</li>
                  <li>Enter the code below to confirm it’s you</li>
                </ul>
              </div>
            </p>
            <form
              className="mt-[1.25rem] text-[1rem] max-md:text-sm font-normal"
              onSubmit={verifyOTP}
            >
              <div className="max-sm:w-auto max-lg:w-max max-lg:mx-auto max-lg:text-center">
                <label className="block mb-[0.313rem] text-[1rem] leading-[100%] text-[#FFFFFFCC] max-lg:mx-auto">
                  Enter your 6-digit code
                </label>
                <div className="mt-[0.313rem] flex justify-center gap-2 sm:gap-3 xl:gap-[1.75rem]">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength={1}
                      value={digit}
                      ref={(el) => {
                        inputRefs.current[idx] = el;
                      }}
                      onChange={(e) => handleOtpChange(e.target.value, idx)}
                      onKeyDown={(e) => handleKeyDown(e, idx)}
                      onPaste={(e) => handlePaste(e, idx)}
                      className={`aspect-square 
                w-[clamp(0.7rem,9vw,3.5rem)]
                rounded-lg 
                text-center text-lg sm:text-xl font-semibold
                backdrop-blur 
                border text-white
                focus:outline-none
                ${hasInvalid
                          ? "bg-[#F8060624] border-[#F806068F]"
                          : "bg-[#FFFFFF14] border-white/20 focus:border-white"
                        }`}
                    />
                  ))}
                </div>

                {!hasInvalid && (
                  <span className="text-[0.75rem] inline-block text-[rgba(255,255,255,0.9)] opacity-70 leading-[140%] font-normal -tracking-[0.02em] mt-[0.313rem]">
                    The code expires in 15 minutes. Didn’t get it? Check your
                    spam folder or request a new code.
                  </span>
                )}
                {hasInvalid && (
                  <span className="text-[0.75rem] inline-block text-[rgba(255,255,255,0.9)] opacity-70 leading-[140%] font-normal -tracking-[0.02em] mt-[0.313rem]">
                    That code doesn’t look right. Please check your email and
                    try again.
                  </span>
                )}

                <div className="text-center text-[0.875rem] text-[#FFFFFFE5] mt-[0.813rem] leading-[140%] font-normal -tracking-[0.02em]">
                  Didn’t get it?{" "}
                  <span
                    onClick={resendOTP}
                    className="cursor-pointer underline"
                  >
                    {hasLoadingResendOTP ? "Sending..." : " Resend code"}
                  </span>
                </div>

                <div className="text-center text-[0.875rem] text-[#FFFFFFE5] mt-[0.813rem] leading-[140%] font-normal -tracking-[0.02em]">
                  Or try{" "}
                  <span className="text-[#007bff]" onClick={onBack}>
                    a different email address
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="steps_btn_submit mt-[5.438rem] text-white font-bold btn bg-[#EB8000] border-[#FF710F33] w-full hover:bg-[#EB8000] hover:border-[#FF710F33]"
                disabled={isLoading}
              >
                {isLoading ? <Spinner size="sm" /> : "Confirm Security Code"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};
