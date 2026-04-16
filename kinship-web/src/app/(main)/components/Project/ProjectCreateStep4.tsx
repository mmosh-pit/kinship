"use client";

import ImagePicker from "../ImagePicker";
import Button from "../common/Button";
import Input from "../common/Input";
import Radio from "../common/Radio";
import Calender from "@/assets/icons/Calender";
import TimeIcon from "@/assets/icons/TimeIcon";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function ProjectCreateStep4({
  onPageChange,
}: {
  onPageChange: any;
}) {
  const navigate = useRouter();
  const [loading, setLoading] = useState(false);
  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");

  const [coinDetails, setCoinDetails] = useState({
    image: {
      preview: "",
      type: "",
    },
    name: "",
    symbol: "",
    desc: "",
    supply: 0,
    listingPrice: 0,
  });

  const [fields, setFields] = useState({
    presaleStartDate: "",
    presaleStartTime: "",
    presaleEndDate: "",
    presaleEndTime: "",
    dexListingDate: "",
    dexListingTime: "",
    maxPresale: 0,
    minPresale: 0,
  });

  const [isReady, setIsReady] = useState(false);
  const imageContainerRef = React.useRef<HTMLInputElement>(null);
  const [imageHeight, setImageHeight] = React.useState(0);

  const [presaleStartError, setPresaleStartError] = useState("");
  const [presaleEndError, setPresaleEndError] = useState("");
  const [dexError, setDexError] = useState("");

  const gotoStep5 = () => {
    setLoading(true);
    if (validateFields(true)) {
      localStorage.setItem("projectstep4", JSON.stringify(fields));
      if (fields.minPresale > 0) {
        onPageChange("step5");
      } else {
        onPageChange("step6");
      }
    }
  };

  const goBack = () => {
    onPageChange("step3");
  };

  React.useEffect(() => {
    setIsReady(validateFields(false));
  }, [fields]);

  React.useEffect(() => {
    if (localStorage.getItem("projectstep3")) {
      let savedData: any = localStorage.getItem("projectstep3");
      setCoinDetails(JSON.parse(savedData));
    }
    if (localStorage.getItem("projectstep4")) {
      let savedData: any = localStorage.getItem("projectstep4");
      setFields(JSON.parse(savedData));
    }
    if (imageContainerRef.current) {
      const { width } = imageContainerRef.current.getBoundingClientRect();
      setImageHeight(width);
    }
  }, []);

  const prepareNumber = (inputValue: any) => {
    if (isNaN(inputValue)) {
      return 0;
    }
    return inputValue;
  };

  const validateFields = (isMessage: boolean) => {
    if (fields.maxPresale) {
      if (fields.maxPresale < 0 || fields.maxPresale > 97) {
        if (isMessage) {
          createMessage(
            "Presale percentage should be between 1 to 97",
            "danger-container",
          );
        }

        return false;
      }
    }

    if (fields.minPresale) {
      if (fields.minPresale <= 0 || fields.minPresale > 100) {
        if (isMessage) {
          createMessage(
            "Minimum Presale Purchases should be between 1 to 100",
            "danger-container",
          );
        }
        return false;
      }
    }

    if (!validatePresale(isMessage)) {
      return false;
    }

    if (!validateDex(isMessage)) {
      return false;
    }

    return true;
  };

  const validatePresale = (isMessage: any) => {
    let currentDate = new Date();
    let presaleStart = new Date(
      fields.presaleStartDate + " " + fields.presaleStartTime,
    );
    let presaleEnd = new Date(
      fields.presaleEndDate + " " + fields.presaleEndTime,
    );

    if (presaleStart < currentDate) {
      if (isMessage) {
        setPresaleStartError("Presale date should be selected in future dates");
      }
      return false;
    }

    if (
      getDateDiff(presaleStart, presaleEnd) < 1 ||
      getDateDiff(presaleStart, presaleEnd) > 90
    ) {
      if (isMessage) {
        setPresaleEndError(
          "Presale duration should be minmum 1 day and maximum 90 days",
        );
      }
      return false;
    }

    return true;
  };

  const validateDex = (isMessage: any) => {
    let presaleEnd = new Date(
      fields.presaleEndDate + " " + fields.presaleEndTime,
    );
    let dexDate = new Date(fields.dexListingDate + " " + fields.dexListingTime);

    console.log(getDateDiff(presaleEnd, dexDate));
    if (getDateDiff(presaleEnd, dexDate) < 2) {
      if (isMessage) {
        setDexError(
          "Listing Date and time must be atleast 48 hours after the end of the presale",
        );
      }
      return false;
    }
    return true;
  };

  const getDateDiff = (startDate: any, endDate: any) => {
    if (endDate.getTime() - startDate.getTime() > 0) {
      var diff = endDate.getTime() - startDate.getTime();
      var diffDays = Math.ceil(diff / (1000 * 3600 * 24));
      return diffDays;
    } else {
      return -1;
    }
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
                Step 4
              </h3>
              <h3 className="text-center text-white font-goudy font-normal text-sub-title-font-size pt-1.5">
                Set Token Presale Launch and DEX Listing
              </h3>
              <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">
                Build demand for your Community Coin with a powerful token
                presale and automate your DEX listings.
              </p>
            </div>
          </div>
        </div>
        <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
          <div className="grid grid-cols-12">
            <div className="col-span-12 lg:col-start-3 lg:col-span-8 xl:col-start-3 xl:col-span-8">
              <div className="backdrop-container rounded-xl p-5 border border-white border-opacity-20 grid grid-cols-1 md:grid-cols-12 gap-4 mb-10">
                <div className="col-span-4">
                  <div
                    className="rounded-full gradient-container p-1.5"
                    ref={imageContainerRef}
                  >
                    <img
                      src={coinDetails.image.preview}
                      className="object-cover rounded-full w-full"
                      style={{ height: imageHeight + "px" }}
                    />
                  </div>
                </div>
                <div className="col-span-4">
                  <div className="md:px-3.5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="mb-10">
                        <label className="text-while text-header-small-font-size block">
                          Name
                        </label>
                        <span className="text-while text-header-small-font-size block">
                          {coinDetails.name}
                        </span>
                      </div>
                      <div className="mb-10">
                        <label className="text-while text-header-small-font-size block">
                          Symbol
                        </label>
                        <span className="text-while text-header-small-font-size block">
                          {coinDetails.symbol}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="mb-10">
                        <label className="text-while text-header-small-font-size block">
                          Supply
                        </label>
                        <span className="text-while text-header-small-font-size block">
                          {coinDetails.supply}
                        </span>
                      </div>
                      <div className="mb-10">
                        <label className="text-while text-header-small-font-size block">
                          List Price
                        </label>
                        <span className="text-while text-header-small-font-size block">
                          {coinDetails.listingPrice} USD
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-while text-header-small-font-size block">
                        Fully Diluted Value (FDV)
                      </label>
                      <span className="text-while text-header-small-font-size block">
                        {coinDetails.supply * coinDetails.listingPrice}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="col-span-4">
                  <div>
                    <label className="text-while text-header-small-font-size block">
                      Description
                    </label>
                    <span className="text-while text-header-small-font-size block">
                      {coinDetails.desc}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="pb-3.5">
                    <p className="text-xs text-whilte">
                      Presale Start Date and Time
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          className={
                            "input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2" +
                            (presaleStartError !== "" ? " border-red-600" : "")
                          }
                        >
                          <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2">
                            <Calender />
                          </div>

                          <input
                            type="date"
                            className="grow text-base"
                            placeholder="Start Date"
                            value={fields.presaleStartDate}
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                presaleStartDate: e.target.value,
                              })
                            }
                            onFocus={() => {
                              setPresaleStartError("");
                            }}
                            onBlur={() => {
                              validatePresale(true);
                            }}
                          />
                        </label>
                        {presaleStartError != "" && (
                          <p className="text-header-small-font-size text-red-600">
                            {presaleStartError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2">
                          <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2.5">
                            <TimeIcon />
                          </div>

                          <input
                            type="time"
                            className="grow text-base"
                            placeholder="Time"
                            value={fields.presaleStartTime}
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                presaleStartTime: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="pb-3.5">
                    <p className="text-xs text-whilte">
                      Presale End Date and Time
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          className={
                            "input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2" +
                            (presaleEndError !== "" ? " border-red-600" : "")
                          }
                        >
                          <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2">
                            <Calender />
                          </div>

                          <input
                            type="date"
                            className="grow text-base"
                            placeholder="End Date"
                            value={fields.presaleEndDate}
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                presaleEndDate: e.target.value,
                              })
                            }
                            onFocus={() => {
                              setPresaleEndError("");
                            }}
                            onBlur={() => {
                              validatePresale(true);
                            }}
                          />
                        </label>
                        {presaleEndError != "" && (
                          <p className="text-header-small-font-size text-red-600">
                            {presaleEndError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2">
                          <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2.5">
                            <TimeIcon />
                          </div>

                          <input
                            type="time"
                            className="grow text-base"
                            placeholder="Time"
                            value={fields.presaleEndTime}
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                presaleEndTime: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-whilte">
                      DEX Listing Date and Time
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          className={
                            "input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2" +
                            (dexError !== "" ? " border-red-600" : "")
                          }
                        >
                          <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2">
                            <Calender />
                          </div>

                          <input
                            type="date"
                            className="grow text-base"
                            placeholder="Start Date"
                            value={fields.dexListingDate}
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                dexListingDate: e.target.value,
                              })
                            }
                            onFocus={() => {
                              setDexError("");
                            }}
                            onBlur={() => {
                              validateDex(true);
                            }}
                          />
                        </label>
                        {dexError != "" && (
                          <p className="text-header-small-font-size text-red-600">
                            {dexError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="input input-bordered h-10 text-base bg-black bg-opacity-[0.07] placeholder-white placeholder-opacity-[0.3] backdrop-container flex items-center gap-2 px-2">
                          <div className="border-r border-white border-opacity-20 pr-2 h-full pt-2.5">
                            <TimeIcon />
                          </div>

                          <input
                            type="time"
                            className="grow text-base"
                            placeholder="Time"
                            value={fields.dexListingTime}
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                dexListingTime: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="pb-3.5">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <Input
                          type="text"
                          title="Total Supply Allocated to Presale"
                          required
                          helperText=""
                          placeholder="%"
                          value={
                            fields.maxPresale > 0
                              ? fields.maxPresale.toString()
                              : ""
                          }
                          onChange={(e) =>
                            setFields({
                              ...fields,
                              maxPresale: prepareNumber(Number(e.target.value)),
                            })
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        {fields.maxPresale > 0 && (
                          <p className="text-right text-header-small-font-size mt-7">
                            {coinDetails.supply * (fields.maxPresale / 100)}{" "}
                            {coinDetails.symbol}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="pb-3.5">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <Input
                          type="text"
                          title="Minimum Presale Purchases Required to List on DEXs"
                          required
                          helperText="Minimum presale purchases must be less than or equal to total presale allocation."
                          placeholder="%"
                          value={
                            fields.minPresale > 0
                              ? fields.minPresale.toString()
                              : ""
                          }
                          onChange={(e) =>
                            setFields({
                              ...fields,
                              minPresale: prepareNumber(Number(e.target.value)),
                            })
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        {fields.minPresale > 0 && (
                          <p className="text-right text-header-small-font-size mt-7">
                            {coinDetails.supply *
                              (fields.maxPresale / 100) *
                              (fields.minPresale / 100)}{" "}
                            {coinDetails.symbol}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
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
                onClick={gotoStep5}
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
    </>
  );
}
