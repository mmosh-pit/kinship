"use client";
import React from "react";
import { useRouter } from "next/navigation";

import { EarlyAccessCircleVW } from "@/app/(catfawn)/catfawn/components/EarlyAccessCircle/EarlyAccessCircleVW";
import { BackArrowVW } from "@/app/(catfawn)/catfawn/components/BackArrow/BackArrowVW";
import Spinner from "@/app/(catfawn)/catfawn/components/Spinner";
import { encryptData } from "@/utils/decryptData";
import { decryptData } from "@/utils/decryptData";
import Input from "../../common/Input";
import EyeLineIcon from "@/assets/icons/EyeLineIcon";
import EyeIcon from "@/assets/icons/EyeIcon";
import client from "@/app/(main)/lib/httpClient";

interface Step3Props {
  onSuccess?: () => void;
  onBack?: () => void;
  earlyAccessRef: any;
  setShowMsg: (data: any) => void;
  setMsgText: (data: any) => void;
  setMsgClass: (data: any) => void;
}

export const Step3: React.FC<Step3Props> = ({
  onSuccess,
  onBack,
  setShowMsg,
  setMsgText,
  setMsgClass,
  earlyAccessRef,
}) => {
  const [cachedData, setCachedData] = React.useState<any>({});
  const [password, setPassword] = React.useState("");
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] =
    React.useState(false);
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

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
      if (parsed.password) setPassword(decryptData(parsed.password));
      setConfirmPassword(decryptData(parsed.password)); // prefill password
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

  const handleBackNavigation = () => {
    const updatedData = {
      ...cachedData,
      currentStep: "2",
    };
    localStorage.setItem("early-access-data", JSON.stringify(updatedData));
    setCachedData(updatedData);

    if (onBack) onBack();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validation
    if (!password) {
      createMessage("Password is required", "error");
      return;
    }
    if (password.length < 12) {
      createMessage("Password must be at least 12 characters", "error");
      return;
    }
    if (password.length > 32) {
      createMessage("Password must not exceed 32 characters", "error");
      return;
    }
    if (/\p{Extended_Pictographic}/u.test(password)) {
      createMessage("Password should not contain emojis", "error");
      return;
    }
    if (!confirmPassword) {
      createMessage("Confirm password is required", "error");
      return;
    }
    if (password !== confirmPassword) {
      createMessage("Password and Confirm Password do not match", "error");
      return;
    }

    const encryptedPassword = encryptData(password);
    const updatedData = {
      ...cachedData,
      password: encryptedPassword,
      currentStep: "4",
    };
    localStorage.setItem("early-access-data", JSON.stringify(updatedData));
    setCachedData(updatedData);

    client
      .post("/visitors/upsert-early-access", {
        email: cachedData.email,
        password: encryptedPassword,
        currentStep: "4",
      })
      .catch(() => { });

    if (onSuccess) onSuccess();
  };

  return (
    <>
      <div ref={earlyAccessRef} className="bg-[#09073A] py-10 px-4 md:px-8 my-10">
        <div className="lg:flex items-center justify-center">
          <EarlyAccessCircleVW />
          <form
            className="min-h-[29.875rem] lg:ml-[5rem] m-2  xl:w-[36.188rem] bg-[#100E59] rounded-[1.25rem] pt-[1.563rem] pb-[0.938rem] pl-[3.125rem] pe-[3.313rem] max-md:px-5 max-md:py-8"
            onSubmit={handleSubmit}
          >
            <h2 className="relative font-poppinsNew text-center text-[1.563rem] max-md:text-lg leading-[100%] font-bold bg-gradient-to-r from-[#FFFFFF] to-[#FFFFFF88] bg-clip-text text-transparent">
              <BackArrowVW onClick={handleBackNavigation} />
              Request Early Access
            </h2>

            <p className="max-sm:text-base text-[#FFFFFFE5] font-avenirNext max-md:text-sm font-bold leading-snug lg:leading-[94%] mt-[1rem] -tracking-[0.02em]">
              Step 3 of 6: Set your password.
              <span className="font-normal font-avenir">
                {" "}
                Use at least 12 characters. Longer is stronger. You can use
                letters, numbers, symbols, or a passphrase.
              </span>
            </p>

            <div className="mt-5">
              <Input
                required={false}
                title="Confirm Password"
                type={passwordVisible ? "text" : "password"}
                maxLength={32}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                trailing={
                  <div className="flex">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setPasswordVisible(!passwordVisible);
                      }}
                      className="bg-[#FFFFFF12] p-2 rounded-lg"
                    >
                      {passwordVisible ? <EyeLineIcon /> : <EyeIcon />}
                    </button>
                  </div>
                }
              />

              <div className="my-4" />
              <Input
                type={confirmPasswordVisible ? "text" : "password"}
                maxLength={32}
                placeholder="Confirm Password"
                value={confirmPassword}
                required={false}
                title="Confirm Password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                trailing={
                  <div className="flex">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setConfirmPasswordVisible(!confirmPasswordVisible);
                      }}
                      className="bg-[#FFFFFF12] p-2 rounded-lg"
                    >
                      {confirmPasswordVisible ? <EyeLineIcon /> : <EyeIcon />}
                    </button>
                  </div>
                }
              />
            </div>

            <button
              type="submit"
              className="steps_btn_submit mt-[5.438rem] text-white font-bold btn bg-[#EB8000] border-[#FF710F33] w-full hover:bg-[#EB8000] hover:border-[#FF710F33]"
            >
              {isLoading ? <Spinner size="sm" /> : "Set Your Password"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
