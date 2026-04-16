import React from "react";
import { createProfile } from "@/app/(main)/lib/forge/createProfile";
import axios from "axios";
import { data, userWeb3Info } from "@/app/(main)/store";
import { useAtom } from "jotai";
import useWallet from "@/utils/wallet";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import Input from "../common/Input";
import Button from "../common/Button";
import MessageBanner from "../common/MessageBanner";
import ArrowBack from "@/assets/icons/ArrowBack";
import ImagePicker from "../ImagePicker";
import {
  onboardingForm,
  onboardingStep,
  referredUser,
} from "@/app/(main)/store/account";
import client from "@/app/(main)/lib/httpClient";
import { useRouter } from "next/navigation";
import ImageAccountPicker from "./ImageAccountPicker";
import { uploadFile } from "@/app/(main)/lib/firebase";
import useCheckMobileScreen from "@/app/(main)/lib/useCheckMobileScreen";
import { getAccount, getAssociatedTokenAddress } from "forge-spl-token";
import { storeFormAtom } from "@/app/(main)/store/signup";
import Radio from "../common/Radio";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import useConnection from "@/utils/connection";

const Step4 = () => {
  const connection = useConnection();
  const router = useRouter();
  const isMobileScreen = useCheckMobileScreen();

  const [onboarding] = useAtom(onboardingForm);
  const [signUpFormData] = useAtom(storeFormAtom);
  const wallet = useWallet();
  const [profileInfo] = useAtom(userWeb3Info);
  const [user, setCurrentUser] = useAtom(data);
  const [__, setSelectedStep] = useAtom(onboardingStep);
  const [referrer] = useAtom(referredUser);

  const [balance, setBalance] = React.useState({
    sol: 0,
    usdc: 0,
  });
  const [image, setImage] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState("");
  const [referer, setReferer] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [bannerImage, setBannerImage] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState("");

  const [message, setMessage] = React.useState({
    type: "",
    message: "",
  });

  const [error, setError] = React.useState({
    error: false,
    message: "",
  });

  const [form, setForm] = React.useState({
    displayName: "",
    name: "",
    lastName: "",
    username: "",
    host: "",
    description: "",
    descriptor: "",
    noun: "",
    link: "",
  });

  React.useEffect(() => {
    if (referrer) {
      lookupReferer(referrer);
    } else if (user) {
      lookupReferer(user.referred_by);
    }
  }, [referrer, user]);

  React.useEffect(() => {
    if (user) {
      const guestData = user!.guest_data;

      let name = guestData?.name;

      if (name === "" || !name) {
        name = user?.name;
      }

      if (!name || name === "") {
        name = signUpFormData?.name;
      }

      setPreview(guestData.picture ?? "");
      getFileFromObjectURL(guestData.picture || "");
      setForm({
        ...form,
        name,
        username: guestData.username,
        link: guestData.website,
        description: guestData.bio,
        lastName: guestData.lastName,
        displayName: guestData.displayName,
      });
    }

    if (!form.host) {
      setForm({
        ...form,
        host: user?.referred_by ?? referrer,
      });
    }
  }, [onboarding, user]);

  const getFileFromObjectURL = async (
    objectURL: any,
    filename = "downloaded-file",
  ) => {
    try {
      const response = await fetch(objectURL);
      const blob = await response.blob();
      const imageFile = new File([blob], filename, { type: blob.type });
      console.log("imageFile", imageFile);
      setImage(imageFile);
    } catch (error) {
      setImage(null);
    }
  };

  const lookupReferer = async (username: string) => {
    if (!username) return;

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
    if (!profileInfo) return;

    if (referer === "") {
      createMessage("Invalid activation token", "error");
      return false;
    }

    if (profileInfo.solBalance < 0.04) {
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

    if (form.username.length > 20 || form.username.length < 3) {
      createMessage("Username must be between 3 and 20 characters", "error");
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
    if (!validateFields() || !wallet || !profileInfo) {
      return;
    }

    createMessage("", "");

    setIsLoading(true);

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

    let resultingImage = image;

    if (!resultingImage && preview) {
      const response = await fetch(preview);

      const blob = await response.blob();

      resultingImage = new File([blob], new Date().toTimeString());
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
      image: resultingImage,
      form,
      preview: finalPreview,
      parentProfile: new PublicKey(referer),
      banner: resultingBanner,
      membership: "enjoyer",
      membershipType: "monthly",
      price: 15,
      previousMembership: "guest",
      connection,
    });

    createMessage(result.message, result.type);

    if (result.type === "success") {
      setCurrentUser((prev) => {
        return { ...prev!, profile: result.data };
      });

      setTimeout(() => {
        router.replace(`/bots`);
      }, 5000);
    }
    setIsLoading(false);
  }, [wallet, profileInfo, image, form]);

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
      setPreview(imageResult);
      setCurrentUser((prev) => ({
        ...prev!,
        guest_data: {
          picture: imageResult,
          banner: bannerResult,
          bio: form.description,
          displayName: form.displayName,
          lastName: form.lastName,
          name: form.name,
          pronouns: "",
          username: form.username,
          website: form.link,
        },
      }));

      createMessage("Your guest data has been successfully saved!", "success");

      setTimeout(() => {
        router.replace(`/bots`);
      }, 5000);
    } catch (err) {
      // TODO add logic to remove image
      if (bannerResult) {
      }
      if (imageResult) {
      }
    }

    setIsLoading(false);
  }, [form, image, bannerImage, profileInfo, wallet, profileInfo]);

  const initiateBalanceChecking = React.useCallback(async () => {
    if (!wallet) return;

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_CLUSTER!,
      "confirmed",
    );
    const address = new PublicKey(wallet!.publicKey);
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
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
  }, [image]);

  const goBack = React.useCallback(() => {
    setSelectedStep(2);
  }, []);

  const skipStep = React.useCallback(async () => {
    let parentProfile = referer;
    if (parentProfile == "" && user) {
      const res = await axios.get(
        `/api/get-user-data?username=${user.referred_by}`,
      );
      if (res.data) {
        parentProfile = res.data.wallet;
      }
    }
    const walletAddress = await client.get("/address");
    const lineageNotificationParams = {
      action: "signup",
      referredUserAddress: walletAddress.data.data,
      referrerId: parentProfile || process.env.NEXT_PUBLIC_PTV_WALLET_KEY,
      membershipType: "guest",
    };
    internalClient
      .post(
        "/api/notifications/send-lineage-notification",
        lineageNotificationParams,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      )
      .then((result) => { })
      .catch((error) => { });
    router.replace("/chat");
    client.put("/onboarding-step", {
      step: 5,
    });
  }, []);

  React.useEffect(() => {
    let interval: any = null;

    if (wallet) {
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

  const [hasMonthly, setHasMonthly] = React.useState<boolean>(true);
  const [tab, setTab] = React.useState("guest");

  const mintMembership = React.useCallback(
    async (membership: any, membershipType: any, price: any) => {
      if (!wallet || !profileInfo || !validateFields()) {
        return;
      }
      createMessage("", "");
      setIsLoading(true);

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
        previousMembership: "guest",
        connection,
      });
      console.log("----- BUY MEMBERSHIP RESULT -----", result);

      createMessage(result.message, result.type);

      if (result.type === "success") {
        console.log("Setting up user! ", result.data);
        setCurrentUser((prev) => {
          return { ...prev!, profile: result.data };
        });

        setTimeout(() => {
          router.replace(`/bots`);
        }, 5000);
      }
      setIsLoading(false);
    },
    [wallet, profileInfo, image, form],
  );

  return (
    <div className="w-full flex justify-center">
      <div className="flex flex-col items-center justify-center w-full">
        <MessageBanner type={message.type} message={message.message} />
        <div className="backdrop-container rounded-xl border border-white border-opacity-20 my-10 container mx-auto">
          <div className="p-5">
            <div className="text-center relative">
              <h4 className="text-white font-goudy font-normal mb-8">
                Create your Profile <br />
              </h4>
              <p className="text-base max-w-5xl mx-auto light-gray-color">
                You can mint a Membership Profile, which allows you to create
                your own Personal and Community Bots, connect with other
                members, earn royalties and receive referral rewards. You can
                also generate income from the goods and services you offer to
                other members.
              </p>
              <p className="text-base max-w-3xl mx-auto light-gray-color mt-2.5">
                For a limited time only, receive a lifetime membership for 8
                USDC and about 21 cents in SOL network fees. If you’re not ready
                to join, you can save a Guest Profile and mint your membership
                later.
              </p>
              <div
                className="absolute left-0 top-0 cursor-pointer"
                onClick={goBack}
              >
                <ArrowBack />
              </div>

              <p className="text-base light-gray-color absolute right-0 top-0">
                Step 4 of 4
              </p>
            </div>
            <div className="flex flex-col items-center text-white font-sans text-sm leading-[1.875rem] pt-6">
              <div className="bg-gradient-to-r from-[#e93d87] via-[#a06cd5] to-[#512d6d] p-[1px] rounded-full inline-block mb-6">
                <ul className="flex bg-[#1b1937] rounded-full py-1 px-1 space-x-2">
                  <li
                    className={`px-7 py-2 rounded-full text-sm font-extrabold ${tab === "guest" && "bg-gradient-to-r from-[#d660a1] to-[#6356d5]"} text-white text-white/70 hover:text-white hover:bg-gradient-to-r hover:from-[#d660a1] hover:to-[#6356d5] shadow cursor-pointer`}
                    onClick={() => setTab("guest")}
                  >
                    Guest
                  </li>
                  <li
                    className={`px-7 py-2 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-gradient-to-r hover:from-[#d660a1] hover:to-[#6356d5] transition cursor-pointer  ${tab === "enjoyer" && "bg-gradient-to-r from-[#d660a1] to-[#6356d5]"}`}
                    onClick={() => setTab("enjoyer")}
                  >
                    Enjoyer
                  </li>
                  <li
                    className={`px-7 py-2 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-gradient-to-r hover:from-[#d660a1] hover:to-[#6356d5] transition cursor-pointer  ${tab === "creator" && "bg-gradient-to-r from-[#d660a1] to-[#6356d5]"}`}
                    onClick={() => setTab("creator")}
                  >
                    Creator
                  </li>
                </ul>
              </div>
              {tab === "guest" && (
                <>
                  <div className="flex flex-col text-[#e2d7ff] mb-2 space-y-1">
                    <div className="flex items-start">
                      <div className="text-[#b59be4] font-extrabold mr-2">
                        •
                      </div>
                      <div>Can only interact with Public Bots</div>
                    </div>
                    <div className="flex items-start">
                      <div className="text-[#b59be4] font-extrabold mr-2">
                        •
                      </div>
                      <div>
                        No access to Bot Studio, Offers or Bot Subscriptions
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center mb-0 space-x-4">
                    <span className="font-bold text-2xl">Free</span>
                  </div>
                </>
              )}
              {tab === "enjoyer" && (
                <>
                  <div className="flex flex-col text-[#e2d7ff] mb-2 space-y-1">
                    <div className="flex items-start">
                      <div className="text-[#b59be4] font-extrabold mr-2">
                        •
                      </div>
                      <div>Revenue Distribution</div>
                    </div>
                    <div className="flex items-start">
                      <div className="text-[#b59be4] font-extrabold mr-2">
                        •
                      </div>
                      <div>Up to 3 Personal Bots</div>
                    </div>
                  </div>
                  <div className="flex flex-row items-center">
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
                </>
              )}
              {tab === "creator" && (
                <>
                  <div className="flex flex-col text-[#e2d7ff] mb-2 space-y-1">
                    <div className="flex items-start">
                      <div className="text-[#b59be4] font-extrabold mr-2">
                        •
                      </div>
                      <div>Revenue Distribution</div>
                    </div>
                    <div className="flex items-start">
                      <div className="text-[#b59be4] font-extrabold mr-2">
                        •
                      </div>
                      <div>Up to 3 Personal Bots</div>
                    </div>
                    <div className="flex items-start">
                      <div className="text-[#b59be4] font-extrabold mr-2">
                        •
                      </div>
                      <div>Up to 3 Community Bots</div>
                    </div>
                  </div>
                  <div className="flex flex-row items-center">
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
                </>
              )}
            </div>
            <div className="w-full h-full flex flex-col p-5">
              <div className="mb-4">
                <p className="text-lg text-white font-bold">About You</p>
              </div>

              <div className="flex flex-col mb-4">
                <p className="text-sm">Banner Image</p>
                <div className="h-[300px]">
                  <ImageAccountPicker
                    changeImage={setBannerImage}
                    image={imagePreview}
                  />
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-6 mt-4">
              <div>
                <p className="text-sm">
                  Avatar<sup>*</sup>
                  <ImagePicker changeImage={setImage} image={preview} />
                </p>
              </div>

              <div>
                <Input
                  type="text"
                  title="Display Name"
                  required
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
                  helperText={
                    error.error
                      ? error.message
                      : "Usernames must have between 3 and 20 characters"
                  }
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

              <div>
                <Input
                  type="text"
                  title="Bio"
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

            {referer === "" && (
              <div className="w-full self-start mt-10">
                <p className="text-lg text-white">Your Host</p>
                <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1">
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

            <div className="mt-10 flex flex-col">
              <div className="flex justify-center items-start space-x-4">
                {!isMobileScreen && (
                  <div className="w-[25%]">
                    <button
                      className="btn btn-outline text-white border-white hover:bg-white hover:text-black w-full h-[52px]"
                      onClick={skipStep}
                    >
                      Skip
                    </button>
                  </div>
                )}

                <div className="flex flex-col justify-center items-center w-[25%]">
                  {tab === "guest" && (
                    <Button
                      isLoading={isLoading}
                      isPrimary
                      title={"Save your changes"}
                      size="large"
                      disabled={isLoading}
                      action={saveUserData}
                    />
                  )}
                  {tab === "enjoyer" && (
                    <Button
                      isLoading={isLoading}
                      isPrimary
                      title={`Mint Your Enjoyer Membership`}
                      size="large"
                      disabled={isLoading}
                      action={() =>
                        mintMembership(
                          tab,
                          hasMonthly ? "monthly" : "yearly",
                          hasMonthly ? 15 : 90,
                        )
                      }
                    />
                  )}
                  {tab === "creator" && (
                    <Button
                      isLoading={isLoading}
                      isPrimary
                      title={`Mint Your Creator Membership`}
                      size="large"
                      disabled={isLoading}
                      action={() =>
                        mintMembership(
                          tab,
                          hasMonthly ? "monthly" : "yearly",
                          hasMonthly ? 24 : 180,
                        )
                      }
                    />
                  )}
                  {tab !== "guest" && (
                    <>
                      <div className="flex flex-col justify-center items-center mt-3">
                        {hasMonthly && (
                          <p className="text-sm text-white">
                            Price: {tab === "enjoyer" ? 15 : 24} USDC
                          </p>
                        )}
                        {!hasMonthly && (
                          <p className="text-sm text-white">
                            Price: {tab === "enjoyer" ? 90 : 180} USDC
                          </p>
                        )}
                        <p className="text-tiny text-white">
                          plus a small amount of SOL for gas fees
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center justify-center">
                          <p className="text-sm text-white">Current balance</p>
                          <div className="bg-black bg-opacity-[0.2] p-1 min-w-[2vmax] mx-2 rounded-md">
                            <p className="text-sm text-white text-center">
                              {balance.usdc || 0}
                            </p>
                          </div>
                          <p className="text-sm text-white">USDC</p>
                        </div>

                        <div className="flex items-center mt-2 justify-center">
                          <p className="text-sm text-white">Current balance</p>
                          <div className="bg-black bg-opacity-[0.2] p-1 min-w-[2vmax] mx-2 rounded-md">
                            <p className="text-sm text-white text-center">
                              {balance.sol || 0}
                            </p>
                          </div>
                          <p className="text-sm text-white">SOL</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {isMobileScreen && (
                <div className="w-[25%]">
                  <button
                    className="btn btn-outline text-white border-white hover:bg-white hover:text-black w-full"
                    onClick={skipStep}
                  >
                    Skip
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step4;
