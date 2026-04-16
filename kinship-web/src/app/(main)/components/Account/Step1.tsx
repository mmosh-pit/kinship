import React from "react";

import Input from "../common/Input";
import Button from "../common/Button";
import {
  onboardingStep,
  referredSuccess,
  referredUser,
} from "@/app/(main)/store/account";
import { useAtom } from "jotai";
import client from "@/app/(main)/lib/httpClient";
import MessageBanner from "../common/MessageBanner";
import { data } from "@/app/(main)/store";

const Step1 = () => {
  const [currentUser] = useAtom(data);
  const [_, setSelectedStep] = useAtom(onboardingStep);
  const [referralUsername, setReferralUsername] = useAtom(referredUser);
  const [__, setSuccess] = useAtom(referredSuccess);

  const [isLocked, setIsLocked] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    if (currentUser !== null) {
      if (!!currentUser!.referred_by) {
        setIsLocked(true);
      }

      setReferralUsername(currentUser!.referred_by);
    }

    if (referralUsername !== "") {
      setIsLocked(true);
    }
  }, [currentUser]);

  const saveReferr = React.useCallback(async () => {
    if (referralUsername === "") return;

    setIsLoading(true);
    setStatus("");

    try {
      await client.put("/referred", {
        user: referralUsername,
      });
      setSuccess(true);
      setSelectedStep(1);
      setIsLocked(true);
    } catch (_) {
      setStatus("error");
    }
    setIsLoading(false);
  }, [referralUsername]);

  return (
    <div className="flex flex-col w-full items-center overflow-y-hidden mt-8">
      {status && (
        <MessageBanner
          type={status}
          message={
            "We're sorry, we couldn't find a Member with that username. Check that there aren't any errors and try again."
          }
        />
      )}

      <div className="bg-[#18174750] border-[1px] border-[#FFFFFF80] rounded-lg py-8 md:px-8 px-6 flex flex-col md:w-[55%] w-[70%] mt-4 min-h-[60%] justify-between">
        <div className="w-full flex flex-col mt-4">
          <div className="w-full flex justify-end">
            <p className="text-sm">Step 1 of 4</p>
          </div>

          <div className="flex flex-col self-center mb-8 justify-center items-center">
            <p className="text-white font-goudy text-base text-center">
              Who Referred You?
            </p>

            <p className="text-sm text-center md:max-w-[70%] max-w-[85%]">
              Enter the username of the person who referred you, and both of you
              will receive a gift of appreciation in your Kinship Wallet that
              you can use once your Profile is verified.
            </p>
          </div>

          <div className="md:w-[50%] w-[75%] self-center">
            <Input
              title=""
              placeholder="Referral Username"
              required={false}
              readonly={isLocked}
              type="text"
              value={referralUsername}
              onChange={(e) => setReferralUsername(e.target.value)}
            />
          </div>
        </div>

        {isLocked && (
          <div className="mt-8 self-center">
            <Button
              title="Next"
              isLoading={false}
              action={() => {
                setSelectedStep(1);
              }}
              size="small"
              isPrimary
            />
          </div>
        )}

        {(status === "" || status === "error") && !isLocked && (
          <div className="flex mt-8 self-center">
            <Button
              title="Skip"
              isLoading={false}
              action={() => {
                client.put("/onboarding-step", {
                  step: 1,
                });
                setSelectedStep(1);
              }}
              size="small"
              isPrimary={false}
            />

            <div className="mx-4" />

            <Button
              title="Claim Rewards"
              isLoading={isLoading}
              action={() => {
                saveReferr();
              }}
              size="small"
              isPrimary
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Step1;
