"use client";

import ImagePicker from "../ImagePicker";
import Input from "../common/Input";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { pinImageToShadowDrive } from "@/app/(main)/lib/uploadImageToShdwDrive";
import axios from "axios";

import BalanceBox from "../common/BalanceBox";
import useConnection from "@/utils/connection";
import * as anchor from "@coral-xyz/anchor";
import useWallet from "@/utils/wallet";
import { useAtom } from "jotai";
import { data, isAuth, userWeb3Info } from "@/app/(main)/store";
import { Connectivity as Community } from "@/anchor/community";
import { web3Consts } from "@/anchor/web3Consts";
import { pinFileToShadowDriveUrl } from "@/app/(main)/lib/uploadFileToShdwDrive";
import { calcNonDecimalValue } from "@/anchor/curve/utils";
import client from "@/app/(main)/lib/httpClient";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { randomStr } from "@metaplex-foundation/js";
import WarningModal from "../common/WarningModal";
import { uploadFile } from "@/app/(main)/lib/firebase";
import { profile } from "console";
import Select from "../common/Select";

const explanations: any = {
  private: "Only the Creator can view and interact with it.",
  hidden:
    "To access a Hidden bot, users must navigate to a specific URL that prompts them to enter a code.",
  secret:
    "Not listed anywhere. Appears only when code is entered in the search box.",
  public:
    "The Bot is visible to everyone and only a Wizard can set it to Public.",
};

