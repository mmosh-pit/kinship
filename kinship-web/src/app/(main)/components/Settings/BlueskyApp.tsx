import React from "react";

import Input from "../common/Input";
import Button from "../common/Button";
import client from "@/app/(main)/lib/httpClient";
import { useAtom } from "jotai";
import { data } from "@/app/(main)/store";

const BlueskyApp = () => {
  const [currentUser, setCurrentUser] = useAtom(data);

  const [isLoading, setIsLoading] = React.useState(false);

  const [blueskyHandle, setBlueskyHandle] = React.useState("");
  const [blueskyPassword, setBlueskyPassword] = React.useState("");

  const [showMsg, setShowMsg] = React.useState(false);
  const [msgClass, setMsgClass] = React.useState("");
  const [msgText, setMsgText] = React.useState("");

  const addTool = React.useCallback(async () => {
    setIsLoading(true);

    try {
      await client.post("/bluesky", {
        handle: blueskyHandle,
        password: blueskyPassword,
      });

      setIsLoading(false);

      setCurrentUser((prev) => ({
        ...prev!,
        bluesky: {
          handle: blueskyHandle,
          password: "",
        },
      }));

      createMessage(
        "Your Bluesky account has been added successfully",
        "success-container",
      );
    } catch (err: any) {
      if (err.response?.data?.error === "invalid-bluesky") {
        createMessage("Invalid Bluesky Credentials", "danger-container");
        setIsLoading(false);
        return;
      } else {
        setIsLoading(false);
        createMessage(
          "Unknown error ocurred, please try again",
          "danger-container",
        );
      }
    }
  }, [blueskyHandle, blueskyPassword]);

  const removeBskyAcc = React.useCallback(async () => {
    await client.delete("/bluesky");

    setCurrentUser((prev) => ({ ...prev!, bluesky: null }));
  }, []);

  const createMessage = React.useCallback((message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    if (type == "success-container") {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    } else {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    }
  }, []);

  return (
    <div className="w-full flex flex-col mt-8">
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size py-5 px-3.5 mb-6 mt-2 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      <div className="flex flex-col items-center">
        <div
          className={`flex flex-wrap justify-center items-center md:min-w-[60%] min-w-[80%] my-2 bg-[#03000754] backdrop-filter backdrop-blur-[8px] rounded-lg p-6 min-h-[200px] ${currentUser?.bluesky?.handle && "border-[1px] border-[#FF00AE59]"}`}
        >
          {currentUser?.bluesky?.handle && (
            <div className="w-full h-full flex flex-col justify-between items-center rounded-lg py-2 px-2">
              <div className="flex flex-col items-center">
                <p className="text-base text-white">
                  🟢{" "}
                  <span className="underline text-base text-white">
                    Bluesky handle
                  </span>
                </p>
                <p className="text-sm text-white ml-2">
                  {currentUser!.bluesky.handle}
                </p>
              </div>

              <button
                className="border-[1px] border-white rounded-lg px-4 py-2 cursor-pointer self-center"
                onClick={() => removeBskyAcc()}
              >
                <p className="text-base text-white">Disconnect</p>
              </button>
            </div>
          )}

          {!currentUser?.bluesky?.handle && (
            <div className="w-full flex flex-col items-center justify-center">
              <Input
                title="Bluesky Handle"
                type="text"
                value={blueskyHandle}
                onChange={(e) => setBlueskyHandle(e.target.value)}
                required={false}
                placeholder="example.bsky.social"
              />

              <div className="my-2" />

              <Input
                title="Password"
                type="password"
                value={blueskyPassword}
                onChange={(e) => setBlueskyPassword(e.target.value)}
                required={false}
                placeholder="Password"
              />

              <div className="my-4" />

              <Button
                size="small"
                title="Connect"
                action={addTool}
                isLoading={isLoading}
                isPrimary
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlueskyApp;
