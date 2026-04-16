import React from "react";
import { useAtom } from "jotai";

import CustomSelect from "../../common/CustomSelect";
import { step, step2Form } from "@/app/(main)/store/community";
import Button from "../../common/Button";
import StepsTitle from "../common/StepsTitle";
import axios from "axios";
import { userWeb3Info } from "@/app/(main)/store";
import MessageBanner from "../../common/MessageBanner";
import ArrowBack from "@/assets/icons/ArrowBack";

const Step2 = () => {
  const [profileInfo] = useAtom(userWeb3Info);
  const [currentStep, setCurrentStep] = useAtom(step);
  const [selectedItems, setSelectedItems] = useAtom(step2Form);

  const [isLoading, setIsLoading] = React.useState(false);

  const [message, setMessage] = React.useState({
    message: "",
    type: "",
  });

  const navigateToNextStep = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await axios.patch(`/api/update-community-info`, {
        profileAddress: profileInfo?.profile.address,
        data: {
          topics: selectedItems,
        },
      });
      setCurrentStep(currentStep + 1);
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        message:
          "We’re sorry. An error occurred while trying to save your community. Please try again.",
      });
    }

    setIsLoading(false);
  }, [currentStep, selectedItems]);

  const goBack = React.useCallback(() => {
    setCurrentStep(0);
  }, []);

  return (
    <div className="w-full flex flex-col">
      <MessageBanner message={message.message} type={message.type} />

      <div className="w-full h-[80%] flex flex-col justify-between items-center pt-20">
        <div className="w-full flex flex-col items-center">
          <div className="w-full flex justify-between px-12">
            <div
              className="w-[33%] flex items-center cursor-pointer"
              onClick={goBack}
            >
              <ArrowBack />
              <p className="text-white text-sm ml-2">Back</p>
            </div>

            <StepsTitle
              name="Step 2"
              title="Select the Topics and Interests"
              subtitle="Select up to 8 topics and interests associated with your community."
            />

            <div className="w-[33%]" />
          </div>
          <div className="w-[90%] sm:w-[80%] md:w-[35%] mt-12">
            <CustomSelect
              multi
              value=""
              selectedElements={selectedItems}
              onChange={(e) => {
                if (selectedItems.length >= 8) return;
                setSelectedItems([...selectedItems, e]);
              }}
              onDelete={(e) => {
                setSelectedItems(
                  [...selectedItems].filter((item) => item !== e),
                );
              }}
              placeholder="Topics and Interests"
              title="Topics and Interests"
            />
          </div>
        </div>

        <div className="flex w-[50%] md:w-[40%] lg:w-[30%] flex-col">
          <Button
            title="Next"
            size="large"
            isPrimary
            disabled={isLoading}
            isLoading={isLoading}
            action={navigateToNextStep}
          />
        </div>
      </div>
    </div>
  );
};

export default Step2;
