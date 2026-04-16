import React from "react";
import axios from "axios";
import { useAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";

import { data, userWeb3Info } from "@/app/(main)/store";
import MessageBanner from "../common/MessageBanner";
import ImagePicker from "../ImagePicker";
import { buyMembership, createProfile } from "@/app/(main)/lib/forge/createProfile";
import Input from "../common/Input";
import Button from "../common/Button";
import useWallet from "@/utils/wallet";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import ImageAccountPicker from "../Account/ImageAccountPicker";
import { uploadFile } from "@/app/(main)/lib/firebase";
import client from "@/app/(main)/lib/httpClient";
import { getAccount, getAssociatedTokenAddress } from "forge-spl-token";
import { Connectivity as UserConn } from "@/anchor/user";
import { web3Consts } from "@/anchor/web3Consts";
import { pinImageToShadowDrive } from "@/app/(main)/lib/uploadImageToShdwDrive";
import { pinFileToShadowDrive } from "@/app/(main)/lib/uploadFileToShdwDrive";
import * as anchor from "@coral-xyz/anchor";
import { updateUserData } from "@/app/(main)/lib/forge/updateUserData";
import Radio from "../common/Radio";
import useConnection from "@/utils/connection";
import { ProfileLineage } from "@/app/(main)/models/profileInfo";

const ProfileForm = () => {
  const connection = useConnection()
  const wallet = useWallet();
  const navigate = useRouter();
  const searchParams = useSearchParams();
  const [profileInfo, setProfileInfo] = useAtom(userWeb3Info);
  const [currentUser, setCurrentUser] = useAtom(data);
  const [image, setImage] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState(
    "https://storage.googleapis.com/mmosh-assets/default.png",
  );
  const [hasReferer, setHasReferer] = React.useState(false);
  const [referer, setReferer] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [bannerImage, setBannerImage] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState("");

  const [hasProfile, setHasProfile] = React.useState(false);

  const [form, setForm] = React.useState({
    name: "",
    lastName: "",
    displayName: "",
    username: "",
    host: "",
    description: "",
    descriptor: "",
    noun: "",
    link: "",
  });

  const [balance, setBalance] = React.useState({
    sol: 0,
    usdc: 0,
  });

  const [hasMonthly, setHasMonthly] = React.useState<boolean>(true);
  const [membershipStatus, setMembershipStatus] = React.useState(searchParams.get("membershipStatus") || "na");
  const [membershipInfo, setMembershipInfo] = React.useState<any>({});
  const [tab, setTab] = React.useState("guest");
  const [showMsg, setShowMsg] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (currentUser) {
      const guestData = currentUser!.guest_data;
      const profileData = currentUser!.profile;

      setForm({
        name: profileData?.name || guestData?.name,
        username: profileData?.username || guestData?.username,
        description: profileData?.bio || guestData?.bio,
        link: profileData?.link || guestData?.website,
        descriptor: profileData?.descriptor,
        lastName: profileData?.lastName,
        displayName: profileData?.displayName,
        noun: profileData?.nouns,
        host: "",
      });

      let previewPictureImage = preview;

      if (!!profileData?.image) {
        previewPictureImage = profileData!.image;
      } else if (!!guestData?.picture) {
        previewPictureImage = guestData!.picture;
      }

      let previewBannerImage = "";

      if (!!profileData?.banner) {
        previewBannerImage = profileData!.banner;
      } else if (!!guestData?.banner) {
        previewBannerImage = guestData!.banner;
      }
      getFileFromObjectURL(previewPictureImage);
      setPreview(previewPictureImage);
      setImagePreview(previewBannerImage);
      setHasProfile(currentUser!.wallet !== "");
      setHasReferer(!!currentUser!.referred_by);
    }
  }, [currentUser]);
  const getFileFromObjectURL = async (objectURL: any, filename = "downloaded-file") => {
    try {
      const response = await fetch(objectURL);
      const blob = await response.blob();
      const imageFile = new File([blob], filename, { type: blob.type });
      setImage(imageFile);
    } catch (error) {
      setImage(null);
    }
  }

  React.useEffect(() => {
    if (profileInfo) {
      setHasProfile(profileInfo?.profile.address !== undefined);
    }
  }, [profileInfo]);

  const [message, setMessage] = React.useState({
    type: "",
    message: "",
  });

  const [error, setError] = React.useState({
    error: false,
    message: "",
  });

  React.useEffect(() => {
    if (currentUser) {
      lookupReferer(currentUser!.referred_by);
    }
  }, [currentUser]);

  const lookupReferer = async (username: any) => {
    try {
      const res = await axios.get(`/api/get-user-data?username=${username}`);
      if (res.data) {
        setReferer(res.data.wallet);
      } else {
        setError({
          error: true,
          message: "Username added as referer is invalid",
        });
        setReferer("");
      }
    } catch (error) {
      setError({
        error: true,
        message: "Username added as referer is invalid",
      });
      setReferer("");
    }
  };

  const checkForUsername = React.useCallback(async () => {
    if (form.username === currentUser?.profile.username) return;

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
  }, [form.username, currentUser]);

  const createMessage = React.useCallback((text: string, type: string) => {
    window.scroll(0, 0);
    setMessage({ message: text, type });
    setShowMsg(true)
    setTimeout(() => {
      setShowMsg(false);
    }, 4000);
  }, []);

  const validateFields = (isUpdate: boolean) => {
    if (membershipStatus === "expired" || membershipStatus == "active") {
      return true
    }
    if (!profileInfo) return;

    if (referer === "") {
      createMessage("Invalid activation token", "error");
      return false;
    }

    if (profileInfo.solBalance < 0.001) {
      createMessage(
        "Hey! We checked your wallet and you don’t have enough SOL for the gas fees. Get some Solana and try again!",
        "warn",
      );
      return false;
    }

    if (profileInfo.usdcBalance < 8) {
      createMessage(
        "Hey! We checked your wallet and you don't have enough USDC to mint.\n[Get some USDC here](https://jup.ag/swap/SOL-USDC) and try again!",
        "warn",
      );
      return false;
    }

    if (!image) {
      createMessage("Image is required", "error");
      return false;
    }

    if (form.name.length == 0) {
      createMessage("First name is required", "error");
      return false;
    }

    if (form.username.length == 0) {
      createMessage("Username is required", "error");
      return false;
    }

    if (referer == "") {
      if (form.host.length == 0) {
        createMessage("Host is required", "error");
        return false;
      }
    }

    return true;
  };

  const submitForm = React.useCallback(async () => {
    if (!validateFields(false) || !profileInfo || !wallet) {
      return;
    }

    createMessage("", "");

    setIsLoading(true);

    let parentProfile;
    if (referer == "") {
      const res = await axios.get(`/api/get-user-data?username=${form.host}`);
      if (res.data) {
        parentProfile = res.data.wallet;
      } else {
        createMessage("Host is invalid", "error");
        return;
      }
    } else {
      parentProfile = referer;
    }

    let resultingBanner = imagePreview;

    if (bannerImage) {
      resultingBanner = await uploadFile(
        bannerImage!,
        `${form.username}-banner-${new Date().getMilliseconds()}`,
        "banners",
      );
    }

    let finalPreview = preview;

    if (!preview) {
      finalPreview = "https://storage.googleapis.com/mmosh-assets/default.png";
    }

    const result = await createProfile({
      wallet,
      profileInfo,
      image,
      form,
      preview: finalPreview,
      parentProfile: new PublicKey(referer),
      banner: resultingBanner,
      membership: "enjoyer",
      membershipType: "monthly",
      price: 15,
      previousMembership: membershipInfo.membership,
      connection,
    });

    createMessage(result.message, result.type);

    if (result.type === "success") {
      setCurrentUser((prev) => {
        return { ...prev!, profile: result.data };
      });

      setTimeout(() => {
        navigate.replace(`/${form.username}`);
      }, 5000);
    }
    setIsLoading(false);
  }, [wallet, profileInfo, image, form]);

  const initiateBalanceChecking = React.useCallback(async () => {
    if (!wallet) return;

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
      "confirmed",
    );
    const address = new PublicKey(
      wallet!.publicKey,
    );
    const solBalance = await connection.getBalance(address);

    const usdcMint = new PublicKey(process.env.NEXT_PUBLIC_USDC_TOKEN!); //new
    const usdcAddress = await getAssociatedTokenAddress(
      usdcMint,
      wallet!.publicKey,
    );

    let usdcBalance = 0;

    try {
      const usdcDetails = await getAccount(connection, usdcAddress); //new
      const usdcDecimals = 6; //new
      usdcBalance = Number(usdcDetails.amount) / Math.pow(10, usdcDecimals); //new
    } catch (_) { }
    setBalance({
      sol: solBalance / LAMPORTS_PER_SOL,
      usdc: usdcBalance,
    });
  }, [wallet]);

  React.useEffect(() => {
    let interval: any = null;

    if (wallet) {
      if (!profileInfo) {
        getProfileInfo();
      }
      interval = setInterval(() => {
        initiateBalanceChecking();
      }, 5000);
    }

    return () => clearInterval(interval);
  }, [wallet]);

  React.useEffect(() => {
    if (!bannerImage) return;
    const objectUrl = URL.createObjectURL(bannerImage);
    setImagePreview(objectUrl);
  }, [bannerImage]);

  React.useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
  }, [image]);

  const saveUserData = React.useCallback(async () => {
    if (form.name.length == 0) {
      createMessage("First name is required", "error");
      return;
    }

    if (form.username.length == 0) {
      createMessage("Username is required", "error");
      return;
    }

    if (form.username.length > 20 || form.username.length < 3) {
      createMessage("Username must be between 3 and 20 characters", "error");
      return;
    }
    setIsLoading(true);

    let bannerResult = "";
    let imageResult = "https://storage.googleapis.com/mmosh-assets/default.png";

    try {
      const date = new Date().getMilliseconds();

      if (bannerImage) {
        bannerResult = await uploadFile(
          bannerImage,
          `${form.username}-banner-${date}`,
          "banners",
        );
      }

      if (image) {
        imageResult = await uploadFile(
          image,
          `${form.username}-guest_profile-${date}`,
          "images",
        );
      }

      await client.put("/guest-data", {
        ...form,
        banner: bannerResult,
        picture: imageResult,
      });
      createMessage("Your guest data has been successfully saved!", "success");
      setImagePreview(imageResult);
    } catch (err) {
      // TODO add logic to remove image
      if (bannerResult) {
      }
      if (imageResult) {
      }
    }

    setIsLoading(false);
  }, [form, image]);

  const updateProfile = React.useCallback(async () => {
    if (
      !validateFields(true) ||
      !profileInfo ||
      !wallet ||
      !currentUser
    ) {
      return;
    }

    createMessage("", "");
    setIsLoading(true);
    const profile = currentUser.profile;

    const body = {
      image: profile.image,
    };


    if (image) {
      // const imageUri = await pinImageToShadowDrive(image);
     const date = new Date().getMilliseconds();
     const imageUri = await uploadFile(image, `${form.username}-banner-${date}`, "user-images");
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
    currentUser.profile = profile;

    const updateProfile = currentUser.profile;
    updateProfile.symbol = form.username.substring(0, 10);
    updateProfile.bio = form.description;
    updateProfile.displayName = form.displayName;
    updateProfile.username = form.username;
    updateProfile.name = form.name + " " + form.lastName;
    updateProfile.lastName = form.lastName;
    updateProfile.nouns = form.noun;
    updateProfile.descriptor = form.descriptor;
    updateProfile.image = body.image;
    updateProfile.link = form.link;
    updateProfile.banner = imagePreview;

    await updateUserData(updateProfile);

    currentUser.profile = updateProfile;

    setCurrentUser(currentUser);
    navigate.replace(`/` + form.username);
    setIsLoading(false);
  }, [wallet, profileInfo, image, form]);

  const getTokenInfo = React.useCallback(async () => {
    if (profileInfo!.profile.address == undefined) return;

    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_CLUSTER!, {
      confirmTransactionInitialTimeout: 120000,
    });
    const env = new anchor.AnchorProvider(connection, wallet!, {
      preflightCommitment: "processed",
    });

    const userConn: UserConn = new UserConn(env, web3Consts.programID);

  }, [profileInfo]);

  React.useEffect(() => {
    if (profileInfo) {
      getTokenInfo();
    }
  }, [profileInfo]);

  React.useEffect(() => {
    if (wallet) {
      checkMembershipStatus();
    }
  }, [wallet])

  const checkMembershipStatus = async () => {
    const token = localStorage.getItem("token") || "";
    const membershipInfo = await axios.get(
      "/api/membership/has-membership?wallet=" + wallet!.publicKey.toBase58(),
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    setMembershipStatus(membershipInfo.data);
    let result = await axios.get("/api/membership/get-membership-info?wallet=" + wallet!.publicKey.toBase58());
    if (membershipInfo.data === "active") {
      setTab(result.data.membership);
      setMembershipInfo(result.data);
      setHasMonthly(result.data.membershiptype === "monthly");
    }
  }

  const mintMembership = React.useCallback(
    async (membership: any, membershipType: any, price: any) => {
      if (!wallet || !profileInfo) {
        createMessage("Please connect your wallet to continue", "error");
        return;
      }

      if (
        membershipStatus === "active" &&
        membershipInfo.membership === membership &&
        membershipInfo.membershiptype === membershipType
      ) {
        createMessage("You already have this membership", "error");
        return;
      }

      if (!validateFields(false)) {
        return;
      }

      setIsLoading(true);
      if (membershipStatus == "expired" || membershipStatus == "active") {
        const result = await buyMembership({
          wallet,
          profileInfo,
          image,
          form,
          preview,
          parentProfile: new PublicKey(referer),
          membership,
          membershipType,
          price,
          banner: "",
          previousMembership: membershipInfo.membership,
          connection,
        });
        console.log("----- UPGRADE PROFILE RESULT -----", result);
        setIsLoading(false);
        if (result.type === "error") {
          createMessage(result.message, "error");
          return;
        }
        checkMembershipStatus();
        createMessage("Your membership is updated", "success");
        setTimeout(() => {
          checkMembershipStatus();
        }, 5000);
        return;
      }
      createMessage("", "");

      let parentProfile;
      if (referer == "") {
        const res = await axios.get(`/api/get-user-data?username=${form.host}`);
        console.log("lookupHost ", res.data);
        if (res.data) {
          parentProfile = res.data.wallet;
        } else {
          createMessage("Host is invalid", "error");
          return;
        }
      } else {
        parentProfile = referer;
      }

      const result = await createProfile({
        wallet,
        profileInfo,
        image,
        form,
        preview,
        parentProfile: new PublicKey(referer),
        banner: "",
        membership,
        membershipType,
        price,
        previousMembership: membershipInfo.membership,
        connection,
      });
      console.log("----- BUY MEMBERSHIP RESULT -----", result);

      checkMembershipStatus();
      createMessage(result.message, result.type);

      if (result.type === "success") {
        setCurrentUser((prev) => {
          return { ...prev!, profile: result.data };
        });

        setTimeout(() => {
          checkMembershipStatus();
        }, 5000);
      }
      setIsLoading(false);
    },
    [wallet, profileInfo, image, form]
  );

  const getProfileInfo = async () => {
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
        {
          confirmTransactionInitialTimeout: 120000,
        }
      );
      const env = new anchor.AnchorProvider(connection, wallet!, {
        preflightCommitment: "processed",
      });

      let userConn: UserConn = new UserConn(env, web3Consts.programID);

      const profileInfo = await userConn.getUserInfo();

      const user = await axios.get(
        `/api/get-wallet-data?wallet=${wallet?.publicKey.toBase58()}`
      );

      const username = user.data?.profile?.username;

      let profileLineage = profileInfo.profilelineage as ProfileLineage;
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
    } catch (err) {
      console.error("getProfileInfo error: ", err);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full">

      {showMsg &&
        <MessageBanner type={message.type} message={message.message} />
      }

      <div className="w-full flex justify-center my-6">
        {!hasProfile && (
          <h2 className="font-bold text-white text-center">
            Update your Guest Profile or Mint your Membership Profile
          </h2>
        )}

        {hasProfile && (
          <h2 className="font-bold text-white text-center">
            Update your Membership Profile
          </h2>
        )}
      </div>
      <div className="bg-[#03000754] rounded-2xl px-14 py-4 md:min-w-[85%] ">
        <div className="flex flex-col items-center text-white font-sans text-sm leading-[1.875rem]">
          <div className="bg-gradient-to-r from-[#e93d87] via-[#a06cd5] to-[#512d6d] p-[1px] rounded-full inline-block mb-6">
            <ul className="flex bg-[#1b1937] rounded-full py-1 px-1 gap-2 w-30 overflow-x-auto no-scrollbar justify-center">
              <li className={`flex-shrink-0 px-4 sm:px-6 py-2 rounded-full text-sm font-extrabold ${tab === "guest" && 'bg-gradient-to-r from-[#d660a1] to-[#6356d5]'} text-white text-white/70 hover:text-white hover:bg-gradient-to-r hover:from-[#d660a1] hover:to-[#6356d5] shadow cursor-pointer`} onClick={() => setTab("guest")}>
                Guest
              </li>
              <li className={`flex-shrink-0 px-4 sm:px-6 py-2 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-gradient-to-r hover:from-[#ED048A] hover:to-[#F5812B] transition cursor-pointer  ${tab === "enjoyer" && 'bg-gradient-to-r from-[rgba(237,4,138,1)] to-[rgba(245,129,43,1)]'}`} onClick={() => setTab("enjoyer")}>
                Enjoyer
              </li>
              <li className={`flex-shrink-0 px-4 sm:px-6 py-2 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-gradient-to-r hover:from-[#BBEF04] hover:to-[#1CD0BC] transition cursor-pointer  ${tab === "creator" && '!bg-gradient-to-r !from-[rgba(28,208,188,1)] !to-[rgba(187,239,4,1)]'}`} onClick={() => setTab("creator")}>
                Creator
              </li>
            </ul>
          </div>
          {tab === "guest" &&
            <>
              <div className="flex flex-col text-[#e2d7ff] mb-2 space-y-1 text-center sm:text-left">
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="text-[#b59be4] font-extrabold mr-2">•</div>
                  <div>Can only interact with Public Bots</div>
                </div>
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="text-[#b59be4] font-extrabold mr-2">•</div>
                  <div>No access to Bot Studio, Offers or Bot Subscriptions</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mb-2">
                <span className="font-bold text-2xl">Free</span>
                {(membershipStatus === "na" || membershipStatus === "expired") &&
                  <>
                    <span className="text-[#b59be4] text-lg">•</span>
                    <span className="relative rounded-full px-4 sm:px-6 py-2 text-lg font-semibold text-white border border-transparent bg-gradient-to-r from-[#e93d87] to-[#6356d5]">
                      <span className="relative z-10">✔ Current plan</span>
                      <span className="absolute inset-0 rounded-full bg-[#1b1937] z-0 m-[1px]" />
                    </span>
                  </>
                }
              </div>
            </>
          }
          {tab === "enjoyer" &&
            <>
              <div className="flex flex-col text-[#e2d7ff] mb-2 space-y-1 text-center sm:text-left">
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="text-[#b59be4] font-extrabold mr-2">•</div>
                  <div>Revenue Distribution</div>
                </div>
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="text-[#b59be4] font-extrabold mr-2">•</div>
                  <div>Up to 3 Personal Bots</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Radio
                  title="Monthly USDC 15/mo"
                  checked={hasMonthly}
                  onChoose={() => setHasMonthly(!hasMonthly)}
                  name="device_verification"
                />
                <Radio
                  title="Annual USDC 90/yr"
                  checked={!hasMonthly}
                  onChoose={() => setHasMonthly(!hasMonthly)}
                  name="device_verification"
                />
              </div>
              {membershipInfo.membership === "enjoyer" &&
                <div className="flex items-center mb-0 space-x-4 mt-3">
                  <span className="relative rounded-full px-4 py-2 text-lg font-semibold text-white border border-transparent bg-gradient-to-r from-[#e93d87] to-[#6356d5]">
                    <span className="relative z-10">✔ Current plan</span>
                    <span className="absolute inset-0 rounded-full bg-[#1b1937] z-0 m-[1px]" />
                  </span>
                </div>
              }
            </>
          }
          {tab === "creator" &&
            <>
              <div className="flex flex-col text-[#e2d7ff] mb-2 space-y-1 text-center sm:text-left">
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="text-[#b59be4] font-extrabold mr-2">•</div>
                  <div>Revenue Distribution</div>
                </div>
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="text-[#b59be4] font-extrabold mr-2">•</div>
                  <div>Up to 3 Personal Bots</div>
                </div>
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="text-[#b59be4] font-extrabold mr-2">•</div>
                  <div>Up to 3 Community Bots</div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Radio
                  title="Monthly USDC 24/mo"
                  checked={hasMonthly}
                  onChoose={() => setHasMonthly(!hasMonthly)}
                  name="device_verification"
                />
                <Radio
                  title="Annual USDC 180/yr"
                  checked={!hasMonthly}
                  onChoose={() => setHasMonthly(!hasMonthly)}
                  name="device_verification"
                />
              </div>
              {membershipInfo.membership === "creator" &&
                <div className="flex items-center mb-0 space-x-4 mt-3">
                  <span className="relative rounded-full px-4 py-2 text-lg font-semibold text-white border border-transparent bg-gradient-to-r from-[#e93d87] to-[#6356d5]">
                    <span className="relative z-10">✔ Current plan</span>
                    <span className="absolute inset-0 rounded-full bg-[#1b1937] z-0 m-[1px]" />
                  </span>
                </div>
              }
            </>
          }
        </div>
        <div className="w-full h-full flex flex-col sm:p-6 md:p-8">
          <div className="mb-4">
            <p className="text-lg text-white text-center font-bold">
              About You
            </p>
          </div>
          <div className="flex flex-col mb-4">
            <p className="text-sm mb-2">Banner Image</p>
            <div className="relative w-full h-[200px] rounded-xl overflow-hidden">
              <div className="absolute inset-0 bg-cover bg-center z-0" />
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Uploaded Banner"
                  className="absolute inset-0 w-full h-full object-cover z-10"

                />
              )}{!imagePreview && (
                <img
                  src={"/images/profile-settings-bg.png"}
                  alt="Uploaded Banner"
                  className="absolute inset-0 w-full h-full object-cover z-10"
                />
              )}
              <div className="relative z-20 h-full flex items-end">
                <ImageAccountPicker changeImage={setBannerImage} image={imagePreview}/>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 mt-4">
            <div>
              <p className="text-sm mb-2">
                Avatar<sup>*</sup>
                <ImagePicker changeImage={setImage} image={preview} />
              </p>
            </div>

            <div>
              <Input
                type="text"
                title="Display Name"
                required
                maxLength={50}
                helperText="Up to 50 characters, can have spaces."
                placeholder="Display Name"
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
              />

              <div className="my-2" />

              <Input
                type="text"
                title="First Name or Alias"
                required
                maxLength={50}
                helperText="Up to 50 characters, can have spaces."
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <div className="my-2" />

              <Input
                type="text"
                title="Last Name"
                required={false}
                maxLength={15}
                helperText="Up to 15 characters"
                placeholder="Last Name"
                value={form.lastName}
                onChange={(e) =>
                  setForm({ ...form, lastName: e.target.value })
                }
              />

              <div className="my-2" />

              <Input
                type="text"
                title="Username"
                required
                maxLength={15}
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
            </div>

            <div className="flex flex-col">
              <Input
                type="text"
                title="Description"
                required={false}
                placeholder="Tell us about yourself in one paragraph or less"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                textarea
              />

              <div className="my-2" />

              <Input
                type="text"
                title="Web Link"
                required={false}
                placeholder="https://your.domain"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
              />
            </div>
          </div>

          {!hasReferer && (
            <div className="w-full self-start mt-4">
              <p className="text-lg text-white">Your Host</p>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3  gap-6 mt-4">
                <Input
                  type="text"
                  title="Username"
                  required
                  error={error.error}
                  value={form.host}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      host: e.target.value.replace(/\s/g, ""),
                    })
                  }
                  placeholder="Host Username"
                />
              </div>
            </div>
          )}
          <div className="mt-6 flex flex-col items-center justify-center gap-4">

            {!hasProfile && tab === "guest" && (
              <div className="flex flex-row mt-6 items-start justify-evenly">
                <div className="w-full flex flex-col items-center">
                  <Button
                    isLoading={isLoading}
                    isPrimary={false}
                    title="Save as guest"
                    size="large"
                    disabled={isLoading}
                    action={saveUserData}
                  />

                  <p className="text-base text-white mt-4">Free</p>
                </div>
              </div>
            )}

            {hasProfile && (
              <div className="w-full sm:w-1/2 md:w-1/3">
                {tab === "guest" &&
                  <Button
                    isLoading={isLoading}
                    isPrimary
                    title={"Save your changes"}
                    size="large"
                    disabled={isLoading}
                    action={updateProfile}
                  />
                }
              </div>
            )}
            <div className="w-full sm:w-1/2 md:w-1/3">
              {tab === "enjoyer" &&
                <Button
                  isLoading={isLoading}
                  isPrimary
                  title={`Buy Your Enjoyer Membership`}
                  size="large"
                  disabled={isLoading}
                  action={() => mintMembership(tab, hasMonthly ? "monthly" : "yearly", hasMonthly ? 15 : 90)}
                />
              }
              {tab === "creator" &&
                <Button
                  isLoading={isLoading}
                  isPrimary
                  title={`Buy Your Creator Membership`}
                  size="large"
                  disabled={isLoading}
                  action={() => mintMembership(tab, hasMonthly ? "monthly" : "yearly", hasMonthly ? 24 : 180)}
                />
              }
            </div>
            {tab !== "guest" &&
              <>
                <div className="mt-4 flex flex-col items-center gap-4">
                  <div className="flex flex-col items-center gap-2">
                    {hasMonthly ? (
                      <p className="text-sm text-white">
                        Price: {tab === "enjoyer" ? 15 : 24} USDC/mo
                      </p>
                    ) : (
                      <p className="text-sm text-white">
                        Price: {tab === "enjoyer" ? 90 : 180} USDC/yr
                      </p>
                    )}
                    <p className="text-tiny text-white">
                      plus a small amount of SOL for gas fees
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center">
                      <p className="text-sm text-white mr-2">Current balance</p>
                      <div className="bg-black bg-opacity-[0.2] p-1 min-w-[3rem] mx-2 rounded-md text-center">
                        <p className="text-sm text-white">
                          {balance.usdc || 0}
                        </p>
                      </div>
                      <p className="text-sm text-white">USDC</p>
                    </div>

                    <div className="flex items-center">
                      <p className="text-sm text-white mr-2">Current balance</p>
                      <div className="bg-black bg-opacity-[0.2] p-1 min-w-[3rem] mx-2 rounded-md text-center">
                        <p className="text-sm text-white">
                          {balance.sol || 0}
                        </p>
                      </div>
                      <p className="text-sm text-white">SOL</p>
                    </div>
                  </div>
                </div>
              </>
            }
          </div>
        </div>
      </div>
    </div>
  );
};
export default ProfileForm;
