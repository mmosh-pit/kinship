import internalClient from "@/app/(main)/lib/internalHttpClient";
import { User } from "@/app/(main)/models/user";
import { data } from "@/app/(main)/store";
import axios from "axios";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";

const DesktopNavbar = (props: any) => {
  const [currentUser, setCurrentUser] = useAtom(data);
  const [isPrivate, setPrivate] = useState(false);

  useEffect(() => {
    setPrivate(
      props.user.profile?.isprivate ? props.user.profile?.isprivate : false,
    );
  }, []);

  const onProfileSettingsAction = async () => {
    if (currentUser) {
      let newUSer: User = currentUser;
      if (newUSer.profile) {
        if (!isPrivate) {
          newUSer.profile.isprivate = true;
        } else {
          newUSer.profile.isprivate = false;
        }
      }

      console.log("current user updated ", newUSer);
      setCurrentUser(newUSer);
      setPrivate(newUSer.profile.isprivate);
      await internalClient.put("/api/connections/update-profile-settings", {
        isprivate: newUSer.profile.isprivate,
        wallet: currentUser.wallet,
      });
    }
  };
  return (
    <div
      id="desktop-navbar"
      className="min-w-[15%] px-8 py-16 flex flex-col rounded-2xl"
    >
      <p className="text-lg font-bold mb-8">My MMOSH Account</p>
      <div className="flex my-4">
        <p className="text-base text-white cursor-pointer">Private Profile</p>
        <input
          type="checkbox"
          className="toggle ml-5"
          checked={isPrivate}
          onChange={(event: any) => {
            onProfileSettingsAction();
          }}
        />
      </div>
      <div className="flex my-4">
        <p className="text-base text-white">Bags</p>
        <p className="text-base text-white mx-2">•</p>

        <p id="coming-soon" className="text-base">
          Coming Soon
        </p>
      </div>

      <div className="flex my-4">
        <p className="text-base text-white">Send</p>
        <p className="text-base text-white mx-2">•</p>

        <p id="coming-soon" className="text-base">
          Coming Soon
        </p>
      </div>

      <div className="flex my-4">
        <p className="text-base text-white">Swap</p>
        <p className="text-base text-white mx-2">•</p>

        <p id="coming-soon" className="text-base">
          Coming Soon
        </p>
      </div>

      <div className="flex my-4">
        <p className="text-base text-white">Create</p>
        <p className="text-base text-white mx-2">•</p>

        <p id="coming-soon" className="text-base">
          Coming Soon
        </p>
      </div>

      <div className="flex my-4">
        <p className="text-base text-white">Airdrop</p>
        <p className="text-base text-white mx-2">•</p>

        <p id="coming-soon" className="text-base">
          Coming Soon
        </p>
      </div>
    </div>
  );
};

export default DesktopNavbar;
