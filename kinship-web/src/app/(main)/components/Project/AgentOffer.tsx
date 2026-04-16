import { data, userWeb3Info } from "@/app/(main)/store";
import Input from "../common/Input";
import axios from "axios";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import ImagePicker from "../ImagePicker";
import BalanceBox from "../common/BalanceBox";
import Radio from "../common/Radio";
import { pinImageToShadowDrive } from "@/app/(main)/lib/uploadImageToShdwDrive";
import { v4 as uuidv4 } from "uuid";
import * as anchor from "@coral-xyz/anchor";
import { Connectivity as Community } from "@/anchor/community";
import { web3Consts } from "@/anchor/web3Consts";
import { pinFileToShadowDriveUrl } from "@/app/(main)/lib/uploadFileToShdwDrive";
import { calcNonDecimalValue } from "@/anchor/curve/utils";
import { fetchImage } from "@/app/(main)/lib/forge/fetchImage";
import { generateCommunityInvitationImage } from "@/app/(main)/lib/forge/generateCommunityInvitationImage";
import { uploadImageFromBlob } from "@/app/(main)/lib/uploadImageFromBlob";
import AgentOfferItem from "./AgentOfferItem";
import { Bars } from "react-loader-spinner";
import useWallet from "@/utils/wallet";
import useConnection from "@/utils/connection";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { uploadFile } from "@/app/(main)/lib/firebase";


