"use client";

import ImagePicker from "../ImagePicker";
import Button from "../common/Button";
import Input from "../common/Input";
import Radio from "../common/Radio";
import Select from "../common/Select";
import AddIcon from "@/assets/icons/AddIcon";
import Calender from "@/assets/icons/Calender";
import TimeIcon from "@/assets/icons/TimeIcon";
import axios from "axios";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useAtom } from "jotai";
import { userWeb3Info } from "@/app/(main)/store";

export default function ProjectCreateStep8({
  onPageChange,
}: {
  onPageChange: any;
}) {
  const navigate = useRouter();
  const [profileInfo] = useAtom(userWeb3Info);
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState({
    usd: 0,
    mmosh: 0,
    sol: 0,
  });

  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");
  const [solPrice, setSolPrice] = useState(0);
  const [mmoshPrice, setMmoshPrice] = useState(0);

  const validateFields = () => {
    if (fields.usd < 1) {
      createMessage(
        "Liqudity pool value should be equal or greater than 100 USD",
        "danger-container",
      );
      return false;
    }

    console.log("profileInfo", profileInfo);

    let usdcBalance = profileInfo?.usdcBalance ? profileInfo?.usdcBalance : 0;
    if (fields.usd >= usdcBalance) {
      createMessage(
        "Not enough USDC to create liquidity pool",
        "danger-container",
      );
      return false;
    }

    let mmoshBalance = profileInfo?.mmoshBalance
      ? profileInfo?.mmoshBalance
      : 0;
    if (fields.mmosh >= mmoshBalance) {
      createMessage(
        "Not enough MMOSH to create liquidity pool",
        "danger-container",
      );
      return false;
    }

    let solBalance = profileInfo?.solBalance ? profileInfo?.solBalance : 0;
    if (fields.sol >= solBalance) {
      createMessage(
        "Not enough SOL to create liquidity pool",
        "danger-container",
      );
      return false;
    }

    return true;
  };

  React.useEffect(() => {
    if (localStorage.getItem("projectstep8")) {
      let savedData: any = localStorage.getItem("projectstep8");
      setFields(JSON.parse(savedData));
    }
    getPriceForSol();
  }, []);

  const getPriceForSol = async () => {
    try {
      const result = await axios.get(
        `${process.env.NEXT_PUBLIC_JUPITER_PRICE_API}?ids=So11111111111111111111111111111111111111112,${process.env.NEXT_PUBLIC_OPOS_TOKEN}`,
      );
      setSolPrice(result.data.data.SOL.price);
      setMmoshPrice(result.data.data.MMOSH.price);
    } catch (error) {
      console.log("getPriceForSol error", error);
    }
  };

  const gotoStep9 = () => {
    setLoading(true);
    if (validateFields()) {
      localStorage.setItem("projectstep8", JSON.stringify(fields));
      onPageChange("step9");
    }
  };

  const goBack = () => {
    onPageChange("step7");
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

  const prepareNumber = (inputValue: any) => {
    if (isNaN(inputValue)) {
      return 0;
    }
    return inputValue;
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
                Step 8
              </h3>
              <h3 className="text-center text-white font-goudy font-normal text-sub-title-font-size pt-1.5">
                Set Liquidity Pool
              </h3>
              <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">
                Allocate USDC, SOL and MMOSH for the initial liquidity pools at
                launch. A minimum of 500 USDC is required for listing by name
                and symbol on the DEXs. We will provide matching funds for all
                pools and promote your project with a minimum of $300 in MMOSH.
                A supply of your Community Coin equal in value to the trading
                pair will be required for each liquidity pool.
              </p>
            </div>
          </div>
        </div>
        <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
          <div className="grid grid-cols-12">
            <div className="col-start-4 col-span-6">
              <div className="backdrop-container rounded-xl py-5 px-10 border border-white border-opacity-20 mb-10 ">
                <h3 className="text-sub-title-font-size text-while font-poppins text-center pb-5">
                  Liquidity
                </h3>
                <p className="text-header-small-font-size text-center pb-10">
                  Set the value of the liquidity pools in USD for each trading
                  pair, with a minimum of $100 each.
                </p>

                <div className="flex justify-center mb-5">
                  <div className="w-24 mr-3.5">
                    <Input
                      type="text"
                      title=""
                      required={false}
                      helperText=""
                      placeholder="0"
                      value={fields.usd > 0 ? fields.usd.toString() : ""}
                      onChange={(e) => {
                        let usd = prepareNumber(Number(e.target.value));

                        setFields({
                          usd: usd,
                          sol: usd / solPrice,
                          mmosh: usd / mmoshPrice,
                        });
                      }}
                    />
                  </div>
                  <p className="text-para-font-size text-white leading-10 min-w-14">
                    in USDC
                  </p>
                </div>

                <div className="flex justify-center mb-5">
                  <div className="w-24 mr-3.5">
                    <Input
                      type="text"
                      title=""
                      required={false}
                      helperText=""
                      placeholder="0"
                      value={fields.sol > 0 ? fields.sol.toString() : ""}
                      onChange={(e) => {
                        let sol = prepareNumber(Number(e.target.value));
                        let usdPercentage = solPrice / 1;
                        setFields({
                          usd: sol * usdPercentage,
                          sol: sol,
                          mmosh: (sol * usdPercentage) / mmoshPrice,
                        });
                      }}
                    />
                  </div>
                  <p className="text-para-font-size text-white leading-10 min-w-14">
                    in SOL
                  </p>
                </div>

                <div className="flex justify-center mb-5">
                  <div className="w-24 mr-3.5">
                    <Input
                      type="text"
                      title=""
                      required={false}
                      helperText=""
                      placeholder="0"
                      value={fields.mmosh > 0 ? fields.mmosh.toString() : ""}
                      onChange={(e) => {
                        let mmosh = prepareNumber(Number(e.target.value));
                        let usdPercentage = mmoshPrice / 1;
                        setFields({
                          usd: mmosh * usdPercentage,
                          sol: (mmosh * usdPercentage) / solPrice,
                          mmosh: mmosh,
                        });
                      }}
                    />
                  </div>
                  <p className="text-para-font-size text-white leading-10 min-w-14">
                    in MMOSH
                  </p>
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
                onClick={gotoStep9}
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
