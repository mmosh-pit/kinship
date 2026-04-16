"use client";

import React, { use } from "react";
import {
  isAuth,
  isDrawerOpen,
  signInCurrentBot,
  signInModal,
  signInModalInitialStep,
} from "@/app/(main)/store";
import { useAtom } from "jotai";
import axios from "axios";
import Image from "next/image";

import * as anchor from "@coral-xyz/anchor";
import useConnection from "@/utils/connection";
import useWallet from "@/utils/wallet";
import { Connectivity as ProjectConn } from "@/anchor/community";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import AgentPageInfo from "../../components/Project/AgentPageInfo";
import useCheckDeviceScreenSize from "@/app/(main)/lib/useCheckDeviceScreenSize";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import { Bars } from "react-loader-spinner";

const defaultRoleData: any = [
  {
    label: "Founder",
    value: "Founder",
    data: [],
    enabled: true,
  },
  {
    label: "Owner",
    value: "Owner",
    data: [],
    enabled: true,
  },
  {
    label: "Admin",
    value: "Admin",
    data: [],
    enabled: true,
  },
  {
    label: "Treasurer",
    value: "Treasurer",
    data: [],
    enabled: true,
  },
  {
    label: "Connector",
    value: "Connector",
    data: [],
    enabled: true,
  },
  {
    label: "Partner",
    value: "Partner",
    data: [],
    enabled: true,
  },
  {
    label: "Producer",
    value: "Producer",
    data: [],
    enabled: true,
  },
  {
    label: "Contributor",
    value: "Contributor",
    data: [],
    enabled: true,
  },
];

