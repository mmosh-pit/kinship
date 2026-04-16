import React from "react";
import { useAtom } from "jotai";

import {
  selectOpened,
  step,
  step1Form,
  step3Form,
} from "@/app/(main)/store/community";
import Card from "../common/Card";
import Input from "../../common/Input";
import SimpleInput from "../../common/SimpleInput";
import Button from "../../common/Button";
import StepsTitle from "../common/StepsTitle";
import CustomCoinSelect from "../../common/CustomCoinSelect";
import axios from "axios";
import { userWeb3Info } from "@/app/(main)/store";
import MessageBanner from "../../common/MessageBanner";
import { Coin } from "@/app/(main)/models/coin";
import ArrowBack from "@/assets/icons/ArrowBack";

const Step3 = () => {
  const [profileInfo] = useAtom(userWeb3Info);
  const [currentStep, setCurrentStep] = useAtom(step);
  const [firstForm] = useAtom(step1Form);
  const [form, setForm] = useAtom(step3Form);
  const [isSelectOpen] = useAtom(selectOpened);

  const [isLoading, setIsLoading] = React.useState(false);

  const [message, setMessage] = React.useState({
    message: "",
    type: "",
  });

  const changeFormRoyaltiesInput = React.useCallback(
    (value: string, field: string) => {
      const numericValue = Number(value.replace("%", ""));

      if (Number.isNaN(numericValue)) {
        setForm((value) => ({ ...value, [field]: "0%" }));
        return;
      }

      setForm((value) => ({ ...value, [field]: `${numericValue}%` }));
    },
    [],
  );

  const getTotalRoyaltiesValue = React.useCallback(() => {
    const hasInvitation = form.invitation !== "none";

    const totalValue =
      (hasInvitation ? Number(form.scoutRoyalties.replace("%", "")) : 0) +
      Number(form.creatorRoyalties.replace("%", "")) +
      (hasInvitation ? Number(form.promoterRoyalties.replace("%", "")) : 0) +
      3 +
      2;

    return totalValue;
  }, [
    form.scoutRoyalties,
    form.promoterRoyalties,
    form.creatorRoyalties,
    form.invitation,
  ]);

  const navigateToNextStep = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const finalDiscount =
        form.invitation === "optional" ? form.invitationDiscount : "";

      const scoutRoyalties =
        form.invitation !== "none" ? form.scoutRoyalties : "0";
      const promoterRoyalties =
        form.invitation !== "none" ? form.promoterRoyalties : "0";

      let invPrice = form.invitationPrice
      if(form.invitation === "none") {
        invPrice = "0"
      }

      console.log("invPrice ", invPrice)

      const newFormData = {
        ...form,
        invitationPrice: invPrice,
        invitationDiscount: finalDiscount,
        scoutRoyalties,
        promoterRoyalties,
      };

      setForm({ ...form, invitationDiscount: finalDiscount });

      await axios.patch(`/api/update-community-info`, {
        profileAddress: profileInfo?.profile.address,
        data: {
          ...newFormData,
        },
      });
      setCurrentStep(currentStep + 1);
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        message:
          "We’re sorry. An error occurred while trying to save your community. Please try again.",
      });
    }

    setIsLoading(false);
  }, [form]);

  const onSelectCoin = React.useCallback(
    (value: Coin) => {
      setForm({ ...form, coin: value });
    },
    [form],
  );

  const goBack = React.useCallback(() => {
    setCurrentStep(1);
  }, []);

  return (
    <div className="w-full flex flex-col">
      <MessageBanner message={message.message} type={message.type} />

      <div className="w-full flex flex-col items-center mt-20">
        <div className="w-full flex justify-between px-12">
          <div
            className="w-[33%] flex items-center cursor-pointer"
            onClick={goBack}
          >
            <ArrowBack />
            <p className="text-white text-sm ml-2">Back</p>
          </div>

          <StepsTitle
            name="Step 3"
            title="Set the Coin, Royalties, Discount and Prices"
            subtitle="Choose the Coin that will be used by your community members."
          />
          <div className="w-[33%]" />
        </div>

        <div className="flex justify-center items-center mt-12 w-[70%]">
          <div className="w-full flex md:flex-row flex-col justify-around">
            <Card
              name={firstForm.name}
              image={firstForm.preview}
              username={firstForm.symbol}
              description={firstForm.description}
              coinImage={form.coin?.image}
            />

            <div
              className={`w-full community-config-card ${isSelectOpen ? "select-open" : "select-closed"} md:ml-12 mt-12 md:mt-0 relative`}
            >
              <div className="w-full grid grid-cols-2 gap-8">
                <CustomCoinSelect
                  selectedItem={form.coin}
                  onSelect={onSelectCoin}
                  title="Set the Coin"
                  placeholder="Coins"
                />

                <Input
                  type="text"
                  title="Community Pass Price"
                  placeholder="0"
                  value={form.passPrice}
                  onChange={(e) => {
                    setForm({ ...form, passPrice: e.target.value });
                  }}
                  required={false}
                />
              </div>

              <div className="flex w-full justify-between my-4">
                <div className="flex flex-col">
                  <p className="text-xs text-white">
                    Invitation to Mint a Pass
                  </p>
                  <div className="flex justify-between w-[40%]m mt-2">
                    <div className="flex flex-col items-center justify-center">
                      <input
                        id="checkbox1"
                        type="checkbox"
                        className="checkbox checked:border-[#645EBE] [--chkbg:theme(#645EBE)]"
                        checked={form.invitation === "required"}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, invitation: "required" });
                            return;
                          }
                        }}
                      />
                      <p className="text-tiny">Required</p>
                    </div>
                    <div className="flex flex-col items-center justify-center mx-4 md:mx-12">
                      <input
                        id="checkbox2"
                        type="checkbox"
                        className="checkbox checked:border-[#645EBE] [--chkbg:theme(#645EBE)]"
                        checked={form.invitation === "optional"}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, invitation: "optional" });
                            return;
                          }
                        }}
                      />
                      <p className="text-tiny">Optional</p>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <input
                        id="checkbox3"
                        type="checkbox"
                        className="checkbox checked:border-[#645EBE] [--chkbg:theme(#645EBE)]"
                        checked={form.invitation === "none"}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({
                              ...form,
                              invitation: "none",
                              creatorRoyalties: "90%",
                            });
                            return;
                          }
                        }}
                      />
                      <p className="text-tiny">None</p>
                    </div>
                  </div>
                </div>

                {form.invitation === "optional" && (
                  <div className="max-w-[25%]">
                    <Input
                      type="text"
                      title="Discount"
                      placeholder="%"
                      value={form.invitationDiscount}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          invitationDiscount: e.target.value,
                        });
                      }}
                      required={false}
                    />
                  </div>
                )}

                {form.invitation !== "none" && (
                  <div className="max-w-[40%]">
                    <Input
                      type="text"
                      title="Mint Price for Invitation"
                      placeholder="0"
                      value={form.invitationPrice}
                      onChange={(e) => {
                        setForm({ ...form, invitationPrice: e.target.value });
                      }}
                      required={false}
                    />
                  </div>
                )}
              </div>

              <div className="flex w-full flex-col mt-4">
                <p className="text-base text-white">
                  Set the Royalties for the Community
                </p>

                <div className="w-full flex justify-between my-4">
                  <div className="flex w-[40%] justify-between">
                    <p className="text-sm">Ecosystem</p>
                    <p className="text-sm text-white">
                      MMOSH DAO <span className="font-bold">3%</span>
                    </p>
                  </div>
                  <div className="flex w-[40%] justify-between">
                    <p className="text-sm">Curator</p>
                    <p className="text-sm text-white">
                      Your Promoter <span className="font-bold">2%</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <p className="text-sm w-[10%] xs:w-[20%]">Creator</p>
                  <div className="mx-4 max-w-[10%]">
                    <SimpleInput
                      value={form.creatorRoyalties}
                      onChange={(e) =>
                        changeFormRoyaltiesInput(
                          e.target.value,
                          "creatorRoyalties",
                        )
                      }
                    />
                  </div>
                  <p className="text-sm text-white w-[70%]">Your royalties</p>
                </div>
              </div>

              <div className="flex w-full flex-col my-4">
                {form.invitation !== "none" && (
                  <>
                    <p className="text-base text-white">Agents</p>

                    <div className="flex items-center">
                      <p className="text-sm w-[10%] xs:w-[20%]">Promoter</p>
                      <div className="mx-4 w-[10%]">
                        <SimpleInput
                          value={form.promoterRoyalties}
                          onChange={(e) =>
                            changeFormRoyaltiesInput(
                              e.target.value,
                              "promoterRoyalties",
                            )
                          }
                        />
                      </div>
                      <p className="text-sm text-white w-[70%]">
                        Promotes your Community
                      </p>
                    </div>

                    <div className="flex items-center mt-2">
                      <p className="text-sm w-[10%] xs:w-[20%]">Scout</p>
                      <div className="mx-4 w-[10%]">
                        <SimpleInput
                          value={form.scoutRoyalties}
                          onChange={(e) =>
                            changeFormRoyaltiesInput(
                              e.target.value,
                              "scoutRoyalties",
                            )
                          }
                        />
                      </div>
                      <p className="text-sm text-white w-[70%]">
                        Organizes, encourages, trains and motivates Promoters
                      </p>
                    </div>
                  </>
                )}

                <div className="flex mt-4">
                  <p className="text-sm text-white font-bold w-[20%]">Total:</p>
                  <p className="text-sm text-white font-bold">
                    {`${getTotalRoyaltiesValue()}%`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex w-[50%] md:w-[40%] lg:w-[30%] mt-12">
          <Button
            title="Next"
            isLoading={isLoading}
            action={navigateToNextStep}
            isPrimary
            disabled={
              getTotalRoyaltiesValue() < 100 ||
              getTotalRoyaltiesValue() > 100 ||
              form.invitation === "" ||
              !form.coin
            }
            size="large"
          />
        </div>
      </div>
    </div>
  );
};

export default Step3;
