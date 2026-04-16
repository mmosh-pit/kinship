"use client";
import React from "react";

import ProfileForm from "../components/Settings/ProfileForm";
import Apps from "../components/Settings/Apps";

const Settings = () => {
  const [selectedPage, setSelectedPage] = React.useState(0);

  const getPage = React.useCallback(() => {
    if (selectedPage === 0) return <ProfileForm />;

    if (selectedPage === 1) return <Apps />;

    return <ProfileForm />;
  }, [selectedPage]);

  return (
    <div className="flex w-full h-full py-4 px-12">
      <div className="hidden lg:flex flex-col py-4 px-8 w-[20%] rounded-lg bg-[#07024563] border border-[#FFFFFF11] max-h-[60%]">
        <p className="text-lg font-bold text-center text-white mb-16">
          Settings
        </p>

        <button onClick={() => setSelectedPage(0)}>
          <p className="text-left text-base text-white">Account</p>
        </button>

        <div className="my-4" />

        <button onClick={() => setSelectedPage(1)}>
          <p className="text-left text-base text-white">Apps</p>
        </button>

        <div className="my-4" />

        <p className="text-base text-white">Verification</p>
      </div>

      <div className="w-full flex flex-col items-center">{getPage()}</div>
    </div>
  );
};

export default Settings;
