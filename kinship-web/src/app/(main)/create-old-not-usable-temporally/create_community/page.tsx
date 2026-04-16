"use client";
import React from "react";
import axios from "axios";
import { useAtom } from "jotai";

import { isDrawerOpen, userWeb3Info, web3InfoLoading } from "@/app/(main)/store";
// import Step1 from "@/app/(main)/components/Forge/Communities/Step1";
// import Step2 from "@/app/(main)/components/Forge/Communities/Step2";
// import Step3 from "@/app/(main)/components/Forge/Communities/Step3";
// import Step4 from "@/app/(main)/components/Forge/Communities/Step4";
import { step, step1Form, step2Form, step3Form } from "@/app/(main)/store/community";
import CreateCommunity from "../../components/Forge/Communities/CreateCommunity";

// const componentsList = [<Step1 />, <Step2 />, <Step3 />, <Step4 />];

const StartACommunity = () => {
  const [isLoading, setIsLoading] = React.useState(false);

  const [isLoadingProfile] = useAtom(web3InfoLoading);
  const [isDrawerShown] = useAtom(isDrawerOpen);
  const [profileInfo] = useAtom(userWeb3Info);
  const [currentStep, setCurrentStep] = useAtom(step);
  const [_, setStep1Form] = useAtom(step1Form);
  const [__, setStep2Form] = useAtom(step2Form);
  const [___, setStep3Form] = useAtom(step3Form);

  const fetchLastCommunity = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(
        `/api/list-incompleted-community?profile=${profileInfo?.profile.address}`,
      );

      if (!response.data) {
        setCurrentStep(0);
        setIsLoading(false);
        return;
      }

      const communityData = response.data.data;

      if (!communityData.name) {
        setCurrentStep(0);
        setIsLoading(false);
        return;
      }

      setStep1Form({
        name: communityData.name,
        symbol: communityData.symbol,
        description: communityData.description,
        preview: communityData.passImage,
        image: null,
      });

      if (!communityData.topics) {
        setCurrentStep(1);
        setIsLoading(false);
        return;
      }

      setStep2Form(communityData.topics || []);

      if (!communityData.coin) {
        setCurrentStep(2);

        setIsLoading(false);
        return;
      }

      setStep3Form({
        coin: communityData.coin,
        creatorRoyalties: communityData.creatorRoyalties,
        promoterRoyalties: communityData.promoterRoyalties,
        scoutRoyalties: communityData.scoutRoyalties,
        invitationPrice: communityData.invitationPrice,
        invitation: communityData.invitation,
        passPrice: communityData.passPrice,
        invitationDiscount: communityData.invitationDiscount,
      });

      setCurrentStep(3);
      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setCurrentStep(0);
      setIsLoading(false);
    }
  };

  const renderComponent = React.useCallback(() => {
    // return componentsList[currentStep];
    return <CreateCommunity />;
  }, [currentStep]);

  React.useEffect(() => {
    if (!!profileInfo?.profile.address) {
      fetchLastCommunity();
    }
  }, [profileInfo?.profile.address]);

  if (isLoadingProfile || isLoading) {
    return (
      <div className="background-content flex w-full justify-center items-center">
        <span className="loading loading-spinner w-[8vmax] h-[8vmax] loading-lg bg-[#BEEF00]"></span>
      </div>
    );
  }

  return (
    <div
      className={`background-content flex justify-center ${isDrawerShown ? "z-[-1]" : ""}`}
    >
      {renderComponent()}
    </div>
  );
};

export default StartACommunity;
