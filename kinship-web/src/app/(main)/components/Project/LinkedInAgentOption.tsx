import React from "react";

import LinkedinIcon from "@/assets/icons/LinkedinIcon";
import { AxiosError } from "axios";
import Input from "../common/Input";
import Button from "../common/Button";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const LinkedInAgentOption = ({ project }: { project: string }) => {
  const [isLoading, setIsLoading] = React.useState(false);

  const [linkedinHandle, setLinkedinHandle] = React.useState("");
  const [linkedinPassword, setLinkedinPassword] = React.useState("");
  const [instructions, setInstructions] = React.useState("");

  const [isAddMode, setIsAddMode] = React.useState(false);

  const [linkedinConnections, setLinkedinConnections] = React.useState<
    {
      handle: string;
      password: string;
      instructions: string;
    }[]
  >([]);

  const [showMsg, setShowMsg] = React.useState(false);
  const [msgClass, setMsgClass] = React.useState("");
  const [msgText, setMsgText] = React.useState("");

  const getLinkedinConnections = React.useCallback(async () => {
    const response = await internalClient.get(
      `/api/project/project-tools?project=${project}&type=linkedin`,
    );

    setLinkedinConnections(
      response.data.map((val: any) => ({
        handle: val.data.handle,
        password: "",
        instructions: val.data.instructions,
      })),
    );
  }, [project]);

  React.useEffect(() => {
    getLinkedinConnections();
  }, [project]);

  const addTool = React.useCallback(() => {
    setIsLoading(true);
    internalClient
      .post("/api/project/save-project-tool", {
        type: "linkedin",
        project,
        data: {
          handle: linkedinHandle,
          password: linkedinPassword,
          instructions,
        },
      })
      .then((_) => {
        // Success: Add to local state only when API call succeeds
        setIsLoading(false);

        setLinkedinConnections((prev) => {
          const newConns = [...prev];

          newConns.push({
            handle: linkedinHandle,
            password: "",
            instructions,
          });
          setLinkedinHandle("");
          setLinkedinPassword("");

          return newConns;
        });
        setIsAddMode(false);

        createMessage(
          "Successfully added LinkedIn account to your Agent",
          "success-container",
        );
      })
      .catch((err: AxiosError) => {
        // Error: Do NOT add to local state, only show error message
        setIsLoading(false);

        if (err.response?.data === "invalid-linkedin") {
          createMessage("Invalid LinkedIn Credentials", "danger-container");
        } else if (err.response?.data === "linkedin-exists") {
          createMessage(
            "LinkedIn Handle has already been saved",
            "danger-container",
          );
        } else {
          createMessage(
            "Unknown error occurred, please try again",
            "danger-container",
          );
        }
      });
  }, [project, linkedinHandle, linkedinPassword, instructions]);

  const removeLinkedinAcc = React.useCallback(
    async (handle: string) => {
      await internalClient.delete(
        `/api/project/disconnect-linkedin?project=${project}&handle=${handle}`,
      );

      setLinkedinConnections((prev) => {
        const newConns = [...prev].filter((e) => e.handle !== handle);

        return newConns;
      });
    },
    [project],
  );

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
    <div className="flex flex-col">
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
      <div className="flex flex-col items-start">
        <div className="flex items-center bg-[#D9D9D938] border-[1px] border-[#FFFFFFEB] rounded-2xl px-3 py-1 mb-2">
          <LinkedinIcon width={13} height={13}/> <p className="ml-2 text-white text-sm">LinkedIn</p>
        </div>

        <div
          className={`flex flex-wrap ${linkedinConnections.length === 0 ? "justify-center" : "justify-around"} md:min-w-[60%] min-w-[80%] my-2 bg-[#03000754] backdrop-filter backdrop-blur-[8px] rounded-lg p-6 min-h-[200px]`}
        >
          {linkedinConnections.map((conn, index) => (
            <div
              className="min-w-[300px] flex flex-col justify-between bg-[#00000078] border-[1px] border-[#FFFFFF08] rounded-lg py-4 px-2"
              key={`${conn.handle}-${index}`}
            >
              <div className="flex justify-between items-center">
                <p className="text-base text-white">LinkedIn handle</p>

                <button className="border-white border-[1px] rounded-full p-2">
                  <p className="text-white text-sm">Download LinkedIn History</p>
                </button>
              </div>

              <p className="text-sm text-white ml-2">{conn.handle}</p>

              <div className="flex flex-col my-3">
                <p className="text-base text-white font-bold">System Prompt</p>

                <div className="my-1" />
                <p className="text-sm">{conn.instructions}</p>
              </div>

              <button
                className="border-[1px] border-white rounded-lg px-4 py-2 cursor-pointer self-center"
                onClick={() => removeLinkedinAcc(conn.handle)}
              >
                <p className="text-base text-white">Disconnect</p>
              </button>
            </div>
          ))}

          {isAddMode ? (
            <div
              className={`flex flex-col items-center self-center bg-[#03000754] backdrop-filter backdrop-blur-[8px] p-4 ${linkedinConnections.length > 0 && "ml-4"}`}
            >
              <h5 className="text-white max-w-[70%] text-center mb-4">
                What LinkedIn account do you want to share with your agent?
              </h5>

              <div className="flex justify-between items-start">
                <div className="w-[30vmax] flex flex-col items-center justify-between">
                  <Input
                    title="LinkedIn Handle"
                    type="text"
                    value={linkedinHandle}
                    onChange={(e) => setLinkedinHandle(e.target.value)}
                    required={false}
                    placeholder="example@linkedin.com"
                  />

                  <div className="my-2" />

                  <Input
                    title="Password"
                    type="password"
                    value={linkedinPassword}
                    onChange={(e) => setLinkedinPassword(e.target.value)}
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

                <div className="px-8" />

                <Input
                  title="Instructions"
                  placeholder="Enter instructions for the Agent to follow when interacting through this account."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  type="text"
                  textarea
                  required={false}
                />
              </div>
            </div>
          ) : (
            <div
              className="flex items-center cursor-pointer ml-4"
              onClick={() => setIsAddMode(true)}
            >
              <div className="rounded-full border-[1.5px] border-[#9F9F9F38] bg-[#9A9A9A12] px-2 mr-2">
                <p className="font-bold text-lg text-white">+</p>
              </div>

              <p className="text-base text-white">
                {linkedinConnections.length === 0
                  ? "Add Account"
                  : "Another Account"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LinkedInAgentOption;
