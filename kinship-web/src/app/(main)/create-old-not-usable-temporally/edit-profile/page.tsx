"use client";

import React from "react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import * as anchor from "@coral-xyz/anchor";
import { data } from "@/app/(main)/store";
import MessageBanner from "../../components/common/MessageBanner";
import ImagePicker from "../../components/ImagePicker";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Select from "../../components/common/Select";
import axios from "axios";
import { ProfileInfo, ProfileLineage } from "@/app/(main)/models/profileInfo";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { Connection } from "@solana/web3.js";
import { pinImageToShadowDrive } from "@/app/(main)/lib/uploadImageToShdwDrive";
import { pinFileToShadowDrive } from "@/app/(main)/lib/uploadFileToShdwDrive";
import useWallet from "@/utils/wallet";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const PronounsSelectOptions = [
  {
    label: "They/Them",
    value: "they/them",
  },
  {
    label: "He/Him",
    value: "he/him",
  },
  {
    label: "She/Her",
    value: "she/her",
  },
];

const EditProfile = () => {
  const wallet = useWallet();
  const navigate = useRouter();
  const [profileInfo, setProfileInfo] = React.useState<ProfileInfo | null>(
    null,
  );
  const [currentUser, setCurrentUser] = useAtom(data);
  const [image, setImage] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    lastName: "",
    username: "",
    description: "",
    descriptor: "",
    noun: "",
    pronouns: "they/them",
  });

  const [message, setMessage] = React.useState({
    type: "",
    message: "",
  });

  const [error, setError] = React.useState({
    error: false,
    message: "",
  });

  const checkForUsername = React.useCallback(async () => {
    if (["create"].includes(form.username.toLowerCase())) {
      setError({
        error: true,
        message: "Username already exists!",
      });
      return;
    }

    const result = await axios.get(
      `/api/check-username?username=${form.username}`,
    );

    if (result.data) {
      setError({
        error: true,
        message: "Username already exists!",
      });
      return;
    }

    setError({
      error: false,
      message: "",
    });
  }, [form.username]);

  const createMessage = React.useCallback((text: string, type: string) => {
    setMessage({ message: text, type });
  }, []);

  const validateFields = () => {
    console.log("validateFields 1", profileInfo);
    if (!profileInfo) return;

    console.log("validateFields 2");
    if (profileInfo.solBalance < 0.04) {
      createMessage(
        "Hey! We checked your wallet and you don’t have enough SOL for the gas fees. Get some Solana and try again!",
        "warn",
      );
      return false;
    }

    console.log("validateFields 4");
    if (form.name.length == 0) {
      createMessage("First name is required", "error");
      return false;
    }
    console.log("validateFields 5");
    if (form.username.length == 0) {
      createMessage("Username is required", "error");
      return false;
    }
    console.log("validateFields 6");
    return true;
  };

  const submitForm = React.useCallback(async () => {
    console.log("submitForm 1", profileInfo?.profile.address);
    if (
      !validateFields() ||
      !profileInfo ||
      !wallet ||
      !currentUser
    ) {
      return;
    }
    console.log("submitForm 2");

    createMessage("", "");
    console.log("submitForm 3");
    setIsLoading(true);
    let profile = currentUser.profile;

    let body = {
      image: profile.image,
    };

    if (image) {
      const imageUri = await pinImageToShadowDrive(image);
      body.image = imageUri;
      if (imageUri === "") {
        createMessage(
          "We’re sorry, there was an error while trying to uploading image. please try again later.",
          "error",
        );
        setIsLoading(false);
        return;
      }
    }

    profile.bio = form.description;
    profile.nouns = form.noun;
    profile.name = form.name + " " + form.lastName;
    profile.username = form.username;
    profile.descriptor = form.descriptor;
    profile.pronouns = form.pronouns;
    console.log("submitForm 4");
    currentUser.profile = profile;


    let updateProfile = currentUser.profile;
    updateProfile.bio = form.description;
    updateProfile.nouns = form.noun;
    updateProfile.name = form.name + " " + form.lastName;
    updateProfile.username = form.username;
    updateProfile.descriptor = form.descriptor;
    updateProfile.pronouns = form.pronouns;

    await internalClient.put("/api/connections/update-profile", {
      value: updateProfile,
      wallet: currentUser.wallet,
    });
    currentUser.profile = updateProfile;

    setCurrentUser(currentUser);
    console.log("submitForm 5");
    navigate.replace(`/` + form.username);
    console.log("submitForm 6");
    setIsLoading(false);
  }, [wallet, profileInfo, image, form]);

  React.useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
  }, [image]);

  React.useEffect(() => {
    if (currentUser) {
      let nameArray: any = currentUser.profile.name.split(" ");
      setForm({
        name: nameArray.length > 0 ? nameArray[0] : "",
        lastName: nameArray.length > 1 ? nameArray[1] : "",
        username: currentUser.profile.username,
        description: currentUser.profile.bio,
        descriptor: currentUser.profile.descriptor,
        noun: currentUser.profile.nouns,
        pronouns: currentUser.profile.pronouns,
      });
      setPreview(currentUser.profile.image);
    }
  }, [currentUser]);

  React.useEffect(() => {
    if (wallet) {
      getProfileInfo();
    }
  }, [wallet]);

  const getProfileInfo = async () => {
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
      confirmTransactionInitialTimeout: 120000,
    });
    const env = new anchor.AnchorProvider(connection, wallet!, {
      preflightCommitment: "processed",
    });

    let userConn: UserConn = new UserConn(env, web3Consts.programID);

    const profileInfo = await userConn.getUserInfo();
    let profileLineage = profileInfo.profilelineage as ProfileLineage;
      const user = await axios.get(
        `/api/get-wallet-data?wallet=${wallet?.publicKey.toBase58()}`,
      );

      const username = user.data?.profile?.username;

      setProfileInfo({
        profileLineage,
        solBalance: profileInfo.solBalance,
        mmoshBalance: profileInfo.oposTokenBalance,
        usdcBalance: profileInfo.usdcTokenBalance,
        profile: {
          name: username,
          address: wallet?.publicKey.toBase58()!,
          image: user.data?.profile?.image,
        },
      });

  };

  return (
    <div className="background-content">
      <div className="w-full flex justify-center">
        <div className="flex flex-col items-center justify-center w-full">
          <MessageBanner type={message.type} message={message.message} />
          <div className="flex flex-col md:w-[70%] w-[90%]">
            <div className="self-center md:w-[45%] w-[80%] pt-20">
              <h4 className="text-center text-white font-goudy font-normal mb-8">
                Edit your Profile
              </h4>
              <p className="text-base text-center">
                MMOSH DAO members can create their own coins, build community
                and help allocate resources to support the growth and expansion
                of our ecosystem.
              </p>
            </div>
            <div className="w-full self-start mt-8">
              <p className="text-lg text-white">About You</p>
            </div>

            <div className="w-full flex flex-col lg:flex-row items-center lg:items-stretch justify-around mt-4">
              <div className="flex flex-col w-[100%] sm:w-[85%] lg:w-[25%] mb-4 md:mb-0">
                <p className="text-sm">
                  Avatar<sup>*</sup>
                  <ImagePicker changeImage={setImage} image={preview} />
                </p>
              </div>

              <div className="flex flex-col w-full lg:w-[35%] xs:w-[85%] md:px-[3vmax]">
                <Input
                  type="text"
                  title="First Name or Alias"
                  required
                  helperText="Up to 50 characters, can have spaces."
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />

                <Input
                  type="text"
                  title="Last Name"
                  required={false}
                  helperText="Up to 15 characters"
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                />

                <Input
                  type="text"
                  title="Username"
                  required
                  helperText={error.error ? error.message : "15 characters"}
                  error={error.error}
                  value={form.username}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      username: e.target.value.replace(/\s/g, ""),
                    })
                  }
                  onBlur={checkForUsername}
                  placeholder="Username"
                />

                <div className="flex flex-col">
                  <p className="text-xs text-white">
                    Pronouns<sup>*</sup>
                  </p>
                  <Select
                    value={form.pronouns}
                    onChange={(e) =>
                      setForm({ ...form, pronouns: e.target.value })
                    }
                    options={PronounsSelectOptions}
                  />
                </div>
              </div>

              <div className="flex flex-col mt-4 md:mt-4 w-[85%] lg:w-fit">
                <Input
                  type="text"
                  title="Description"
                  required={false}
                  placeholder="Tell us about yourself in up to 160 characters"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  textarea
                />

                <div className="flex flex-col mt-4 w-full md:w-fit">
                  <p className="text-xs text-white">Superhero Identity</p>
                  <label className="text-tiny">
                    Example: Frank the Amazing Elf
                  </label>

                  <div className="flex w-full items-center">
                    <p className="text-xs text-white mb-[0.5vmax] mr-4">The</p>
                    <div className="flex flex-col">
                      <Input
                        type="text"
                        title=""
                        helperText="Example: Amazing"
                        required={false}
                        value={form.descriptor}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            descriptor: e.target.value,
                          })
                        }
                        placeholder="Descriptor"
                      />
                    </div>

                    <div className="flex flex-col ml-4">
                      <Input
                        type="text"
                        title=""
                        helperText="Example: Elf"
                        required={false}
                        value={form.noun}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            noun: e.target.value,
                          })
                        }
                        placeholder="Noun"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full flex flex-col justify-center items-center mt-20 md:w-[45%] w-[80%] self-center">
              <Button
                isLoading={isLoading}
                isPrimary
                title="Mint Your Profile"
                size="large"
                action={submitForm}
                disabled={isLoading}
              />
              <div className="flex flex-col justify-center items-center">
                <p className="text-tiny text-white">
                  Small amount of SOL for gas fees
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfile;
