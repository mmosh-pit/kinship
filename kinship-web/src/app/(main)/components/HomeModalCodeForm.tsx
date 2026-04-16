"use client";
import React from "react";
import { useAtom } from "jotai";
import { incomingReferAddress, storeFormAtom } from "@/app/(main)/store/signup";
import SimpleInput from "./common/SimpleInput";
import Button from "./common/Button";
import client from "@/app/(main)/lib/httpClient";
import { isAuth, isAuthOverlayOpen, signInCurrentBot } from "@/app/(main)/store";

type HomeModalCodeFormProps = {
  onSuccess: () => void;
};

function codeIsValid(myString: string) {
  return /\d/.test(myString);
}

const HomeModalCodeForm = ({ onSuccess }: HomeModalCodeFormProps) => {
  const divRefs = [
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
    React.useRef<HTMLInputElement>(null),
  ];

  const [form, setForm] = useAtom(storeFormAtom);
  const [currentBot] = useAtom(signInCurrentBot);

  const [isLoading, setIsLoading] = React.useState(false);

  const [referAddress] = useAtom(incomingReferAddress);
  const [_, setIsAuth] = useAtom(isAuth);
  const [__, setOverlayVisible] = useAtom(isAuthOverlayOpen);

  const [hasError, setHasError] = React.useState(false);

  const [formCodes, setFormCodes] = React.useState<Array<string | null>>([
    null,
    null,
    null,
    null,
    null,
    null,
  ]);

  const submitCode = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const { confirmPassword, ...data } = form;
      const url = `/signup`;
      const response = await client.post(url, {
        ...data,
        referredBy: referAddress,
        code: Number(formCodes.join("")),
        from_bot: currentBot.toUpperCase(),
      });

      const token = response.data.data.token;
      window.localStorage.setItem("token", token);
      setIsAuth(true);
      setOverlayVisible(false);
      setForm({ ...form, address: response.data.data.user.address });
      onSuccess();
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
    [hasError]
  );

  return (
    <div className="w-full min-h-full flex flex-col items-center pt-4 px-6 relative">
      <div className="flex flex-col items-center my-6">
        <div className="flex justify-center mb-2">
          <h1 className="text-[2vmax] font-bold font-goudy text-white">
            You're almost there!
          </h1>
        </div>
        <p className="text-sm font-bold text-center text-white">
          Thank you for joining! Please check your inbox for the six-digit
          verification code we just sent and enter it below to activate your
          account.
        </p>
      </div>

      <div className="w-[95%] md:w-[40%] lg:w-[25%] flex justify-center my-4">
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
  );
};

export default HomeModalCodeForm;