const Project = (props: { params: Promise<{ symbol: string }> }) => {
  const params = use(props.params);
  const connection = useConnection();
  const screenSize = useCheckDeviceScreenSize();
  const wallet = useWallet();
  const [_, setCurrentBot] = useAtom(signInCurrentBot);
  const [isAuthenticated] = useAtom(isAuth);
  const [projectLoading, setProjectLoading] = React.useState(true);
  const [projectDetail, setProjectDetail] = React.useState<any>(null);
  const [creatorInfo, setCreatorInfo] = React.useState<any>(null);
  const [isOwner, setOwner] = React.useState(false);
  const [roles, setRoles] = React.useState<any>([...defaultRoleData]);

  const [isUnlocked, setIsUnlocked] = React.useState(false);
  const [inputCode, setInputCode] = React.useState("");
  const [hasValidateCodeError, setHasValidateCodeError] = React.useState(false);
  const [isLoadingVerify, setIsLoadingVerify] = React.useState(false);

  const [__, setIsModalOpen] = useAtom(signInModal);
  const [___, setInitialModalStep] = useAtom(signInModalInitialStep);

  const [projectInfo, setProjectInfo] = React.useState<any>({
    profiles: [],
    activationTokens: [],
    activationTokenBalance: 0,
    totalChild: 0,
    profilelineage: {
      promoter: "",
      promoterprofile: "",
      scout: "",
      scoutprofile: "",
      recruiter: "",
      recruiterprofile: "",
      originator: "",
      originatorprofile: "",
    },
    generation: "",
    invitationPrice: 0,
    mintPrice: 0,
  });

  const [showMsg, setShowMsg] = React.useState(false);
  const [msgClass, setMsgClass] = React.useState("");
  const [msgText, setMsgText] = React.useState("");

  const [isDrawerShown] = useAtom(isDrawerOpen);

  React.useEffect(() => {
    getProjectDetailFromAPI();
    setCurrentBot(params.symbol);
  }, [params.symbol]);

  React.useEffect(() => {
    if (wallet && projectDetail) {
      getUserProfileInfo();
    }
  }, [wallet, projectDetail]);

  const getProjectDetailFromAPI = async () => {
    try {
      setProjectLoading(true);
      const listResult = await axios.get(
        `/api/project/detail?symbol=${params.symbol}`,
      );

      const user = await axios.get(
        `/api/get-wallet-data?wallet=${listResult.data.project.creator}`,
      );

      let newRole = [...defaultRoleData];

      newRole = updateRoleData("Founder", [user.data], newRole);

      for (let index = 0; index < listResult.data.profiles.length; index++) {
        const element = listResult.data.profiles[index];
        newRole = updateRoleData(element.role, element.profiles, newRole);
      }

      setRoles(newRole);

      setProjectDetail(listResult.data);
      setProjectLoading(false);
    } catch (error) {
      setProjectLoading(false);
      setProjectDetail(null);
    }
  };

  const updateRoleData = (type: any, values: any, newRoles: any) => {
    for (let index = 0; index < newRoles.length; index++) {
      const element = roles[index];
      if (element.value == type) {
        for (let i = 0; i < values.length; i++) {
          newRoles[index].data.push(values[i]);
        }
      }
    }
    return newRoles;
  };

  const getUserProfileInfo = async () => {
    if (!wallet) {
      return;
    }

    try {
      const env = new anchor.AnchorProvider(connection.connection, wallet, {
        preflightCommitment: "processed",
      });

      anchor.setProvider(env);
      let projectConn: ProjectConn = new ProjectConn(
        env,
        web3Consts.programID,
        new anchor.web3.PublicKey(projectDetail.project.key),
      );
      let projectInfo = await projectConn.getProjectUserInfo(
        projectDetail.project.key,
      );
      let tokenInfo = await projectConn.metaplex.nfts().findByMint({
        mintAddress: new anchor.web3.PublicKey(projectDetail.project.key),
      });
      let creator = tokenInfo.creators[0].address.toBase58();
      let userInfo = await getUserData(creator);
      setCreatorInfo(userInfo);

      if (projectInfo.profiles.length > 0) {
        if (projectInfo.profiles[0].address == projectDetail.project.key) {
          setOwner(true);
        } else {
          setOwner(false);
        }
      }

      setProjectInfo(projectInfo);
    } catch (_) { }

  };

  const getUserData = async (address: any) => {
    try {
      const result = await axios.get(`/api/get-wallet-data?wallet=${address}`);
      if (result) {
        if (result.data) {
          if (result.data.profile) {
            return result.data.profile;
          }
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  const verifyBotCode = async () => {
    if (!projectDetail) return;
    if (!projectDetail.project) return;
    if (!inputCode) return;

    setIsLoadingVerify(true);
    setHasValidateCodeError(false);

    try {
      const res = await internalClient.get(
        `/api/project/validate-code?symbol=${projectDetail.project.symbol}&code=${inputCode}`,
      );

      const isValid = res.data;

      setHasValidateCodeError(!isValid);
      setIsUnlocked(isValid);
    } catch (err) {
      setHasValidateCodeError(true);
      console.error(err);
    }

    setIsLoadingVerify(false);
  };

  const isMobileScreen = screenSize < 1200;

  if (projectLoading) {
    return (
      <div
        className={`background-content-full-bg flex flex-col ${isDrawerShown ? "z-[-1]" : ""}`}
      >
        <div className="w-full h-full flex justify-center items-center mt-20">
          <Bars
            height="120"
            width="120"
            color="rgba(255, 0, 199, 1)"
            ariaLabel="bars-loading"
            wrapperStyle={{}}
            wrapperClass="bars-loading"
            visible={projectLoading}
          />
        </div>
      </div>
    );
  }

  if (projectDetail?.project?.privacy === "hidden" && !isUnlocked) {
    return (
      <div
        className={`background-content-full-bg flex flex-col ${isDrawerShown ? "z-[-1]" : ""}`}
      >
        <div className="w-full flex flex-col items-center">
          <div className="my-6">
            <h1 className="text-white font-bold text-2xl">Kinship Bots</h1>
          </div>

          <div className="my-4 flex flex-col">
            <p className="text-base">
              To access this bot please enter the required code
            </p>

            <div className="my-2" />

            <Input
              type="text"
              title=""
              value={inputCode}
              onChange={(e: any) => setInputCode(e.target.value)}
              required={false}
              placeholder=""
            />
          </div>

          {hasValidateCodeError && (
            <p className="text-base text-red-500 my-2 text-center">
              You have entered an invalid code
            </p>
          )}

          <Button
            title="Continue"
            size="small"
            action={verifyBotCode}
            isPrimary
            isLoading={isLoadingVerify}
          />
        </div>
      </div>
    );
  }

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
      <div
        className={`background-content-full-bg flex flex-col ${isDrawerShown ? "z-[-1]" : ""}`}
      >
        <div className="flex flex-col backdrop-blur-[6px] rounded-md relative md:mx-16 mx-4 rounded-xl mb-16 p-3">
          {projectDetail && (
            <div className="h-80 overflow-hidden relative">
              <Image
                src="https://storage.googleapis.com/mmosh-assets/home/fd_banner.png"
                alt="Project"
                className="w-full rounded-lg"
                layout="fill"
              />

              {/* FIXED JSX - NO OTHER CHANGES */}
              {(isAuthenticated || isMobileScreen) && (
                <div className="absolute left-0 top-0 h-12 bg-[#00000080] rounded-tl-lg rounded-br-[50px] p-4 lg:w-[280px] md:w-[200px] w-[150px] lg:h-[80px] h-[50px]">
                  <Image
                    src="https://storage.googleapis.com/mmosh-assets/home/fd_logo.png"
                    alt="FDN"
                    layout="fill"
                    className="object-contain p-4"
                  />
                </div>
              )}
            </div>
          )}

          <div className="relative m-auto">
            <div className="bot-image">
              {projectDetail && (
                <Image
                  src={projectDetail.project.image}
                  alt="Project"
                  className="object-cover rounded-full"
                  layout="fill"
                />
              )}
            </div>
          </div>

          {!isMobileScreen && (
            <div className="w-full flex justify-between items-center mb-4 mt-16">
              <div className="flex flex-col mt-4 w-[33%]">
                <div className="flex items-center">
                  <div className="relative w-[80px] h-[80px]">
                    <Image
                      src="https://storage.googleapis.com/mmosh-assets/home/fd_creator.png"
                      alt="Creator"
                      layout="fill"
                    />
                  </div>

                  <div className="flex flex-col ml-8">
                    <h5 className="font-bold text-white text-lg capitalize">
                      Brian Tseng, the Solar Bee
                    </h5>

                    <div className="my-2" />

                    <p className="text-base">Creator, Full Disclosure Bot</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center w-[33%]">
                <h3 className="text-white text-2xl">FULL Disclosure NOW</h3>

                {isAuthenticated && (
                  <p className="text-white text-base mt-4">
                    FDN
                    <span className="text-white text-base mx-2">•</span>
                    BRIAN
                  </p>
                )}
              </div>

              <div className="w-[33%] flex justify-end">
                <button
                  className="rounded-full px-6 py-2 bg-[#FF00AE]"
                  onClick={() => {
                    setIsModalOpen(true);
                    setInitialModalStep(0);
                  }}
                >
                  <p className="text-base text-white">Join the movement</p>
                </button>
              </div>
            </div>
          )}

          {isMobileScreen && (
            <div className="w-full flex flex-col items-center mb-4 mt-16">
              <div className="flex flex-col items-center w-full">
                <h3 className="text-white text-2xl">FULL Disclosure NOW</h3>

                {isAuthenticated && (
                  <p className="text-white text-base mt-4">
                    FDN
                    <span className="text-white text-base mx-2">•</span>
                    BRIAN
                  </p>
                )}
              </div>

              <div className="flex justify-center mb-4 mt-6">
                <button
                  className="w-full rounded-full px-6 py-2 bg-[#FF00AE]"
                  onClick={() => {
                    setIsModalOpen(true);
                    setInitialModalStep(0);
                  }}
                >
                  <p className="text-base text-white">Join the movement</p>
                </button>
              </div>

              <div className="flex flex-col mt-2 w-full bg-[#FFFFFF08] border-[1px] border-[#FFFFFF28] rounded-lg py-4 px-4">
                <div className="flex items-center">
                  <div className="relative w-[80px] h-[80px]">
                    <Image
                      src="https://storage.googleapis.com/mmosh-assets/home/fd_creator.png"
                      alt="Creator"
                      layout="fill"
                    />
                  </div>

                  <div className="flex flex-col ml-4">
                    <h5 className="font-bold text-white text-lg capitalize">
                      Brian Tseng, the Solar Bee
                    </h5>

                    <div className="my-1" />

                    <p className="text-base">Creator, Full Disclosure Bot</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={`bg-[#FFFFFF08] border-[1px] border-[#FFFFFF28] rounded-lg py-4 w-full flex flex-col items-center ${isMobileScreen ? "mt-6" : "mt-12"} mb-8`}
          >
            <h4 className="text-lg text-white font-bold text-center">
              What if the future you always dreamed of was already here?
            </h4>

            <div className="my-2" />

            <p className="text-base leading-[40px] text-white text-center lg:max-w-[65%] max-w-[90%]">
              Join the movement to reveal suppressed tech, hidden programs, and
              the roadmap to humanity’s next evolution.Access cutting-edge
              information, tools, intel, and transformative content from a
              global network of Starseeds, visionaries, and truth-seekers.Stay
              connected to the latest breakthroughs in healing, consciousness,
              and disclosure as we awaken a new era of truth and liberation
              across the universe.
            </p>
          </div>

          {projectDetail?.project && isAuthenticated && (
            <AgentPageInfo agentKey={projectDetail.project.key} roles={roles} />
          )}
        </div>
      </div>
    </>
  );
};

export default Project;
