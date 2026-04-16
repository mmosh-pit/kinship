"use client";

import ImagePicker from "../ImagePicker";
import Button from "../common/Button";
import Input from "../common/Input";
import Radio from "../common/Radio";
import Select from "../common/Select";
import AddIcon from "@/assets/icons/AddIcon";
import Calender from "@/assets/icons/Calender";
import TimeIcon from "@/assets/icons/TimeIcon";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function ProjectCreateStep7({
  onPageChange,
}: {
  onPageChange: any;
}) {
  const navigate = useRouter();
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState([
    {
      type: "Investor",
      value: 0,
      cliff: {
        months: 0,
        percentage: 0,
      },
      vesting: {
        months: 0,
        percentage: 0,
      },
    },
  ]);

  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [isReady, setIsReady] = useState(false);

  React.useEffect(() => {
    if (localStorage.getItem("projectstep6")) {
      let savedData: any = localStorage.getItem("projectstep6");
      setFields(JSON.parse(savedData));
    }
  }, []);

  React.useEffect(() => {
    setIsReady(validateFields(false));
  }, [fields]);

  const gotoStep8 = () => {
    setLoading(true);
    if (validateFields(true)) {
      localStorage.setItem("projectstep6", JSON.stringify(fields));
      onPageChange("step8");
    }
  };

  const goBack = () => {
    onPageChange("step6");
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

  const updateVesting = (i: any, fieldItem: any) => {
    console.log(i);
    console.log(fieldItem);
    let newTokenomics = [];
    for (let index = 0; index < fields.length; index++) {
      if (i == index) {
        newTokenomics.push(fieldItem);
      } else {
        newTokenomics.push(fields[index]);
      }
    }
    setFields(newTokenomics);
  };

  const prepareNumber = (inputValue: any) => {
    if (isNaN(inputValue)) {
      return 0;
    }
    return inputValue;
  };

  const validateFields = (isMessage: any) => {
    for (let index = 0; index < fields.length; index++) {
      const element = fields[index];
      console.log(element);
      if (element.cliff.months == 0 || element.vesting.months == 0) {
        if (isMessage) {
          createMessage(
            "Vesting and Cliff Month should not be zero",
            "danger-container",
          );
        }
        return false;
      }

      if(element.cliff.percentage < 0 || element.vesting.percentage < 0) {
        if (isMessage) {
          createMessage(
            "Vesting and Cliff percentage should not equal to tokenomics value",
            "danger-container",
          );
        }
        return false;
      }

      if (element.cliff.percentage + element.vesting.percentage != element.value) {
        if (isMessage) {
          createMessage(
            "Vesting and Cliff percentage should not equal to tokenomics value",
            "danger-container",
          );
        }
        return false;
      }
    }
    return true;
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
                Step 7
              </h3>
              <h3 className="text-center text-white font-goudy font-normal text-sub-title-font-size pt-1.5">
                Set the Vesting Schedule for your Community Coin.
              </h3>
              <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">
                Those who receive a significant share of tokens will be required
                to hold the tokens for a period of time before they can be sold.
              </p>
            </div>
          </div>
        </div>
        <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
          <div className="grid grid-cols-12">
            <div className="col-span-12 lg:col-start-4 lg:col-span-6 xl:col-start-4 xl:col-span-6">
              <div className="backdrop-container rounded-xl py-5 px-10 border border-white border-opacity-20 mb-10 ">
                <h3 className="text-sub-title-font-size text-while font-poppins text-center pb-10">
                  Vesting Schedule
                </h3>

                <div className="grid grid-cols-3 gap-4 text-center mb-5">
                  <h5 className="text-header-small-font-size text-white">
                    Distribution Plan
                  </h5>
                  <h5 className="text-header-small-font-size text-white">
                    Cliff Month
                  </h5>
                  <h5 className="text-header-small-font-size text-white">
                    Vesting Months
                  </h5>
                </div>

                {fields.map((fieldItem, i) => (
                  <div className="grid grid-cols-3 gap-4 text-center mb-5">
                    <p className="text-para-font-size text-white leading-10">
                      {fieldItem.type} {fieldItem.value}%
                    </p>
                    <div className="flex justify-center">
                      <div className="pr-1">
                        <div className="w-16">
                          <Input
                            type="text"
                            title=""
                            required={false}
                            helperText=""
                            placeholder="0"
                            value={
                              fieldItem.cliff.months > 0
                                ? fieldItem.cliff.months.toString()
                                : ""
                            }
                            onChange={(e) => {
                              fieldItem.cliff.months = prepareNumber(
                                Number(e.target.value),
                              );
                              updateVesting(i, fieldItem);
                            }}
                          />
                        </div>
                      </div>
                      <div className="pl-1">
                        <div className="w-16">
                          <Input
                            type="text"
                            title=""
                            required={false}
                            helperText=""
                            placeholder="%"
                            value={
                              fieldItem.cliff.percentage > 0
                                ? fieldItem.cliff.percentage.toString()
                                : ""
                            }
                            onChange={(e) => {
                              fieldItem.cliff.percentage = prepareNumber(
                                Number(e.target.value),
                              );
                              fieldItem.vesting.percentage =
                                fieldItem.value - fieldItem.cliff.percentage;
                              updateVesting(i, fieldItem);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <div className="pr-1">
                        <div className="w-16">
                          <Input
                            type="text"
                            title=""
                            required={false}
                            helperText=""
                            placeholder="0"
                            value={
                              fieldItem.vesting.months > 0
                                ? fieldItem.vesting.months.toString()
                                : ""
                            }
                            onChange={(e) => {
                              fieldItem.vesting.months = prepareNumber(
                                Number(e.target.value),
                              );
                              updateVesting(i, fieldItem);
                            }}
                          />
                        </div>
                      </div>
                      <div className="pl-1">
                        <div className="w-16">
                          <Input
                            type="text"
                            title=""
                            required={false}
                            helperText=""
                            placeholder="%"
                            value={
                              fieldItem.vesting.percentage > 0
                                ? fieldItem.vesting.percentage.toString()
                                : ""
                            }
                            onChange={(e) => {
                              fieldItem.vesting.percentage = prepareNumber(
                                Number(e.target.value),
                              );
                              fieldItem.cliff.percentage =
                              fieldItem.value - fieldItem.vesting.percentage;
                              updateVesting(i, fieldItem);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <p className="text-header-small-font-size text-center pt-10">
                  NOTE: Unvested tokens will be held by the MMOSH protocol until
                  they are vested. At that time they will be released to the
                  Founder for distribution. Vesting schedules are counted from
                  the Listing Date.
                </p>
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
                onClick={gotoStep8}
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
