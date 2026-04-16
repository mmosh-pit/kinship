"use client";

import ImagePicker from "../ImagePicker";
import Button from "../common/Button";
import Input from "../common/Input";
import Radio from "../common/Radio";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { pinImageToShadowDrive } from "@/app/(main)/lib/uploadImageToShdwDrive";
import ArrowDown from "@/assets/icons/ArrowDown";
import Modal from "react-modal";
import SearchIcon from "@/assets/icons/SearchIcon";
import axios from "axios";
import { Bars } from "react-loader-spinner";
import TokenCard from "./TokenCard";

const customStyles = {
  content: {
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    marginRight: "-50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "#180E4F",
    minWidth: "300px",
    maxWidth: "500px",
    width: "100%",
  },
};

export default function ProjectCreateStep1({
  onPageChange,
}: {
  onPageChange: any;
}) {
  const navigate = useRouter();
  const [loading, setLoading] = useState(false);
  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");

  const [image, setImage] = React.useState<File | null>(null);
  const [modalIsOpen, setIsOpen] = React.useState(false);
  const [keyword, setKeyword] = React.useState("");
  const [coinLoader, setCoinLoader] = React.useState(false);
  const [coinAllList, setCoinAllList] = React.useState([]);
  const [coinList, setCoinList] = React.useState([]);

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
    priceDistribution: {
      echosystem: 3,
      curator: 2,
      creator: 70,
      promoter: 20,
      scout: 5,
    },
    invitationType: "required",
    invitationPrice: 0,
    discount: 0.0,
    isExternalCoin: false,
    externalCoin: {
      name: "",
      address: "",
      image: "",
      symbol: "",
      decimals: 0,
    },
  });

  const [invitationTypes, setInvitationTypes] = React.useState([
    "required",
    "optional",
    "none",
  ]);
  const [isReady, setIsReady] = useState(false);

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
      setFields(JSON.parse(savedData));
    }
  }, []);

  React.useEffect(() => {
    setIsReady(validateFields(false));
  }, [fields]);

  const onRadioChange = (value: any) => {
    console.log("radio change ", value);
    setFields({ ...fields, isExternalCoin: value });
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
      image: fields.image,
      name: fields.name,
      symbol: fields.symbol,
      desc: fields.desc,
      passPrice: fields.passPrice,
      website: fields.website,
      telegram: fields.telegram,
      twitter: fields.twitter,
      priceDistribution: distribution,
      invitationType: currentInvitationType,
      invitationPrice: invitationPrice,
      discount: fields.discount,
      isExternalCoin: fields.isExternalCoin,
      externalCoin: fields.externalCoin,
    });
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
        createMessage("Project pass Image is required", "danger-container");
      }
      return false;
    }

    if (fields.website.length > 0 && !isValidHttpUrl(fields.website)) {
      if (isMessage) {
        createMessage("Invalid website url", "danger-container");
      }
      return false;
    }

    if (
      fields.invitationType == "required" ||
      fields.invitationType == "optional"
    ) {
      if (fields.invitationPrice == 0) {
        if (isMessage) {
          createMessage("Invitation price not mentioned", "danger-container");
        }
        return false;
      }
    }

    if (fields.invitationType == "optional") {
      if (fields.discount == 0) {
        if (isMessage) {
          createMessage("Discount not mentioned", "danger-container");
        }
        return false;
      }
    }

    if (fields.isExternalCoin === true) {
      if (fields.externalCoin.address === "") {
        if (isMessage) {
          createMessage("Coin not choosed", "danger-container");
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

  const gotoStep2 = async () => {
    setLoading(true);
    if (validateFields(true)) {
      const result = await axios.get(
        `/api/project/check-project?symbol=${fields.symbol}`,
      );
      if (result.data) {
        createMessage("Symbol already exist", "danger-container");
        return;
      }
      if (!isValidHttpUrl(fields.image.preview)) {
        let imageFile = await fetch(fields.image.preview)
          .then((r) => r.blob())
          .then(
            (blobFile) =>
              new File([blobFile], uuidv4(), { type: fields.image.type }),
          );
        let imageUri = await pinImageToShadowDrive(imageFile);
        fields.image.preview = imageUri;
      }
      localStorage.setItem("projectstep1", JSON.stringify(fields));
      onPageChange("step2");
    }
  };

  const goBack = () => {
    navigate.back();
  };

  const prepareNumber = (inputValue: any) => {
    if (isNaN(inputValue)) {
      return 0;
    }
    return inputValue;
  };

  const capitalizeString = (str: any) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const openJupiterCoins = () => {
    setIsOpen(true);
    getCoinsFromJupiter();
  };

  const getCoinsFromJupiter = async () => {
    try {
      setCoinLoader(true);
      const result = await axios.get("https://token.jup.ag/strict");
      setCoinAllList(result.data);
      setCoinList(result.data);
      setCoinLoader(false);
    } catch (error) {
      setCoinLoader(false);
      setCoinList([]);
      setCoinAllList([]);
    }
  };

  const closeModal = () => {
    setIsOpen(false);
    setKeyword("");
    setCoinList([]);
    setCoinAllList([]);
  };

  const onCoinSearch = (event: any) => {
    setKeyword(event.target.value);
    console.log(event.target.value);
    if (event.target.value.trim().length == 0) {
      setCoinList(coinAllList);
    } else {
      let newCoinList = coinAllList.filter(
        (item: any) =>
          item.name
            .toLowerCase()
            .includes(event.target.value.trim().toLowerCase()) ||
          item.symbol
            .toLowerCase()
            .includes(event.target.value.trim().toLowerCase()) ||
          item.symbol
            .toLowerCase()
            .includes(event.target.value.trim().toLowerCase()),
      );
      setCoinList(newCoinList);
    }
  };

  const onTokenSelect = (token: any) => {
    setFields({
      ...fields,
      externalCoin: {
        name: token.name,
        address: token.address,
        image: token.logoURI,
        symbol: token.symbol,
        decimals: token.decimals,
      },
    });
    closeModal();
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
          <div className="relative w-full flex flex-col justify-center items-center pt-5">
            <div className="max-w-md">
              <h2 className="text-center text-white font-goudy font-normal text-xl">
                Launch Your Project
              </h2>
              <h3 className="text-center text-white font-goudy text-sub-title-font-size pt-2.5">
                Step 1
              </h3>
              <h3 className="text-center text-white font-goudy font-normal text-sub-title-font-size pt-1.5">
                Design your Project Pass
              </h3>
              <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">
                Projects are the economic engine of Web3. Each Project has a
                specific purpose and leverages protocols, tokens and communities
                to achieve the goals set by the Project founder. The total cost
                of deploying your Project will be 100,000 MMOSH plus a minimum
                of $100 in USDC, SOL and MMOSH to provide liquidity for your
                project’s Community Coin. You will be able to save your work and
                return later to complete the process.
              </p>
            </div>
          </div>
        </div>
        <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-9 gap-4">
            <div className="xl:col-span-2">
              <ImagePicker
                changeImage={setImage}
                image={fields.image.preview}
              />
            </div>
            <div className="xl:col-span-2">
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
                  helperText="10 characters"
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
                  placeholder="Describe your Community within 160 characters."
                  value={fields.desc}
                  onChange={(e) =>
                    setFields({ ...fields, desc: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="xl:col-span-2">
              <div className="form-element pt-2.5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="form-element col-span-9">
                    <Input
                      type="text"
                      title="Project Pass Price"
                      required
                      helperText=""
                      placeholder="0"
                      value={
                        fields.passPrice > 0 ? fields.passPrice.toString() : ""
                      }
                      onChange={(e) =>
                        setFields({
                          ...fields,
                          passPrice: prepareNumber(Number(e.target.value)),
                        })
                      }
                    />
                  </div>
                  <div className="col-span-3 mt-7 text-white text-header-small-font-size">
                    USD
                  </div>
                </div>
              </div>
              <div className="form-element pt-2.5">
                <Input
                  type="text"
                  title="Project Website"
                  required
                  helperText=""
                  placeholder="Project Website"
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
                  required
                  helperText=""
                  placeholder="Project Telegram"
                  value={fields.telegram}
                  onChange={(e) =>
                    setFields({ ...fields, telegram: e.target.value })
                  }
                />
              </div>
              <div className="form-element pt-2.5">
                <Input
                  type="text"
                  title="Project Twitter"
                  required
                  helperText=""
                  placeholder="Project Twitter"
                  value={fields.twitter}
                  onChange={(e) =>
                    setFields({ ...fields, twitter: e.target.value })
                  }
                />
              </div>
              {fields.isExternalCoin && (
                <div className="form-element pt-2.5">
                  <p className="text-xs text-whilte">Select Coin</p>

                  <p
                    className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] backdrop-container flex items-center justify-between gap-2 px-2 cursor-pointer"
                    onClick={openJupiterCoins}
                  >
                    {fields.externalCoin.name !== "" && (
                      <>
                        <span>{fields.externalCoin.name}</span>
                      </>
                    )}
                    {fields.externalCoin.name === "" && (
                      <span className="text-white text-opacity-[0.3]">
                        {" "}
                        Select Coin
                      </span>
                    )}
                    <label className="mr-2.5">
                      <ArrowDown />
                    </label>
                  </p>
                </div>
              )}

              <div className="flex pt-2.5">
                <Radio
                  title="Create a new Community Coin"
                  checked={!fields.isExternalCoin}
                  onChoose={() => {
                    onRadioChange(false);
                  }}
                  disabled={false}
                />
                <div className="relative">
                  <Radio
                    title="Use an Existing Coin"
                    checked={fields.isExternalCoin}
                    onChoose={() => {
                      onRadioChange(true);
                    }}
                    disabled={false}
                  />
                </div>
              </div>
            </div>
            <div className="xl:col-span-3">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-5">
                <div className="col-span-5">
                  <div className="invitation-type-options">
                    <p className="text-xs text-white">
                      Invitation to Mint a Pass
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
                              {invitationTypeItem == fields.invitationType && (
                                <input
                                  type="checkbox"
                                  checked
                                  className="checkbox"
                                />
                              )}
                              {invitationTypeItem != fields.invitationType && (
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
                          fields.discount > 0 ? fields.discount.toString() : ""
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
                {fields.invitationType != "none" && (
                  <div className="col-span-4">
                    <div className="profile-container-element">
                      <Input
                        type="text"
                        title="Mint Price for Invitation"
                        required={false}
                        helperText=""
                        placeholder="0"
                        value={
                          fields.invitationPrice > 0
                            ? fields.invitationPrice.toString()
                            : ""
                        }
                        onChange={(e) =>
                          setFields({
                            ...fields,
                            invitationPrice: prepareNumber(
                              Number(e.target.value),
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="project-share-royalties">
                <h4 className="text-header-small-font-size mt-2">
                  Set the Royalties for the Project
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
                      <label className="text-xs text-white mr-2">Curator</label>
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
                            creator: prepareNumber(Number(event.target.value)),
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
                    Your royalties
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
                            promoter: prepareNumber(Number(event.target.value)),
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
                      Promotes your community
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
          <div className="flex justify-center mt-10">
            <button
              className="btn btn-link text-white no-underline"
              onClick={goBack}
            >
              Back
            </button>
            {!loading && (
              <button
                className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white"
                onClick={gotoStep2}
                disabled={!isReady}
              >
                Next
              </button>
            )}
            {loading && (
              <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white">
                Loading...
              </button>
            )}
          </div>
        </div>
      </div>
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        style={customStyles}
      >
        <h2 className="pb-2.5 mb-2.5 text-sub-title-font-size font-goudy border-b border-white border-opacity-20">
          Coin List{" "}
        </h2>
        <div>
          {!coinLoader && (
            <>
              <div className="search-container">
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
                    placeholder="Search by Coin Name"
                    value={keyword}
                    onChange={onCoinSearch}
                  />
                </label>
              </div>
              <div
                className="overflow-y-auto"
                style={{ maxHeight: window.innerHeight * 0.7 + "px" }}
              >
                {coinList.map((coinItem: any) => (
                  <TokenCard data={coinItem} onChoose={onTokenSelect} />
                ))}
              </div>
            </>
          )}

          {coinLoader && (
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
        </div>
      </Modal>
    </>
  );
}