import React from "react";
import { useAtom } from "jotai";

import { onboardingStep } from "@/app/(main)/store/account";
import ArrowBack from "@/assets/icons/ArrowBack";
import Radio from "../common/Radio";

const Step6 = () => {
  const [_, setSelectedStep] = useAtom(onboardingStep);

  const [selectedOption, setSelectedOption] = React.useState(0);

  return (
    <div className="bg-[#18174750] border-[1px] border-[#FFFFFF80] rounded-lg py-8 md:px-8 px-6 flex flex-col md:w-[55%] w-[70%] mt-4">
      <div className="w-full flex justify-between">
        <button onClick={() => setSelectedStep(4)}>
          <ArrowBack />
        </button>

        <p className="text-white font-goudy text-base text-center">
          Verify your Profile to Claim Your Rewards!
        </p>

        <p className="text-sm">Step 6 of 6</p>
      </div>

      <div className="flex flex-col">
        <div className="w-full flex justify-evenly">
          <Radio
            title="Device Verification"
            checked={selectedOption === 0}
            onChoose={() => setSelectedOption(0)}
            name="device_verification"
          />

          <Radio
            title="Government Verificaition (KYC)"
            checked={selectedOption === 1}
            onChoose={() => setSelectedOption(1)}
            name="goverment_verification"
          />

          <Radio
            title="Community Verification"
            checked={selectedOption === 2}
            onChoose={() => setSelectedOption(2)}
            name="community_verification"
          />
        </div>

        <div className="flex flex-col items-center mt-6">
          <p className="text-sm text-white">
            Enter and confirm your mobile phone number to be verified as an
            individual human user.
          </p>

          <div className="flex"></div>
        </div>
      </div>
    </div>
  );
};

export default Step6;
