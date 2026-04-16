"use client";

import AgentPass from "../components/Project/AgentPass";
import AgentTeam from "../components/Project/AgentTeam";
import AgentCoin from "../components/Project/AgentCoin";
import ProjectCreateStep4 from "../components/Project/ProjectCreateStep4";
import ProjectCreateStep7 from "../components/Project/ProjectCreateStep7";
import ProjectCreateStep8 from "../components/Project/ProjectCreateStep8";
import ProjectCreateStep9 from "../components/Project/ProjectCreateStep9";
import { useEffect, useState } from "react";
import Select from "../components/common/Select";
import useWallet from "@/utils/wallet";
import axios from "axios";
import AgentStudioToolsCreate from "../components/Project/AgentStudioToolsCreate";
import InstructAgent from "../components/Project/InstructAgent";
import AgentOffer from "../components/Project/AgentOffer";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { data } from "@/app/(main)/store";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";

export default function ProjectCreate() {
  const wallet: any = useWallet();
  const router = useRouter();
  const [currentUser] = useAtom(data);

  const [projectType, setProjectType] = useState([
    { label: "New Personal Agent", value: "personal" },
    { label: "New Kinship Agent", value: "kinship" },
  ]);
  const [selectedProjectType, setSelectedProjectType] = useState("personal");

  const [options, setOptions] = useState([
    { label: "Deploy New Personal Agent", value: "Tokenize Agent" },
  ]);
  const [selectedOption, setSelectedOption] = useState("Tokenize Agent");
  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [projects, setProjects] = useState([]);
  const [membershipInfo, setMembershipInfo] = useState<any>({});
  const [isAdmin, setIsAdmin] = useState(false);

  const getProjectList = async (address: any) => {
    try {
      const result = await internalClient.get(
        `/api/project/mylist?creator=${address}`,
      );
      let newTypes = [
        { label: "New Personal Agent", value: "personal" },
        { label: "New Kinship Agent", value: "kinship" },
      ];
      for (let index = 0; index < result.data.length; index++) {
        const element = result.data[index];
        newTypes.push({ label: element.name, value: element.symbol });
      }
      setProjectType(newTypes);
      setProjects(result.data);
    } catch (error) {
      console.log("getProjectList error ", error);
    }
  };

  useEffect(() => {
    if (currentUser) {
      if (currentUser?.role !== "wizard") {
        router.replace("/chat");
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (!wallet) {
      return;
    }
    getProjectList(wallet.publicKey.toBase58());
    checkMembershipStatus();
    checkAccountType();
  }, [wallet]);

  useEffect(() => {
    if (selectedProjectType === "New Personal Agent") {
      setOptions([{ label: "Tokenize Agent", value: "Tokenize Agent" }]);
    } else {
      getProjectDetailFromAPI(selectedProjectType);
    }
  }, [selectedProjectType]);

  // Sync selectedOption with the first option dynamically
  useEffect(() => {
    console.log(options, "options in the useEffect");
    if (options.length > 0) {
      console.log(options[0].value, "options[0].value in the useEffect");
      setSelectedOption(options[0].value);
    }
  }, [options]);

  const checkAccountType = async () => {
    const token = localStorage.getItem("token") || "";
    let response = await axios.get(
      `/api/is-admin?wallet=${wallet.publicKey.toBase58()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    setIsAdmin(response.data.result);
  };

  const getProjectDetailFromAPI = async (symbol: any) => {
    try {
      const projectName = projectType.find(
        (val) => val.value === symbol,
      )?.label;
      console.log(projectName, "projectName from the projectType array");

      let listResult = await axios.get(`/api/project/detail?symbol=${symbol}`);
      console.log(
        listResult.data.project.creator,
        "listResult from the api list call in getProjectDetailFromAPI",
      );
      console.log(
        wallet.publicKey.toBase58(),
        "wallet.publicKey.toBase58() in getProjectDetailFromAPI",
      );

      if (listResult.data.project.creator === wallet.publicKey.toBase58()) {
        setOptions([
          { label: `Empower ${projectName}`, value: "Tools" },
          { label: `Update ${projectName} Genesis Pass`, value: "Update" },
          { label: `Inform ${projectName}`, value: "Inform" },
          { label: "Manage Offerings", value: "Offerings" },
          {
            label: `Set ${projectName}'s Tokenomics`,
            value: "Coins",
          },
          { label: "Manage Teams", value: "Teams" },
          {
            label: `Instruct ${projectName}`,
            value: "Instruct",
          },
        ]);
      } else {
        let role = "";
        for (let index = 0; index < listResult.data.profiles.length; index++) {
          const element = listResult.data.profiles[index];
          if (element.profiles.length > 0) {
            if (element.profiles[0].wallet === wallet.publicKey.toBase58()) {
              role = element.role;
              break;
            }
          }
        }
        if (role == "Owner") {
          setOptions([
            { label: `Update ${projectName} Genesis Pass`, value: "Update" },
          ]);
        } else if (role == "Admin") {
          setOptions([{ label: "Manage Teams", value: "Teams" }]);
        } else if (role == "Treasurer") {
          setOptions([
            {
              label: `Set ${projectName}'s Tokenomics`,
              value: "Coins",
            },
          ]);
        } else if (role == "Connector") {
          setOptions([{ label: `Empower ${projectName}`, value: "Tools" }]);
        } else if (role == "Partner") {
          setOptions([{ label: "Manage Offerings", value: "Offerings" }]);
        } else if (role == "Producer") {
          setOptions([
            {
              label: `Instruct ${projectName}`,
              value: "Instruct",
            },
          ]);
        } else if (role == "Contributor") {
          setOptions([{ label: `Inform ${projectName}`, value: "Inform" }]);
        }
      }
    } catch (error) {
      setOptions([]);
    }
  };

  const onPageChange = () => { };

  const createMessage = (message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    // setLoading(false);
    // setButtonStatus("Mint")
    if (type == "success-container") {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    } else {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    }
  };

  const checkMembershipStatus = async () => {
    const membershipInfo = await axios.get(
      "/api/membership/get-membership-info?wallet=" +
      wallet!.publicKey.toBase58(),
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      },
    );
    setMembershipInfo(membershipInfo.data);
  };
  const hasAllowedToCreateBot = () => {
    if (isAdmin) return { status: true, message: "" };
    const { status, membership } = membershipInfo || {};

    if (!status || !membership || status === "expired") {
      return {
        status: false,
        message:
          "You are not allowed to create an agent. Please upgrade your membership and try again.",
      };
    }

    const personalAgentCount = projects.filter(
      (p: any) => p.type === "personal",
    ).length;
    console.log("----- personalAgentCount -----", personalAgentCount);
    const kinshipAgentCount = projects.filter(
      (p: any) => p.type === "kinship",
    ).length;
    console.log("----- kinshipAgentCount -----", kinshipAgentCount);

    if (selectedProjectType === "personal" && personalAgentCount >= 3) {
      return {
        status: false,
        message: `You’ve reached your limit — as an ${membership}, you can create up to 3 personal agents.`,
      };
    }

    if (selectedProjectType === "kinship" && membership !== "creator") {
      return {
        status: false,
        message: `You are not allowed to create a kinship agent. Please upgrade your membership to the creator level and try again.`,
      };
    }
    if (selectedProjectType === "kinship" && kinshipAgentCount >= 3) {
      return {
        status: false,
        message: `You’ve reached your limit — as an ${membership}, you can create up to 3 kinship agents.`,
      };
    }

    return { status: true, message: "" };
  };

  return (
    <>
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size py-5 px-3.5 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      <div className="background-content">
        <div className="flex flex-col items-center justify-center w-full">
          <div className="relative w-full flex flex-col justify-center items-center pt-10">
            <div className="max-w-md">
              <h2 className="text-center text-white font-goudy font-normal text-xl">
                Agent Studio
              </h2>
            </div>
          </div>
        </div>

        <div className="py-6 px-5 xl:px-32 lg:px-16 md:px-8 max-w-7xl mx-auto">
          <div className="mb-10">
            <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-4 xl:grid-cols-4 gap-4">
              {/* <div>
                  <Select
                  value={selectedStudioType}
                  onChange={(e) =>{
                     createMessage("Design Studio currently supports the development of Projects only.", "warn-container");
                     setSelectedStudioType("Project");
                     }}
                     options={studioType}
                  />
               </div> */}
              <div className="lg:col-start-2 xl:col-start-2">
                <Select
                  value={selectedProjectType}
                  onChange={(e) => {
                    const projectName = projectType.find(
                      (val) => val.value === e.target.value,
                    )?.label;
                    if (!["personal", "kinship"].includes(e.target.value)) {
                      setOptions([
                        { label: `Empower ${projectName}`, value: "Tools" },
                        {
                          label: `Update ${projectName} Genesis Pass`,
                          value: "Update",
                        },
                        { label: `Inform ${projectName}`, value: "Inform" },
                        { label: "Manage Offerings", value: "Offerings" },
                        {
                          label: `Set ${projectName}'s Tokenomics`,
                          value: "Coins",
                        },
                        { label: "Manage Teams", value: "Teams" },
                        {
                          label: `Instruct ${projectName}`,
                          value: "Instruct",
                        },
                      ]);
                    } else {
                      setOptions([
                        {
                          label: `Deploy ${projectName}`,
                          value: "Tokenize Agent",
                        },
                      ]);
                    }
                    setSelectedProjectType(e.target.value);
                  }}
                  options={projectType}
                />
              </div>
              <div>
                <Select
                  value={selectedOption}
                  onChange={(e) => {
                    setSelectedOption(e.target.value);
                  }}
                  options={options}
                />
              </div>
            </div>
          </div>
        </div>

        {selectedOption === "Tokenize Agent" && (
          <AgentPass
            type={selectedProjectType}
            hasAllowed={hasAllowedToCreateBot()}
          />
        )}
        {selectedOption === "Update" && (
          <AgentPass
            symbol={selectedProjectType}
            type={selectedProjectType}
            hasAllowed={hasAllowedToCreateBot()}
          />
        )}

        {selectedOption === "Tools" && (
          <AgentStudioToolsCreate symbol={selectedProjectType} />
        )}

        {selectedOption === "Teams" && (
          <AgentTeam onPageChange={onPageChange} symbol={selectedProjectType} />
        )}
        {selectedOption === "Coins" && (
          <AgentCoin
            onPageChange={onPageChange}
            symbol={selectedProjectType}
            createMessage={createMessage}
          />
        )}
        {selectedOption === "step4" && (
          <ProjectCreateStep4 onPageChange={onPageChange} />
        )}
        {selectedOption === "Vesting" && (
          <ProjectCreateStep7 onPageChange={onPageChange} />
        )}
        {selectedOption === "Listing" && (
          <ProjectCreateStep8 onPageChange={onPageChange} />
        )}
        {selectedOption === "Inform" && (
          <ProjectCreateStep9 symbol={selectedProjectType} />
        )}

        {selectedOption === "Offerings" && (
          <AgentOffer symbol={selectedProjectType} />
        )}

        {selectedOption === "Instruct" && (
          <InstructAgent symbol={selectedProjectType} />
        )}
      </div>
    </>
  );
}
