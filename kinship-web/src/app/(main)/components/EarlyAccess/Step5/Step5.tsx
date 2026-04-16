"use client";
import { BackArrowVW } from "@/app/(catfawn)/catfawn/components/BackArrow/BackArrowVW";
import { EarlyAccessCircleVW } from "@/app/(catfawn)/catfawn/components/EarlyAccessCircle/EarlyAccessCircleVW";
import Spinner from "@/app/(catfawn)/catfawn/components/Spinner";
import client from "@/app/(main)/lib/httpClient";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

interface Step5Props {
  onSuccess?: () => void;
  onBack?: () => void;
  setShowMsg: (data: any) => void;
  setMsgText: (data: any) => void;
  setMsgClass: (data: any) => void;
  earlyAccessRef: any;
}

export const Step5: React.FC<Step5Props> = ({
  onSuccess,
  onBack,
  setShowMsg,
  setMsgText,
  setMsgClass,
  earlyAccessRef,
}) => {
  const router = useRouter();

  const [cachedData, setCachedData] = useState<any>({});
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadingResendOTP, setHasLoadingResendOTP] = useState(false);
  const [hasInvalid, setHasInvalid] = useState(false);

  const msgTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("early-access-data");
    if (!stored) return router.replace("/");

    try {
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

    const pasteData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!pasteData) return;

    const newOtp = [...otp];
    pasteData.split("").forEach((char, i) => {
      if (index + i < 6) newOtp[index + i] = char;
    });

    setOtp(newOtp);
    inputRefs.current[Math.min(index + pasteData.length, 5)]?.focus();
  };

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d?$/.test(value)) return;
    setHasInvalid(false);

    const updated = [...otp];
    updated[index] = value;
    setOtp(updated);

    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const verifyOTP = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const enteredOtp = otp.join("");

    if (enteredOtp.length !== 6) {
      createMessage("Please enter the full 6-digit code.", "error");
      setHasInvalid(true);
      return;
    }

    try {
      setIsLoading(true);

      const res = await client.post("/visitors/verify-otp", {
        mobile: cachedData.mobileNumber,
        otp: enteredOtp,
        type: "sms",
        currentStep: "6",
      });

      if (res.data.status) {
        localStorage.setItem(
          "early-access-data",
          JSON.stringify({
            ...cachedData,
            isMobileNumberVerified: true,
            currentStep: "6",
          }),
        );
        client
          .post("/visitors/upsert-early-access", {
            email: cachedData.email,
            isMobileNumberVerified: true,
            currentStep: "6",
          })
          .catch(() => { });
        onSuccess?.();
      } else {
        setHasInvalid(true);
        createMessage(res.data.message || "Invalid code", "error");
      }
    } catch {
      createMessage("Something went wrong", "error");
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
        type: "sms",
        mobile: cachedData.mobileNumber,
        countryCode: cachedData.countryCode,
        email: cachedData.email,
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
    const updated = { ...cachedData, currentStep: "4" };
    localStorage.setItem("early-access-data", JSON.stringify(updated));
    onBack?.();
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
                Step 5 of 6: Verify your mobile number.
              </span>{" "}
              We sent a six digit code to {cachedData.mobileNumber}
            </p>

            <form className="mt-6" onSubmit={verifyOTP}>
              <label className="block mb-2 text-white/80 text-center">
                Enter your 6-digit code
              </label>

              <div className="flex justify-center gap-3">
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

              <div className="text-center mt-3 text-sm text-white/80">
                Didn’t get a code?{" "}
                <span onClick={resendOTP} className="underline cursor-pointer">
                  {hasLoadingResendOTP ? "Sending..." : "Resend"}
                </span>
              </div>

              <button
                type="submit"
                className="steps_btn_submit mt-[10.438rem] text-white font-bold btn bg-[#EB8000] border-[#FF710F33] w-full hover:bg-[#EB8000] hover:border-[#FF710F33]"
              >
                {isLoading ? <Spinner size="sm" /> : "Confirm Mobile Code"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};