const AgentOffer = ({ symbol }: { symbol?: string }) => {
  const connection = useConnection();
  const wallet: any = useWallet();
  const [profileInfo] = useAtom(userWeb3Info);
  const [currentUser] = useAtom(data);
  const navigate = useRouter();

  const [fields, setFields] = useState({
    image: {
      preview: "",
      type: "",
    },
    name: "",
    symbol: "",
    desc: "",
    supply: 1,
    priceonetime: 0,
    pricemonthly: 0,
    priceyearly: 0,
    pricetype: "onetime",
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
  });
  const [isReady, setIsReady] = useState(false);
  const [buttonText, setButtonText] = useState("Mint");
  const [projectDetail, setProjectDetail] = React.useState<any>(null);
  const [image, setImage] = React.useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [currentMenu, setCurrentMenu] = useState("offer");
  const [offerPageContent, setOfferPageContent] = useState("list");
  const [invitationTypes, setInvitationTypes] = React.useState([
    "required",
    "optional",
    "none",
  ]);

  const [offers, setOffers] = React.useState([]);
  const [offerLoading, setOfferLoading] = useState(true);
  const [offerPage, setOfferPage] = useState(1);
  const [isOfferPaging, setIsOfferPaging] = useState(false);

  React.useEffect(() => {
    setIsReady(validateFields(false));
  }, [fields]);

  React.useEffect(() => {
    getProjectDetailFromAPI();
    listOfferApi(1);
  }, []);

  React.useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    let imageObj = {
      preview: objectUrl,
      type: image.type,
    };
    setFields({ ...fields, image: imageObj });
  }, [image]);

  const getProjectDetailFromAPI = async () => {
    try {
      setLoading(true);
      let listResult = await axios.get(`/api/project/detail?symbol=${symbol}`);
      setProjectDetail(listResult.data);
      setOfferPageContent(listResult.data.offers.length > 0 ? "list" : "add");
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setProjectDetail(null);
    }
  };

  const listOfferApi = async (page: any) => {
    if (!wallet) {
      return;
    }
    try {
      setOfferLoading(true);
      setIsOfferPaging(false);
      let url = "/api/offer/list?page=" + page;
      let apiResult = await axios.get(url);

      let newOffers: any = page == 1 ? [] : offers;

      for (let index = 0; index < apiResult.data.length; index++) {
        const element: any = apiResult.data[index];
        newOffers.push(element);
      }
      console.log("listoffer ", offers);
      setOffers(newOffers);
      if (apiResult.data.length < 8) {
        setIsOfferPaging(false);
      } else {
        setIsOfferPaging(true);
      }
      setOfferLoading(false);
    } catch (error) {
      console.log("listhistory error", error);
      setOfferLoading(false);
      setOffers([]);
    }
  };

  const nextOfferPage = () => {
    let currentPage = offerPage + 1;
    setOfferPage(currentPage);
    listOfferApi(currentPage);
  };

  const capitalizeString = (str: any) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const chooseInvitationType = (currentInvitationType: any) => {
    let invitationPrice = fields.invitationPrice;
    let distribution = {
      echosystem: 3,
      curator: 2,
      creator: 70,
      promoter: 20,
      scout: 5,
    };
    if (currentInvitationType == "none") {
      distribution = {
        echosystem: 3,
        curator: 7,
        creator: 90,
        promoter: 0,
        scout: 0,
      };
      invitationPrice = 0;
    }
    setFields({
      ...fields,
      invitationPrice,
      invitationType: currentInvitationType,
      priceDistribution: distribution,
    });
  };

  const prepareNumber = (inputValue: any) => {
    if (isNaN(inputValue)) {
      return 0;
    }
    return inputValue;
  };

  const getTotalPercentage = () => {
    return (
      Number(fields.priceDistribution.echosystem) +
      Number(fields.priceDistribution.creator) +
      Number(fields.priceDistribution.curator) +
      Number(fields.priceDistribution.promoter) +
      Number(fields.priceDistribution.scout)
    );
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

    if (fields.desc.length > 160) {
      if (isMessage) {
        createMessage(
          "Description should have less than 160 characters",
          "danger-container",
        );
      }
      return false;
    }

    if (fields.image.preview.length == 0) {
      if (isMessage) {
        createMessage("Offer Image is required", "danger-container");
      }
      return false;
    }

    if (fields.invitationType == "optional") {
      if (fields.discount == 0) {
        if (isMessage) {
          createMessage("Discount not mentioned", "danger-container");
        }
        return false;
      }
    }

    if (fields.pricetype == "onetime") {
      if (fields.priceonetime == 0) {
        if (isMessage) {
          createMessage("Price not mentioned", "danger-container");
        }
        return false;
      }
    } else {
      if (fields.pricemonthly == 0 && fields.priceyearly == 0) {
        if (isMessage) {
          createMessage("Subscription Price not mentioned", "danger-container");
        }
        return false;
      }
    }

    if (getTotalPercentage() != 100) {
      if (isMessage) {
        createMessage("Price distribution is not 100%", "danger-container");
      }
      return false;
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

  const mintOfferPass = async () => {
    if (projectDetail.coins.length == 0) {
      createMessage("Tokenomics still pending to be set", "danger-container");
      return;
    }

    const result = await axios.get(
      `/api/project/check-project?symbol=${fields.symbol}`,
    );
    if (result.data) {
      createMessage("Symbol already exist", "danger-container");
      return;
    }
    setLoading(true);
    if (validateFields(true)) {
      if (!isValidHttpUrl(fields.image.preview)) {
        setButtonText("Uploading offer image...");
        let imageFile = await fetch(fields.image.preview)
          .then((r) => r.blob())
          .then(
            (blobFile) =>
              new File([blobFile], uuidv4(), { type: fields.image.type }),
          );
        // let imageUri = await pinImageToShadowDrive(imageFile);
         const date = new Date().getMilliseconds();
        const imageUri = await uploadFile( imageFile,`${fields.name}-banner-${date}`,"user-images");
        fields.image.preview = imageUri;
      }
 
      const offerKeyPair = anchor.web3.Keypair.generate();

      try {
        await internalClient.post("/api/offer/save", {
          name: fields.name,
          symbol: fields.symbol.toUpperCase(),
          desc: fields.desc,
          image: fields.image.preview,
          invitationype: fields.invitationType,
          key: offerKeyPair.publicKey.toBase58(),
          priceonetime: fields.priceonetime,
          pricemonthly: fields.pricemonthly,
          priceyearly: fields.priceyearly,
          pricetype: fields.pricetype,
          distribution: fields.priceDistribution,
          discount: fields.discount,
          project: projectDetail.project.key,
          creator: wallet.publicKey.toBase58(),
          creatorUsername: currentUser?.profile?.username,
          supply: fields.supply,
        });

        navigate.push("/projects/" + symbol + "/" + fields.symbol);
      } catch (error) {
        console.log("error ", error);
        setButtonText("Mint");
        setLoading(false);
      }
    }
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
      <div className="container mx-auto relative mb-8">
        {offerPageContent == "add" && (
          <>
            {projectDetail && (
              <>
                {projectDetail.coins.length == 0 && (
                  <p className="text-sub-title-font-size light-gray-color text-center para-line-height text-light-gray leading-4 mb-10">
                    Tokenomics still pending to be set
                  </p>
                )}
              </>
            )}
            <div className="flex justify-center">
              <div className="flex bg-[#FFFFFF0F] rounded-full">
                <div
                  className={
                    (currentMenu === "offer" ? "text-white " : "") +
                    "py-3.5 px-10 cursor-pointer hover:text-white text-lg"
                  }
                  onClick={() => {
                    setCurrentMenu("offer");
                  }}
                >
                  Offer
                </div>
                <div
                  className={
                    (currentMenu !== "offer" ? "text-white " : "") +
                    "py-3.5 px-10 cursor-pointer hover:text-white text-lg"
                  }
                  onClick={() => {
                    setCurrentMenu("distribution");
                  }}
                >
                  Distribution
                </div>
              </div>
            </div>
          </>
        )}
        {offerPageContent == "list" && (
          <div className="flex justify-end">
            <button
              className="btn btn-primary bg-[#6607FF] text-white border-none hover:bg-primary hover:text-white md:mt-0 mt-5"
              onClick={() => {
                setCurrentMenu("offer");
                setOfferPageContent("add");
              }}
            >
              Add an Offer
            </button>
          </div>
        )}
      </div>
      {offerPageContent == "add" && (
        <>
          {currentMenu === "offer" && (
            <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-7 gap-4">
                <div className="xl:col-span-2">
                  <ImagePicker
                    changeImage={setImage}
                    image={fields.image.preview}
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
                      onChange={(e) =>
                        setFields({ ...fields, name: e.target.value })
                      }
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
                      placeholder="Describe your Offer."
                      value={fields.desc}
                      onChange={(e) =>
                        setFields({ ...fields, desc: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-element pt-2.5">
                    <div className="flex">
                      <p className="text-xs text-whilte mt-3 mr-2.5">Supply</p>
                      <div className="w-20">
                        <Input
                          type="text"
                          title=""
                          required={false}
                          helperText=""
                          placeholder=""
                          value={
                            fields.supply > 0 ? fields.supply.toString() : ""
                          }
                          onChange={(e) =>
                            setFields({
                              ...fields,
                              supply: prepareNumber(Number(e.target.value)),
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="xl:col-span-2">
                  <div className="form-element">
                    <div className="flex">
                      <Radio
                        title="One Time"
                        checked={fields.pricetype === "onetime"}
                        onChoose={() => {
                          console.log("one time radio");
                          setFields({
                            ...fields,
                            pricetype: "onetime",
                          });
                        }}
                        name={`radio-open`}
                      />
                      <Radio
                        title="Subscription"
                        checked={fields.pricetype === "subscription"}
                        onChoose={() => {
                          console.log("subscription radio");
                          setFields({
                            ...fields,
                            pricetype: "subscription",
                          });
                        }}
                        name={`radio-open`}
                      />
                    </div>
                  </div>
                  {fields.pricetype === "onetime" && (
                    <div className="form-element pt-2.5">
                      <div className="flex">
                        <p className="text-xs text-whilte mt-3 mr-2.5">Price</p>
                        <div className="w-28">
                          <Input
                            type="text"
                            title=""
                            required={false}
                            helperText=""
                            placeholder=""
                            value={
                              fields.priceonetime > 0
                                ? fields.priceonetime.toString()
                                : ""
                            }
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                priceonetime: prepareNumber(
                                  Number(e.target.value),
                                ),
                              })
                            }
                          />
                        </div>
                        <p className="text-xs text-whilte mt-3 ml-2.5">USD</p>
                      </div>
                    </div>
                  )}
                  {fields.pricetype !== "onetime" && (
                    <>
                      <div className="form-element pt-2.5">
                        <div className="flex">
                          <p className="text-xs text-whilte mt-3 mr-2.5">
                            Price
                          </p>
                          <div className="w-28">
                            <Input
                              type="text"
                              title=""
                              required={false}
                              helperText=""
                              placeholder=""
                              value={
                                fields.pricemonthly > 0
                                  ? fields.pricemonthly.toString()
                                  : ""
                              }
                              onChange={(e) =>
                                setFields({
                                  ...fields,
                                  pricemonthly: prepareNumber(
                                    Number(e.target.value),
                                  ),
                                })
                              }
                            />
                          </div>
                          <p className="text-xs text-whilte mt-3 ml-2.5">
                            USD per month
                          </p>
                        </div>
                      </div>
                      <div className="form-element pt-2.5">
                        <div className="flex">
                          <p className="text-xs text-whilte mt-3 mr-2.5">
                            Price
                          </p>
                          <div className="w-28">
                            <Input
                              type="text"
                              title=""
                              required={false}
                              helperText=""
                              placeholder=""
                              value={
                                fields.priceyearly > 0
                                  ? fields.priceyearly.toString()
                                  : ""
                              }
                              onChange={(e) =>
                                setFields({
                                  ...fields,
                                  priceyearly: prepareNumber(
                                    Number(e.target.value),
                                  ),
                                })
                              }
                            />
                          </div>
                          <p className="text-xs text-whilte mt-3 ml-2.5">
                            USD per year
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex justify-center mt-10">
                {!loading && (
                  <>
                    {projectDetail && (
                      <>
                        {projectDetail.offers.length > 0 && (
                          <button
                            className="btn btn-link text-white no-underline"
                            onClick={() => {
                              setOfferPageContent("list");
                            }}
                          >
                            Back
                          </button>
                        )}
                      </>
                    )}

                    <button
                      className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white"
                      onClick={mintOfferPass}
                      disabled={!isReady}
                    >
                      {buttonText}
                    </button>
                  </>
                )}
                {loading && (
                  <button className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white">
                    {buttonText}
                  </button>
                )}
              </div>
              <div className="w-full flex flex-col justify-center items-center mt-5">
                <div className="flex flex-col justify-center items-center">
                  <p className="text-tiny text-white">
                    Small amount of SOL for gas fees
                  </p>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center mt-2">
                    <p className="text-sm text-white">Current balance</p>
                    <div className="bg-black bg-opacity-[0.2] px-1 py-2 min-w-[3vmax] mx-2 rounded-md">
                      {profileInfo?.solBalance || 0}
                    </div>
                    <p className="text-sm text-white">SOL</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {currentMenu !== "offer" && (
            <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
              <div className="max-w-lg mx-auto">
                <h4 className="text-header-small-font-size mb-2">
                  Revenue Share
                </h4>
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-5">
                  <div className="col-span-5">
                    <div className="invitation-type-options">
                      <p className="text-xs text-white">
                        Invitation to Purchase this Offer
                      </p>
                      <div className="grid grid-cols-3 gap-4 ">
                        {invitationTypes.map(
                          (invitationTypeItem: any, index: any) => (
                            <div
                              className="text-center"
                              key={index}
                              onClick={() => {
                                chooseInvitationType(invitationTypeItem);
                              }}
                            >
                              <div
                                className={
                                  invitationTypeItem == fields.invitationType
                                    ? "invitation-type-option-item-select active"
                                    : "invitation-type-option-item-select"
                                }
                              >
                                {invitationTypeItem ==
                                  fields.invitationType && (
                                    <input
                                      type="checkbox"
                                      checked
                                      className="checkbox"
                                    />
                                  )}
                                {invitationTypeItem !=
                                  fields.invitationType && (
                                    <input type="checkbox" className="checkbox" />
                                  )}
                              </div>
                              <p className="text-xs text-white leading-3">
                                {capitalizeString(invitationTypeItem)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                  {fields.invitationType == "optional" && (
                    <div className="col-span-3">
                      <div className="profile-container-element">
                        <Input
                          type="text"
                          title="Discount"
                          required
                          helperText=""
                          placeholder="%"
                          value={
                            fields.discount > 0
                              ? fields.discount.toString()
                              : ""
                          }
                          onChange={(e) =>
                            setFields({
                              ...fields,
                              discount: prepareNumber(Number(e.target.value)),
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="project-share-royalties">
                  <h4 className="text-header-small-font-size mt-2">
                    Set Commissions for Promoters
                  </h4>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-2.5">
                    <div>
                      <div className="project-share-royalties-info">
                        <label className="text-xs text-white mr-2">
                          Ecosystem
                        </label>
                        <span className="text-header-small-font-size text-white ">
                          MMOSH DAO {fields.priceDistribution.echosystem} %
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="project-share-royalties-info">
                        <label className="text-xs text-white mr-2">
                          Curator
                        </label>
                        <span className="text-header-small-font-size text-white">
                          Your Promoter {fields.priceDistribution.curator} %
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex mt-2 mb-3.5">
                    <label className="text-xs text-white leading-10 min-w-12">
                      Creator
                    </label>
                    {fields.invitationType == "none" && (
                      <span className="text-header-small-font-size text-white mx-2 leading-10">
                        {fields.priceDistribution.creator}%{" "}
                      </span>
                    )}
                    {fields.invitationType != "none" && (
                      <div className="mx-2">
                        <input
                          type="text"
                          value={fields.priceDistribution.creator}
                          onChange={(event) => {
                            let priceDetails = {
                              echosystem: 3,
                              curator: 2,
                              creator: prepareNumber(
                                Number(event.target.value),
                              ),
                              promoter: fields.priceDistribution.promoter,
                              scout: fields.priceDistribution.scout,
                            };
                            setFields({
                              ...fields,
                              priceDistribution: priceDetails,
                            });
                          }}
                          placeholder="0"
                          className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                        />
                      </div>
                    )}
                    <span className="text-header-small-font-size text-white leading-10">
                      Your royalties as the Agent founder
                    </span>
                  </div>
                </div>
                {fields.invitationType != "none" && (
                  <div className="project-share-royalties-agents">
                    <h4 className="text-header-small-font-size">Agents</h4>
                    <div className="flex">
                      <label className="text-xs text-white leading-10 min-w-12">
                        Promoter
                      </label>
                      <div className="mx-2">
                        <input
                          type="text"
                          value={fields.priceDistribution.promoter}
                          onChange={(event) => {
                            let priceDetails = {
                              echosystem: 3,
                              curator: 2,
                              creator: fields.priceDistribution.creator,
                              promoter: prepareNumber(
                                Number(event.target.value),
                              ),
                              scout: fields.priceDistribution.scout,
                            };
                            setFields({
                              ...fields,
                              priceDistribution: priceDetails,
                            });
                          }}
                          placeholder="0"
                          className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                        />
                      </div>
                      <span className="text-header-small-font-size text-white leading-10">
                        Promotes your Agent
                      </span>
                    </div>
                    <div className="flex mt-2">
                      <label className="text-xs text-white leading-10 min-w-12">
                        Scout
                      </label>
                      <div className="mx-2">
                        <input
                          type="text"
                          value={fields.priceDistribution.scout}
                          onChange={(event) => {
                            let priceDetails = {
                              echosystem: 3,
                              curator: 2,
                              creator: fields.priceDistribution.creator,
                              promoter: fields.priceDistribution.promoter,
                              scout: prepareNumber(Number(event.target.value)),
                            };
                            setFields({
                              ...fields,
                              priceDistribution: priceDetails,
                            });
                          }}
                          placeholder="0"
                          className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container w-16"
                        />
                      </div>
                      <span className="text-header-small-font-size text-white">
                        Organizes, encourages, trains and motivates Promoters
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-3.5">
                  <h6>
                    <label className="text-header-small-font-size text-white font-bold mr-2">
                      Total:{" "}
                    </label>{" "}
                    <span className="text-header-small-font-size text-white font-bold">
                      {getTotalPercentage()}
                    </span>
                  </h6>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {offerPageContent == "list" && projectDetail && (
        <>
          {offerLoading && (
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
          {!offerLoading && offers.length > 0 && (
            <div className="container mx-auto">
              <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-3 gap-6 px-4 flex mt-4 overflow-x-hidden">
                {offers.map((item: any, index: number) => (
                  <AgentOfferItem data={item} project={projectDetail.project} />
                ))}
              </div>
            </div>
          )}
          {!offerLoading && offers.length == 0 && (
            <div className="mb-5 text-header-small-font-size text-center">
              {" "}
              No Offer found{" "}
            </div>
          )}

          {isOfferPaging && !offerLoading && (
            <div className="flex justify-center mt-5">
              <button
                className="btn btn-primary bg-primary text-white border-none hover:bg-primary hover:text-white"
                onClick={nextOfferPage}
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default AgentOffer;
