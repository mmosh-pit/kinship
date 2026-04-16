"use client";
import { data, userWeb3Info } from "@/app/(main)/store";
import { useAtom } from "jotai";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Bars } from "react-loader-spinner";
import SearchIcon from "@/assets/icons/SearchIcon";
import Image from "next/image";
import ArrowBack from "@/assets/icons/ArrowBack";
import Select from "../common/Select";
import CloseIcon from "@/assets/icons/CloseIcon";
import { useRouter } from "next/navigation";
import MinusIcon from "@/assets/icons/MinusIcon";
import * as anchor from "@coral-xyz/anchor";
import useWallet from "@/utils/wallet";
import internalClient from "@/app/(main)/lib/internalHttpClient";

export default function AgentTeam({
  onPageChange,
  symbol,
}: {
  onPageChange: any;
  symbol: any;
}) {
  const navigate = useRouter();
  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [keyword, setKeyword] = React.useState("");
  const [profileInfo] = useAtom(userWeb3Info);
  const wallet = useWallet();
  const [roles, setRoles] = useState<any>([
    { label: "Founder", value: "Founder", data: [], enabled: true },
    { label: "Owner", value: "Owner", data: [], enabled: true },
    { label: "Admin", value: "Admin", data: [], enabled: true },
    { label: "Treasurer", value: "Treasurer", data: [], enabled: true },
    { label: "Connector", value: "Connector", data: [], enabled: true },
    { label: "Partner", value: "Partner", data: [], enabled: true },
    { label: "Producer", value: "Producer", data: [], enabled: true },
    { label: "Contributor", value: "Contributor", data: [], enabled: true },
  ]);

  const [selectedRoles, setSelectedRoles] = useState("Owner");

  const [profiles, setProfiles] = useState([]);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profilePage, setProfilePage] = useState(1);
  const [isProfilePaging, setIsProfilePaging] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [pageType, setPageType] = React.useState("roles");
  const [projectDetail, setProjectDetail] = React.useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [selectedRole, setSelectedRole] = React.useState<any>(null);
  const [selectedProfileRole, setSelectedProfileRole] =
    React.useState<any>(null);

  useEffect(() => {
    listProfile(1, "");
    getProjectDetailFromAPI();
  }, []);

  const getProjectDetailFromAPI = async () => {
    try {
      setTeamLoading(true);
      let listResult = await axios.get(`/api/project/detail?symbol=${symbol}`);
      setProjectDetail(listResult.data);
      const user = await axios.get(
        `/api/get-wallet-data?wallet=${listResult.data.project.creator}`,
      );
      let newRole: any = [
        {
          label: "Founder",
          value: "Founder",
          desc: "Gensis pass holder",
          data: [],
          enabled: true,
        },
        {
          label: "Owner",
          value: "Owner",
          desc: "Can Update the Gensis Pass",
          data: [],
          enabled: true,
        },
        {
          label: "Admin",
          value: "Admin",
          data: [],
          desc: "Has access to Manage Teams and can assign roles",
          enabled: true,
        },
        {
          label: "Treasurer",
          value: "Treasurer",
          desc: "Has access to the Set Tokenomics",
          data: [],
          enabled: true,
        },
        {
          label: "Connector",
          value: "Connector",
          data: [],
          desc: "Can use the Empower Agent tool (correct agent to Third party systems)",
          enabled: true,
        },
        {
          label: "Partner",
          value: "Partner",
          data: [],
          desc: "Can use the Manage Offerings (add offerings)",
          enabled: true,
        },
        {
          label: "Producer",
          value: "Producer",
          data: [],
          desc: "Can Instruct Agent(add, move, charge system prompts)",
          enabled: true,
        },
        {
          label: "Contributor",
          value: "Contributor",
          data: [],
          desc: "Can use the Inform Agent tool (upload documents to inform Agent), remove documents, etc.",
          enabled: true,
        },
      ];

      newRole = updateRoleData("Founder", [user.data], newRole);

      for (let index = 0; index < listResult.data.profiles.length; index++) {
        const element = listResult.data.profiles[index];
        newRole = updateRoleData(element.role, element.profiles, newRole);
      }

      setRoles(newRole);
      setTeamLoading(false);
    } catch (error) {
      console.log("error ", error);
      setProjectDetail(null);
      setTeamLoading(false);
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

  const listProfile = async (page: any, keyword: any) => {
    try {
      setProfileLoading(true);
      setIsProfilePaging(false);
      let url =
        "/api/get-all-users?sort=royalty&skip=" +
        (page - 1) * 10 +
        "&userType=all&&searchText=" +
        keyword;
      let apiResult = await axios.get(url);

      let newProfile: any = page == 1 ? [] : profiles;

      for (let index = 0; index < apiResult.data.users.length; index++) {
        const element: any = apiResult.data.users[index];
        newProfile.push(element);
      }
      setProfiles(newProfile);
      if (apiResult.data.users.length < 15) {
        setIsProfilePaging(false);
      } else {
        setIsProfilePaging(true);
      }
      setProfileLoading(false);
    } catch (error) {
      setProfileLoading(false);
      setProfiles([]);
    }
  };

  const nextProfilePage = () => {
    let currentPage = profilePage + 1;
    setProfilePage(currentPage);
    listProfile(currentPage, keyword);
  };

  const onProfileSelect = (profileItem: any) => {
    setCurrentProfile(profileItem);
    setPageType("details");
    setSelectedRoles("");
  };

  const createMessage = (message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    setLoading(false);
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

  const onMemberSearch = (event: any) => {
    setKeyword(event.target.value);
    listProfile(profilePage, event.target.value);
  };

  const onProfileRoleUpdate = (role: any) => {
    setSelectedRoles(role);
    const elem = document.activeElement as HTMLElement;
    if (elem) {
      elem?.blur();
    }
  };

  const delay = (ms: any) => new Promise((res) => setTimeout(res, ms));

  const saveTeam = async () => {
    try {
      if (!wallet) {
        createMessage("Wallet is not connected", "danger-container");
        return;
      }
      if (!projectDetail) {
        createMessage("Project details not found", "danger-container");
        return;
      }
      if (selectedRoles === "") {
        createMessage("Role is required", "danger-container");
        return;
      }
      if (projectDetail.project.creator == currentProfile.wallet) {
        createMessage(
          "You can't create role for agent creator",
          "danger-container",
        );
        return;
      }
      setLoading(true);

      const roleKeyPair = anchor.web3.Keypair.generate();

      await internalClient.post("/api/project/save-profile", {
        sender: wallet.publicKey.toBase58(),
        name: currentProfile.profile.name,
        profilekey: currentProfile.wallet,
        role: selectedRoles,
        projectkey: projectDetail.project.key,
        key: roleKeyPair.publicKey.toBase58(),
      });

      createMessage(
        "Agent team role is successfully assigned to " +
        currentProfile.profile.name,
        "success-container",
      );
      getProjectDetailFromAPI();
    } catch (error) {
      createMessage("Something went wrong", "danger-container");
    }
  };

  const filterRole = (role: any) => {
    let newRoles = [];
    for (let index = 0; index < roles.length; index++) {
      const element = roles[index];
      if (element.value == role.value) {
        element.enabled = !element.enabled;
      }
      newRoles.push(element);
    }
    setRoles(newRoles);
  };

  useEffect(() => {
    if (selectedProfileRole) {
      (document.getElementById("delete_modal") as any)?.showModal();
    }
  }, [selectedProfileRole]);

  const deleteProfile = async (role: any, profile: any) => {
    setSelectedRole(role.value);
    setSelectedProfileRole(profile);
  };

  const deleteRoleProfile = async () => {
    (document.getElementById("delete_modal") as any)?.close();

    setSelectedRole(null);
    setSelectedProfileRole(null);

    await internalClient.post("/api/project/delete-profile", {
      profilekey: selectedProfileRole.wallet,
      projectkey: projectDetail.project.key,
    });

    createMessage(
      selectedProfileRole.profile.name + " removed successfully ",
      "success-container",
    );

    getProjectDetailFromAPI();
  };

  return (
    <>
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size mb-5 py-5 px-3.5 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      <div className="background-content">
        <div className="container mx-auto">
          {pageType === "roles" && (
            <>
              <div className="md:flex justify-between mb-10">
                <div className="md:flex">
                  <h2 className="text-sm mr-5 mt-3">Filter:</h2>
                  <div className="md:flex">
                    {roles.map((role: any) => (
                      <>
                        {role.data.length > 0 && (
                          <p
                            className="text-xs text-white bg-[#030007] bg-opacity-40 px-3 py-3.5 rounded-2xl border-[1px] border-[#353485] cursor-pointer mr-3.5 md:mb-0 mb-2.5 flex"
                            onClick={() => {
                              filterRole(role);
                            }}
                          >
                            <span className="mr-2.5 text-xs text-white">
                              {role.value}({role.data.length})
                            </span>
                            {role.enabled && (
                              <span className="mt-1">
                                <CloseIcon />
                              </span>
                            )}
                          </p>
                        )}
                      </>
                    ))}
                  </div>
                </div>
                <button
                  className="btn btn-primary bg-[#6607FF] text-white border-none hover:bg-primary hover:text-white md:mt-0 mt-5"
                  onClick={() => {
                    (document.getElementById("user_modal") as any)?.showModal();
                  }}
                >
                  Add new Members
                </button>
              </div>
              {teamLoading && (
                <div className="flex justify-center">
                  <Bars
                    height="80"
                    width="80"
                    color="rgba(255, 0, 199, 1)"
                    ariaLabel="bars-loading"
                    wrapperStyle={{}}
                    wrapperClass="bars-loading"
                    visible={true}
                  />
                </div>
              )}
              {!teamLoading && (
                <>
                  {roles.map((role: any) => (
                    <>
                      {role.data.length > 0 && role.enabled && (
                        <>
                          <h2 className="text-base text-white mb-2.5">
                            {role.value}({role.data.length})
                          </h2>
                          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
                            {role.data.map((profile: any) => (
                              <>
                                {profile.profile && (
                                  <div className="relative bg-[#030007] bg-opacity-40 p-2.5 rounded-2xl border-[1px] border-[#353485] cursor-pointer min-h-[120px]">
                                    <div className="self-center absolute left-2.5 top-2.5 mr-8">
                                      <div className="w-[100px] h-[100px]">
                                        <Image
                                          src={profile.profile.image}
                                          alt="Profile Image"
                                          className="rounded-md object-cover"
                                          layout="fill"
                                        />
                                      </div>
                                    </div>

                                    <div className="pl-[120px]">
                                      <p className="text-white text-base">
                                        <div className="member-header relative pr-10">
                                          <h2 className="font-bold text-white text-base capitalize break-words">
                                            {profile.profile.name}
                                          </h2>
                                          {role.value != "Founder" && (
                                            <div
                                              className="delete-action absolute right-0 top-0"
                                              onClick={() => {
                                                deleteProfile(role, profile);
                                              }}
                                            >
                                              <MinusIcon />
                                            </div>
                                          )}
                                        </div>
                                        <p
                                          className="cursor-pointer text-primary text-sm underline break-words"
                                          onClick={() => {
                                            navigate.push(
                                              "/" + profile.profile.username,
                                            );
                                          }}
                                        >
                                          @{profile.profile.username}
                                        </p>
                                      </p>

                                      <div className="mt-2.5">
                                        <p className="text-white text-base text-with-ellipsis max-w-[70%] line-clamp-2">
                                          {profile.profile.bio}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ))}
                </>
              )}
            </>
          )}
          {pageType === "details" && (
            <>
              <div
                className="flex text-white cursor-pointer mb-5"
                onClick={() => {
                  setPageType("roles");
                }}
              >
                <span className="mr-2.5 mt-1">
                  <ArrowBack />
                </span>{" "}
                Back
              </div>
              {currentProfile && (
                <>
                  <div className="rounded-xl p-5 bg-[#030007] bg-opacity-40 border border-white border-opacity-20 flex max-w-4xl mx-auto">
                    <div className="self-center mr-8">
                      <div className="relative w-[300px] h-[300px]">
                        <Image
                          src={currentProfile.profile.image}
                          alt="Profile Image"
                          className="rounded-md object-cover"
                          layout="fill"
                        />
                      </div>
                    </div>

                    <div className="w-full flex flex-col">
                      <div className="flex justify-between">
                        <p className="text-white text-lg underline">
                          <span className="font-bold text-white text-lg capitalize">
                            {currentProfile.profile.name}
                          </span>
                        </p>

                        <div className="dropdown rounded-lg">
                          <div
                            tabIndex={0}
                            role="button"
                            className="btn h-[30px] min-h-0"
                          >
                            <p className="text-base text-white">
                              {selectedRoles === ""
                                ? "Select Role"
                                : selectedRoles}
                            </p>
                          </div>
                          <ul
                            tabIndex={0}
                            className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
                          >
                            {roles.map((value: any) => (
                              <li
                                className="flex-none"
                                onClick={() => onProfileRoleUpdate(value.value)}
                              >
                                <p className="text-base text-white flex-none block">
                                  {value.value}
                                  <br />
                                  <span className="text-xs">{value.desc}</span>
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <p className="text-white text-base text-primary">
                        <span className="text-primary text-base capitalize">
                          @{currentProfile.profile.username}
                        </span>
                      </p>

                      <div className="my-4">
                        <p className="text-white text-base text-with-ellipsis max-w-[70%] line-clamp-2">
                          {currentProfile.profile.bio}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-center mt-10">
                    {!loading && (
                      <button
                        className="btn btn-primary bg-[#6607FF] text-white border-none hover:bg-primary hover:text-white md:mt-0 mt-5"
                        onClick={() => {
                          saveTeam();
                        }}
                      >
                        Save
                      </button>
                    )}

                    {loading && (
                      <button className="btn btn-primary bg-[#6607FF] text-white border-none hover:bg-primary hover:text-white md:mt-0 mt-5">
                        Adding...
                      </button>
                    )}
                  </div>
                </>
              )}
              {!currentProfile && (
                <div className="mb-5 text-header-small-font-size text-center">
                  {" "}
                  No profile found{" "}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <dialog id="delete_modal" className="modal">
        <div className="flex flex-col modal-box w-[40%] bg-[#02001A] p-8">
          <div className="custom-select-open grow">
            <div className="flex w-full justify-between mb-2">
              <p className="text-large text-white font-bold">Confirmation</p>

              <button
                className="cursor-pointer"
                onClick={() => {
                  (document.getElementById("delete_modal") as any)?.close();
                  setSelectedRole(null);
                  setSelectedProfileRole(null);
                }}
              >
                <CloseIcon />
              </button>
            </div>
            <p className="mb-5">Are you sure to delete this profile?</p>
            <div className="flex justify-end">
              <button
                className="btn btn-primary bg-[#6607FF] text-white border-none hover:bg-primary hover:text-white"
                onClick={deleteRoleProfile}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </dialog>

      <dialog id="user_modal" className="modal">
        <div className="flex flex-col modal-box w-[40%] bg-[#02001A] p-8">
          <div className="custom-select-open grow">
            <div className="flex w-full justify-between mb-2">
              <p></p>
              <p className="text-large text-white font-bold">Invite</p>

              <button
                className="cursor-pointer"
                onClick={() => {
                  (document.getElementById("user_modal") as any)?.close();
                }}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="search-container mb-5 w-full mx-auto">
              <label
                className={
                  "h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2"
                }
              >
                <div className="p-2">
                  <SearchIcon />
                </div>
                <input
                  type="text"
                  className="grow text-base bg-transparent focus:outline-0 outline-0 hover:outline-0 active:outline-0"
                  placeholder="Look up members"
                  value={keyword}
                  onChange={onMemberSearch}
                />
              </label>
            </div>
            {profileLoading && (
              <div className="flex justify-center">
                <Bars
                  height="80"
                  width="80"
                  color="rgba(255, 0, 199, 1)"
                  ariaLabel="bars-loading"
                  wrapperStyle={{}}
                  wrapperClass="bars-loading"
                  visible={true}
                />
              </div>
            )}
            {!profileLoading && (
              <>
                {profiles.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 mb-5">
                    {profiles.map((profile: any) => (
                      <>
                        {profile.profile && (
                          <div
                            className="relative bg-[#030007] bg-opacity-40 p-2.5 pb-10 cursor-pointer min-h-[120px]"
                            onClick={() => {
                              (
                                document.getElementById("user_modal") as any
                              )?.close();
                              onProfileSelect(profile);
                            }}
                          >
                            <div className="self-center absolute left-2.5 top-2.5 mr-8">
                              <div className="w-[100px] h-[100px]">
                                <Image
                                  src={profile.profile.image}
                                  alt="Profile Image"
                                  className="rounded-md object-cover"
                                  layout="fill"
                                />
                              </div>
                            </div>

                            <div className="pl-[120px]">
                              <p className="text-white text-base">
                                <div className="member-header relative pr-10">
                                  <h2 className="font-bold text-white text-base capitalize break-words">
                                    {profile.profile.name}
                                  </h2>
                                </div>
                                <p className="cursor-pointer text-sm break-words">
                                  @{profile.profile.username}
                                </p>
                              </p>

                              <div className="mt-2.5">
                                <p className="text-white text-base text-with-ellipsis max-w-[70%] line-clamp-2">
                                  {profile.profile.bio}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ))}
                  </div>
                )}
              </>
            )}
            {!profileLoading && profiles.length == 0 && (
              <div className="mb-5 text-header-small-font-size text-center">
                {" "}
                No profile found{" "}
              </div>
            )}

            {isProfilePaging && !profileLoading && (
              <div className="flex justify-center">
                <button
                  className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white"
                  onClick={nextProfilePage}
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
