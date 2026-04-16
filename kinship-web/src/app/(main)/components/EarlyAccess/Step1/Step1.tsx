import React from "react";
import { EarlyAccessCircleVW } from "@/app/(catfawn)/catfawn/components/EarlyAccessCircle/EarlyAccessCircleVW";
import { useRouter } from "next/navigation";
import client from "@/app/(main)/lib/httpClient";

const STORAGE_KEY = "early-access-data";

interface Step1Props {
  onSuccess?: () => void;
  earlyAccessRef: any;
  setShowMsg: (data: any) => void;
  setMsgText: (data: any) => void;
  setMsgClass: (data: any) => void;
}

export const Step1: React.FC<Step1Props> = ({
  onSuccess,
  earlyAccessRef,
  setShowMsg,
  setMsgText,
  setMsgClass,
}) => {
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [hasChecked, setHasChecked] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const router = useRouter();

  const msgTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored);
      setFullName(parsed.fullName || "");
      setEmail(parsed.email || "");
      setHasChecked(parsed.hasChecked ?? true);
    } catch {
      router.replace("/");
    }
  }, []);

  const validateForm = () => {
    if (!fullName.trim()) {
      createMessage("First name is required", "error");
      return false;
    } else if (fullName.trim().length < 2) {
      createMessage("First name must be at least 2 characters", "error");
      return false;
    } else if (fullName.trim().length > 20) {
      createMessage("First name can be up to 20 characters only", "error");
      return false;
    }

    if (!email.trim()) {
      createMessage("Email is required", "error");
      return false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email.trim())) {
      createMessage("Please enter a valid email address", "error");
      return false;
    }

    if (!hasChecked) {
      createMessage(
        "You must agree to receive communications before continuing",
        "error",
      );
      return false;
    }

    return true;
  };

  const createVisitorRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setIsLoading(true);

      const response = await client.post("/visitors/generate-otp", {
        type: "email",
        email: email.trim(),
      });

      if (response.data?.status) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            hasChecked,
            hasVerifiedEmail: false,
            currentStep: "2",
          }),
        );
        client
          .post("/visitors/upsert-early-access", {
            email: email.trim(),
            firstName: fullName,
            hasChecked,
            currentStep: "2",
          })
          .catch(() => { });
        if (onSuccess) {
          onSuccess();
        }
      } else {
        createMessage(
          response.data?.message || "Something went wrong",
          "error",
        );
      }
    } catch (err: any) {
      createMessage(
        err?.response?.data?.message ||
        "Unable to generate OTP. Please try again.",
        "error",
      );
    } finally {
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

  return (
    <>
      <div ref={earlyAccessRef} className="bg-[#09073A] py-10 px-4 md:px-8 my-10">
        <div className="lg:flex items-center justify-center">
          <EarlyAccessCircleVW />

          <div className="min-h-[29.875rem] lg:ml-[5rem] m-2  xl:w-[36.188rem] bg-[#100E59] rounded-[1.25rem] pt-[1.563rem] pb-[0.938rem] pl-[3.125rem] pe-[3.313rem] max-md:px-5 max-md:py-8">
            <h3 className="transition duration-300 text-[1.95rem] text-center font-poppinsNew font-bold  tracking-[-1.04px] bg-[linear-gradient(143deg,#FFF_18.17%,rgba(255,255,255,0)_152.61%)] bg-clip-text text-transparent stroke-text">
              Request Early Access
            </h3>

            <p className="text-[#FFFFFFE5] text-base  my-2">
              <span className="text-white font-bold text-base">
                Step 1 of 6: Enter your name and email address.
              </span>
              We’ll send a 6-digit code by email to verify your address.
            </p>

            <form onSubmit={createVisitorRecord}>
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Full Name*</legend>
                <input
                  type="text"
                  className="input w-full bg-[#FFFFFF14] border-[1px] border-[#FFFFFF29]"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={20}
                />
              </fieldset>

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Email address*</legend>
                <input
                  type="text"
                  className="input w-full bg-[#FFFFFF14] border-[1px] border-[#FFFFFF29]"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </fieldset>

              <label className="label">
                <input
                  type="checkbox"
                  className="checkbox bg-[#FFFFFF14] border-[1px] border-[#FFFFFF29]"
                  checked={hasChecked}
                  onChange={(e) => setHasChecked(e.target.checked)}
                />
                <span className="ml-5">
                  By continuing, I agree to receive communications from Kinship
                  Agents, with the understanding that I can unsubscribe at any
                  time. I have reviewed the{" "}
                  <a href="/privacy" target="_blank">
                    Privacy Policy
                  </a>{" "}
                  and accept the{" "}
                  <a href="/tos" target="_blank">
                    Terms of Service
                  </a>
                  .
                </span>
              </label>

              <button
                type="submit"
                className="btn bg-[#EB8000] hover:bg-[#EB8000] w-full text-white font-bold mt-[2rem] border-[#FF710F33] hover:border-none"
                disabled={isLoading}
              >
                {isLoading
                  ? "Sending..."
                  : "Send the security verification code"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};