const AgentPass = ({
  symbol,
  type,
  hasAllowed,
}: {
  symbol?: string;
  type: string;
  hasAllowed: any;
}) => {
  const connection = useConnection();
  const wallet: any = useWallet();
  const [profileInfo] = useAtom(userWeb3Info);
  const [currentUser] = useAtom(data);
  const [isAuthenticated] = useAtom(isAuth);

  const navigate = useRouter();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasPrivacyError, setHasPrivacyError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [image, setImage] = React.useState<File | null>(null);

  const [fields, setFields] = useState({
    image: {
      preview: "",
      type: "",
    },
    name: "",
    symbol: "",
    desc: "",
    passPrice: 0,
    website: "",
    telegram: "",
    twitter: "",
    privacy: "private",
    code: randomStr(19),
    priceDistribution: {
      echosystem: 3,
      curator: 7,
      creator: 90,
      promoter: 0,
      scout: 0,
    },
    invitationType: "none",
    invitationPrice: 0,
    discount: 0.0,
    defaultModel: "gpt-5.2",
  });

  const [isReady, setIsReady] = useState(false);

  const [usdPrice, setUsdPrice] = useState(0);
  const [buttonText, setButtonText] = useState(symbol ? "Modify Bot" : "Create Bot");
  const [projectDetail, setProjectDetail] = React.useState<any>(null);

  React.useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    let imageObj = {
      preview: objectUrl,
      type: image.type,
    };
    setFields({ ...fields, image: imageObj });
  }, [image]);

  React.useEffect(() => {
    if (localStorage.getItem("projectstep1")) {
      let savedData: any = localStorage.getItem("projectstep1");
      const data = JSON.parse(savedData);

      if (!data.code) {
        data.code = randomStr(19);
      }

      setFields(data);
    }
    getMmoshPrice();
    if (symbol) {
      getProjectDetailFromAPI();
    }
  }, []);

  const getProjectDetailFromAPI = async () => {
    try {
      setLoading(true);
      let listResult = await internalClient.get(
        `/api/project/detail?symbol=${symbol}`,
      );
      setFields({
        ...fields,
        image: {
          preview: listResult.data.project.image,
          type: "",
        },
        name: listResult.data.project.name,
        symbol: listResult.data.project.symbol,
        desc: listResult.data.project.desc,
        passPrice: listResult.data.project.price,
        website: listResult.data.project.website,
        telegram: listResult.data.project.telegram,
        twitter: listResult.data.project.twitter,
        code: listResult.data.project.code ?? randomStr(19),
        privacy: listResult.data.project.privacy,
        defaultModel: listResult.data.project.defaultmodel || "gpt-5.2"
      });
      setProjectDetail(listResult.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setProjectDetail(null);
    }
  };

  const getMmoshPrice = async () => {
    const mmoshUsdcPrice = await axios.get(
      `${process.env.NEXT_PUBLIC_JUPITER_PRICE_API}?ids=${process.env.NEXT_PUBLIC_OPOS_TOKEN},${process.env.NEXT_PUBLIC_USDC_TOKEN}`,
    );
    setUsdPrice(mmoshUsdcPrice.data?.data?.MMOSH?.price || 0.003);
  };

  React.useEffect(() => {
    setIsReady(validateFields(false));
  }, [fields]);

  const createMessage = (message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    setLoading(false);
    setButtonText(symbol ? "Modify Bot" : "Create Bot");
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

  const validateFields = (isMessage: boolean) => {
    if (fields.name.length == 0) {
      if (isMessage) {
        createMessage("Name is required", "danger-container");
      }

      return false;
    }

    if (fields.name.length > 50) {
      if (isMessage) {
        createMessage(
          "Name should have less than 50 characters",
          "danger-container",
        );
      }
      return false;
    }

    if (fields.symbol.length == 0) {
      if (isMessage) {
        createMessage("Symbol is required", "danger-container");
      }
      return false;
    }

    if (fields.symbol.length > 10) {
      if (isMessage) {
        createMessage(
          "Symbol should have less than 10 characters",
          "danger-container",
        );
      }
      return false;
    }

    if (fields.desc.length == 0) {
      if (isMessage) {
        createMessage("Description is required", "danger-container");
      }
      return false;
    }


    
    if (fields.image.preview.length == 0) {
      console.log(fields.image,"image ==========================================>>")
      if (isMessage) {
        createMessage("Project pass Image is required", "danger-container");
      }
      return false;
    }

    if (fields.website.length > 0) {
      if (!isValidHttpUrl(fields.website)) {
        if (isMessage) {
          createMessage("Invalid website url", "danger-container");
        }
        return false;
      }
    }

    return true;
  };
  const isValidHttpUrl = (url: any) => {
    try {
      const newUrl = new URL(url);
      return newUrl.protocol === "http:" || newUrl.protocol === "https:";
    } catch (err) {
      return false;
    }
  };

  const delay = (ms: any) => new Promise((res) => setTimeout(res, ms));

  const mintGensisPass = async () => {
    if (!isAuthenticated) return;
    if (!hasAllowed.status) {
      createMessage(hasAllowed.message, "danger-container");
      return;
    }

    setLoading(true);
    if (validateFields(true)) {
      if (!symbol) {
        const result = await internalClient.get(
          `/api/project/check-project?symbol=${fields.symbol}`,
        );
        if (result.data) {
          createMessage("Symbol already exist", "danger-container");
          return;
        }
        if (!isValidHttpUrl(fields.image.preview)) {
          setButtonText("Uploading image... ");
          let imageFile = await fetch(fields.image.preview)
            .then((r) => r.blob())
            .then(
              (blobFile) =>
                new File([blobFile], uuidv4(), { type: fields.image.type }),
            );
          // let imageUri = await pinImageToShadowDrive(imageFile);
           const date = new Date().getMilliseconds();
          const imageUri = await uploadFile(imageFile, `${fields.name}-banner-${date}`, "user-images");
          fields.image.preview = imageUri;
        }
        localStorage.setItem("projectstep1", JSON.stringify(fields));
      }

      const projectKeyPair = anchor.web3.Keypair.generate();
      const env = new anchor.AnchorProvider(connection.connection, wallet, {
        preflightCommitment: "processed",
      });
      anchor.setProvider(env);
      let communityConnection: Community = new Community(
        env,
        web3Consts.programID,
        symbol
          ? new anchor.web3.PublicKey(projectDetail.project.key)
          : projectKeyPair.publicKey,
      );

      try {

        if (symbol) {
          setButtonText("Updating pass... ");
          let imageFile = await fetch(fields.image.preview)
            .then((r) => r.blob())
            .then(
              (blobFile) =>
                new File([blobFile], uuidv4(), { type: fields.image.type }),
            );
          // let imageUri = await pinImageToShadowDrive(imageFile);
           const date = new Date().getMilliseconds();
          const imageUri = await uploadFile(imageFile, `${fields.name}-banner-${date}`, "user-images");
          fields.image.preview = imageUri;
          console.log("image uri ===>", fields.image.preview);
          await internalClient.put("/api/project/update-project", {
            key: projectDetail.project.key,
            name: fields.name,
            symbol: fields.symbol.toUpperCase(),
            image: fields.image.preview,
            desc: fields.desc,
            telegram: fields.telegram,
            twitter: fields.twitter,
            website: fields.website,
            privacy: fields.privacy,
            code: fields.code,
            defaultModel: fields.defaultModel,
          });
          navigate.push("/bots/" + fields.symbol);
          setLoading(false);
          return;
        }

        setButtonText("Buying new Pass...");
        console.log("Profile info: ", profileInfo);
        console.log('go to send project price -------------------------------------------->')
        // const res5 = await communityConnection.sendProjectPrice(
        //   profileInfo?.profile.address,
        //   25000,
        //   connection,
        // );

        // if (res5.Err) {
        //   console.log("Error is here... ", res5.Err);
        //   createMessage("error creating new project", "danger-container");
        //   return;
        // }
        // console.log("send price result ", res5.Ok?.info);

        await client.post("/bots", {
          name: fields.name,
          symbol: fields.symbol.toUpperCase(),
          desc: fields.desc,
          image: fields.image.preview,
          key: projectKeyPair.publicKey.toBase58(),
          seniority: 0,
          price: fields.passPrice,
          distribution: fields.priceDistribution,
          invitationprice: fields.invitationPrice,
          discount: fields.discount,
          telegram: fields.telegram,
          twitter: fields.twitter,
          website: fields.website,
          presalesupply: 0,
          minpresalesupply: 0,
          presalestartdate: "",
          presaleenddate: "",
          dexlistingdate: "",
          creator: wallet.publicKey.toBase58(),
          creatorUsername: currentUser?.profile?.username,
          type,
          privacy: fields.privacy,
          code: fields.code,
          defaultmodel: fields.defaultModel,
        });
        setButtonText(symbol ? "Modify Bot" : "Create Bot");
        localStorage.removeItem("projectstep1");
        navigate.push("/bots/" + fields.symbol);
      } catch (error) {
        console.log("error ", error);
        setButtonText(symbol ? "Modify Bot" : "Create Bot");
        setLoading(false);
      }
    }
  };

  return (
    <>
      <WarningModal
        isOpen={!!selectedOption}
        onDeny={() => setSelectedOption(null)}
        onAccept={() => {
          setFields({ ...fields, privacy: selectedOption! });
          setSelectedOption(null);
        }}
        message="Changing the visibility away from “Public” will make the Bot invisible to all users."
      />

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

      <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-8 gap-4">
          <div className="xl:col-span-2">
            <p className="text-xs text-white">Image<sup>*</sup></p>
            <ImagePicker
              changeImage={setImage}
              image={fields.image.preview}
              // readonly={symbol ? true : false}
            />
          </div>
          <div className="xl:col-span-3">
            <div className="form-element pt-2.5">
              <Input
                type="text"
                title="Name"
                required
                helperText="Up to 50 characters, can have spaces."
                placeholder="Name"
                value={fields.name}
                onChange={(e) => setFields({ ...fields, name: e.target.value })}
              />
            </div>
            <div className="form-element pt-2.5">
              <Input
                type="text"
                title="Symbol"
                required
                helperText="Symbol can only be letters and numbers up to 10 characters"
                placeholder="Symbol"
                value={fields.symbol}
                onChange={(e) =>
                  setFields({ ...fields, symbol: e.target.value })
                }
              />
            </div>
            <div className="form-element pt-2.5">
              <Input
                textarea
                type="text"
                title="Description"
                required
                helperText=""
                placeholder="Describe your Community."
                value={fields.desc}
                onChange={(e) => setFields({ ...fields, desc: e.target.value })}
              />
            </div>
          </div>
          <div className="xl:col-span-3">
            <div className="form-element pt-2.5">
              <Input
                type="text"
                title="Project Website"
                required={false}
                helperText=""
                placeholder="https://www.example.com/"
                value={fields.website}
                onChange={(e) =>
                  setFields({ ...fields, website: e.target.value })
                }
              />
            </div>
            <div className="form-element pt-2.5">
              <Input
                type="text"
                title="Project Telegram"
                required={false}
                helperText=""
                placeholder="https://t.me/example"
                value={fields.telegram}
                onChange={(e) =>
                  setFields({ ...fields, telegram: e.target.value })
                }
              />
            </div>
            <div className="form-element pt-2.5">
              <Input
                type="text"
                title="Project Bluesky"
                required={false}
                helperText=""
                placeholder="https://bsky.app/profile/example.bsky.social"
                value={fields.twitter}
                onChange={(e) =>
                  setFields({ ...fields, twitter: e.target.value })
                }
              />
            </div>

            <div className="form-element pt-2.5">
              <Input
                type="text"
                title="Agent Email Address"
                required={false}
                readonly
                helperText=""
                placeholder=""
                value={`${fields.symbol}@kinship.codes`}
                onChange={() => { }}
              />
            </div>

            <div className="flex flex-col pt-2.5">
              <p className="text-xs text-white">Privacy</p>

              <div className="flex">
                <button
                  className={`${fields.privacy === "private" ? "border-white" : "border-[#FFFFFF28]"} bg-[#FFFFFF08] border-[1px] py-2 px-6 rounded-lg`}
                  onClick={() => {
                    if (fields.privacy === "public") {
                      setSelectedOption("private");

                      return;
                    }
                    setFields({ ...fields, privacy: "private" });
                  }}
                >
                  <p
                    className={`${fields.privacy === "private" ? "text-white" : "text-[#FFFFFF28]"} text-sm`}
                  >
                    Private
                  </p>
                </button>

                <div className="mx-4" />

                <button
                  className={`${fields.privacy === "secret" ? "border-white" : "border-[#FFFFFF28]"} bg-[#FFFFFF08] border-[1px] py-2 px-6 rounded-lg`}
                  onClick={() => {
                    if (fields.privacy === "public") {
                      setSelectedOption("secret");

                      return;
                    }

                    setFields({ ...fields, privacy: "secret" });
                  }}
                >
                  <p
                    className={`${fields.privacy === "secret" ? "text-white" : "text-[#FFFFFF28]"} text-sm`}
                  >
                    Secret
                  </p>
                </button>

                <div className="mx-4" />

                <button
                  className={`${fields.privacy === "hidden" ? "border-white" : "border-[#FFFFFF28]"} bg-[#FFFFFF08] border-[1px] py-2 px-6 rounded-lg`}
                  onClick={() => {
                    if (fields.privacy === "public") {
                      setSelectedOption("hidden");

                      return;
                    }

                    setFields({ ...fields, privacy: "hidden" });
                  }}
                >
                  <p
                    className={`${fields.privacy === "hidden" ? "text-white" : "text-[#FFFFFF28]"} text-sm`}
                  >
                    Hidden
                  </p>
                </button>

                <div className="mx-4" />

                <button
                  className={`${hasPrivacyError ? "border-[#FF0000]" : fields.privacy === "public" ? "border-white" : "border-[#FFFFFF28]"} bg-[#FFFFFF08] border-[1px] py-2 px-6 rounded-lg`}
                  onClick={() => {
                    if (currentUser?.role !== "wizard") {
                      if (fields.privacy === "public") return;

                      setHasPrivacyError(true);

                      setTimeout(() => {
                        setHasPrivacyError(false);
                      }, 4000);
                      return;
                    }
                    setFields({ ...fields, privacy: "public" });
                  }}
                >
                  <p
                    className={`${hasPrivacyError ? "text-[#FF0000]" : fields.privacy === "public" ? "text-white" : "text-[#FFFFFF28]"} text-sm`}
                  >
                    Public
                  </p>
                </button>
              </div>
              {hasPrivacyError ? (
                <p className="text-[#FF0000] text-sm">
                  this option is exclusively available to Wizards.
                </p>
              ) : (
                <p className="text-sm">{explanations[fields.privacy as any]}</p>
              )}

              <div className="my-2.5" />
              <Input
                type="text"
                title="Bot Code"
                required
                helperText="The code must consist of 4 to 19 alphanumeric characters."
                placeholder=""
                value={fields.code}
                onChange={(e) => {
                  setFields({ ...fields, code: e.target.value });
                }}
              />
            </div>
            <div>
            <span>Default model</span>
            <div className="lg:col-start-2 xl:col-start-2">
              <Select
                value={fields.defaultModel}
                onChange={(e) => {
                  setFields({ ...fields, defaultModel: e.target.value });
                }}
                options={[
                  { label: "ChatGPT 5.2", value: "gpt-5.2" },
                  { label: "ChatGPT 5.1", value: "gpt-5.1" },
                  { label: "ChatGPT 4.1", value: "gpt-4.1" },
                  { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
                  {
                    label: "Gemini 3 Pro",
                    value: "gemini-3-pro-preview",
                  },
                ]}
              />
            </div>
            </div>
          </div>
        </div>
        <div className="flex justify-center mt-10">
          {!loading && (
            <button
              className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white"
              onClick={mintGensisPass}
              disabled={!isReady}
            >
              {buttonText}
            </button>
          )}
          {loading && (
            <button className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white">
              {buttonText}
            </button>
          )}
        </div>
        {/* <div className="w-full flex flex-col justify-center items-center mt-5">
          <div className="flex flex-col justify-center items-center">
            <p className="text-sm text-white">Price: 25,000 MMOSH</p>
            <p className="text-tiny text-white">
              plus a small amount of SOL for gas fees
            </p>
          </div>
          <BalanceBox />
        </div> */}
      </div>
    </>
  );
};

export default AgentPass;
