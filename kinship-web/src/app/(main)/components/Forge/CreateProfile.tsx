import React from "react";
import axios from "axios";
import { useAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";

import { data, userWeb3Info, web3InfoLoading } from "@/app/(main)/store";
import MessageBanner from "../common/MessageBanner";
import ImagePicker from "../ImagePicker";
import { buyMembership, createProfile } from "@/app/(main)/lib/forge/createProfile";
import Input from "../common/Input";
import Select from "../common/Select";
import Button from "../common/Button";
import BalanceBox from "../common/BalanceBox";
import useWallet from "@/utils/wallet";
import { PublicKey } from "@solana/web3.js";
import ArrowBack from "@/assets/icons/ArrowBack";
import useConnection from "@/utils/connection";

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

const CreateProfile = () => {
  const connection = useConnection()
  const wallet = useWallet();
  const navigate = useRouter();
  const searchParams = useSearchParams();
  const [profileInfo] = useAtom(userWeb3Info);
  const [isLoadingProfile] = useAtom(web3InfoLoading);
  const [_, setCurrentUser] = useAtom(data);
  const [image, setImage] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState("");
  const [referer, setReferer] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [membershipStatus, setMembershipStatus] = React.useState("na")
  const [form, setForm] = React.useState({
    name: "",
    lastName: "",
    displayName: "",
    username: "",
    host: "",
    description: "",
    descriptor: "",
    noun: "",
    symbol: "",
    link: "",
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

  const [symbolError, setSymbolError] = React.useState({
    error: false,
    message: "",
  });

  React.useEffect(() => {

   const referer = searchParams.get("referer");
   if(referer) {
       lookupReferer(referer)
   } else {
       setReferer("")
   }
  
  }, [])

  React.useEffect(()=>{
     if(wallet) {
       checkMembershipStatus()
     }
  },[wallet])

  const checkMembershipStatus = async()=> {
    let membershipInfo = await axios.get("/api/membership/has-membership?wallet=" + wallet!.publicKey.toBase58());
    setMembershipStatus(membershipInfo.data)
  }

  const lookupReferer = async (username: any) => {
    try {
      const res = await axios.get(`/api/get-user-data?username=${username}`);
      console.log("lookupReferer ", res.data);
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

  const checkForSymbol = React.useCallback(async () => {
    if (["create"].includes(form.username.toLowerCase())) {
      setSymbolError({
        error: true,
        message: "Symbol already exists!",
      });
      return;
    }

    const result = await axios.get(`/api/check-symbol?username=${form.symbol}`);

    if (result.data) {
      setSymbolError({
        error: true,
        message: "Symbol already exists!",
      });
      return;
    }

    setSymbolError({
      error: false,
      message: "",
    });
  }, [form.symbol]);

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
    if(membershipStatus === "expired") {
        return true
    }

    if (!profileInfo) return;

    if (referer == "") {
      createMessage("Invalid activation token", "error");
      return false;
    }

    console.log("profileInfo.profile ", profileInfo.profile);


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

    if (referer == "") {
      if (form.host.length == 0) {
        createMessage("Host is required", "error");
        return false;
      }
    }

    return true;
  };


  const submitForm = React.useCallback(async (membership: any, membershipType:any, price: any) => {
    if (
      !validateFields() ||
      !profileInfo ||
      !wallet
    ) {
      return;
    }


    if (membershipStatus == "active") {
        createMessage("You already have membership", "error");
        return
    }

    if (membershipStatus == "expired") {
      await buyMembership({
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
        previousMembership: "",
        connection,
      });
      createMessage("Your membership is updated", "success");
      return
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
      previousMembership: "",
      connection,
    });

    createMessage(result.message, result.type);

    if (result.type === "success") {
      setCurrentUser((prev) => {
        return { ...prev!, profile: result.data };
      });

      setTimeout(() => {
        navigate.replace(`/create`);
      }, 5000);
    }
    setIsLoading(false);
  }, [wallet, profileInfo, image, form]);

  React.useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
  }, [image]);

  const goBack = () => {
    //TODO: need to include navigation
  };

  const skipStep = () => {
    //TODO: need to include navigation
  };

  return (
    <div className="w-full flex justify-center">
      <div className="flex flex-col items-center justify-center w-full">
        <MessageBanner type={message.type} message={message.message} />
        <div className="backdrop-container rounded-xl border border-white border-opacity-20 my-10 container mx-auto">
          <div className="p-5">
            <div className="text-center relative">
              <h4 className="text-white font-goudy font-normal mb-8">
                Mint Your Free <br />
                Membership Profile!
              </h4>
              <p className="text-base max-w-2xl mx-auto light-gray-color">
                Membership has it's privileges! With a lifetime Membership
                Profile, you can create own personal and community bots, connect
                with other members, earn royalties, referral rewards and income
                from the goods and services you offer to other members
              </p>
              <p className="text-base max-w-2xl mx-auto light-gray-color mt-2.5">
                you'll only be paying 8 USDC and about 21 cents in network fees
                for Lifetime membership
              </p>
              <div
                className="absolute left-0 top-0 cursor-pointer"
                onClick={goBack}
              >
                <ArrowBack />
              </div>

              <p className="text-base light-gray-color absolute right-0 top-0">
                Step 5 of 6
              </p>
            </div>
            <div className="w-full self-start mt-8">
              <p className="text-lg text-white">About You</p>
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

                <div className="my-2" />

                <Input
                  type="text"
                  title="Symbol"
                  required
                  helperText={
                    symbolError.error
                      ? symbolError.message
                      : "Symbol can only be letters and numbers up to 10 characters"
                  }
                  error={error.error}
                  value={form.symbol}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      symbol: e.target.value.replace(/\s/g, ""),
                    })
                  }
                  onBlur={checkForSymbol}
                  placeholder="Username"
                />

                <div className="my-2" />

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

            {referer == "" && (
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

            <div className="mt-10">
              {isLoading &&
                <div className="flex justify-center mb-10">
                  <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white">Loading...</button>
                </div>
              }
              {!isLoading &&
                <div className="membership-box flex grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    <div className="membership-item border border-[#ffffff] border-opacity-20 rounded-md backdrop-container p-5">
                        <h3 className="text-white font-goudy font-normal text-center">Creator</h3>
                          <div className="flex justify-center item-centerv gap-6 mt-5">
                              <Button
                                isLoading={isLoading}
                                isPrimary
                                title="$24/Month"
                                size="large"
                                action={()=>{submitForm("creator", "monthly", 24)}}
                                disabled={isLoading}
                              />
                              <Button
                                isLoading={isLoading}
                                isPrimary
                                title="$180/Year"
                                size="large"
                                action={()=>{submitForm("creator", "yearly", 180)}}
                                disabled={isLoading}
                              />
                          </div>
                    </div>
                    <div className="membership-item membership-item border border-[#ffffff] border-opacity-20 rounded-md backdrop-container p-5">
                          <h3 className="text-white font-goudy font-normal text-center">Enjoyer</h3>
                          <div className="flex justify-center item-centerv gap-6 mt-5">
                              <Button
                                isLoading={isLoading}
                                isPrimary
                                title="$15/Month"
                                size="large"
                                action={()=>{submitForm("enjoyer", "monthly", 15)}}
                                disabled={isLoading}
                              />
                              <Button
                                isLoading={isLoading}
                                isPrimary
                                title="$90/Year"
                                size="large"
                                action={()=>{submitForm("enjoyer", "yearly", 90)}}
                                disabled={isLoading}
                              />
                          </div>
                    </div>
                </div>
              }
              <div className="flex justify-center items-center space-x-4">
               <button className="btn btn-outline text-white border-white hover:bg-white hover:text-black" onClick={skipStep}>Skip</button>
              </div>

              <div className="flex flex-col justify-center items-center mt-5">

                <p className="text-tiny text-white">
                  plus a small amount of SOL for gas fees
                </p>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center justify-center">
                  <p className="text-sm text-white">Current balance</p>
                  <div className="bg-black bg-opacity-[0.2] px-1 py-2 min-w-[3vmax] mx-2 rounded-md">
                    {profileInfo?.usdcBalance || 0}
                  </div>
                  <p className="text-sm text-white">USDC</p>
                </div>

                <div className="flex items-center mt-2 justify-center">
                  <p className="text-sm text-white">Current balance</p>
                  <div className="bg-black bg-opacity-[0.2] px-1 py-2 min-w-[3vmax] mx-2 rounded-md">
                    {profileInfo?.solBalance || 0}
                  </div>
                  <p className="text-sm text-white">SOL</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProfile;
