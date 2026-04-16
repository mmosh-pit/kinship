"use client";
import React from "react";
import { useAtom } from "jotai";
import axios from "axios";
import Button from "../../components/common/Button";
import { incomingReferAddress, storeFormAtom } from "@/app/(main)/store/signup";
import SimpleInput from "../../components/common/SimpleInput";
import { useRouter } from "next/navigation";
import KinshipMainIcon from "@/assets/icons/KinshipMainIcon";
import { onboardingStep } from "@/app/(main)/store/account";

function codeIsValid(myString: string) {
  return /\d/.test(myString);
}

const Code = () => {
  const [selectedStep, setSelectedStep] = useAtom(onboardingStep);
  const router = useRouter();

  const divRefs = [
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
  ];

  const [form, setForm] = useAtom(storeFormAtom);

  const [isLoading, setIsLoading] = React.useState(false);

  const [referAddress] = useAtom(incomingReferAddress);

  const [hasError, setHasError] = React.useState(false);

  const [formCodes, setFormCodes] = React.useState<Array<string | null>>([
    null,
    null,
    null,
    null,
    null,
    null,
  ]);

  React.useEffect(() => {
    if (!form.name) {
      router.back();
    }
  }, []);

  const submitCode = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const { confirmPassword, ...data } = form;
      const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/signup`;
      const response = await axios.post(url, {
        ...data,
        referredBy: referAddress,
        code: Number(formCodes.join("")),
      });

      const token = response.data.data.token;
      window.localStorage.setItem("token", token);
      setForm({ ...form, address: response.data.data.user.address });
      setSelectedStep(0);
      router.replace("/account");
    } catch (err) {
      console.error(err);
      setHasError(true);
    }

    setIsLoading(false);
  };

  const handlePastingCode = (value: string) => {
    if (value.length === 6 && codeIsValid(value)) {
      setFormCodes([...value]);
    }
  };

  const getBorderByValue = React.useCallback(
    (value: string | null) => {
      if (hasError) return "border-[1px] border-red-500 rounded-[0.5rem]";

      if (value === null || value === "") return "";

      return "border-[1px] border-green-500 rounded-[0.5rem]";
    },
    [hasError],
  );

  return (
    <div className="w-full min-h-full flex flex-col justify-center items-center background-content relative">
      <div className="login-card-gradient flex flex-col items-center border-[1px] rounded-3xl border-[#FFFFFF65] w-[85%] md:w-[50%] lg:w-[40%] py-8">
        <div className="flex justify-center">
          <KinshipMainIcon />
        </div>

        <div className="flex flex-col items-center my-6">
          <h6 className="my-4">You're almost there!</h6>

          <p className="text-sm">
            Thank you for joining! Please check your inbox for the six-digit
            verification code we just sent and enter it below to activate your
            account
          </p>
        </div>

        <div className="w-[75%] md:w-[60%] lg:w-[50%] flex justify-center my-4">
          {formCodes.map((val, index) => (
            <div className="flex justify-center items-center" key={index}>
              <div className={`max-w-[4vmax] mx-1 ${getBorderByValue(val)}`}>
                <SimpleInput
                  value={val ?? ""}
                  reference={divRefs[index]}
                  maxLength={1}
                  height="4vmax"
                  onPaste={(e) => {
                    handlePastingCode(e.clipboardData.getData("Text"));
                  }}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormCodes((prev) => {
                      const newCodes = [...prev];
                      newCodes[index] = value;

                      return newCodes;
                    });

                    if (index >= 0 && index <= formCodes.length - 1) {
                      if (value) {
                        divRefs[index + 1]?.current?.focus();
                      } else {
                        divRefs[index - 1]?.current?.focus();
                      }
                    }
                  }}
                />
              </div>
              {index === 2 && (
                <div className="h-[1px] w-[0.5vmax] mx-1 self-center bg-[#ECECEC]" />
              )}
            </div>
          ))}
        </div>

        <div className="w-[60%] md:w-[35%] lg:w-[20%] mb-4 mt-8">
          <Button
            title="Next"
            action={submitCode}
            size="large"
            isPrimary
            disabled={!codeIsValid(formCodes.join(""))}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default Code;
