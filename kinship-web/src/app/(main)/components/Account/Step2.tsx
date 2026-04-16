import React from "react";
import { loadStripeOnramp } from "@stripe/crypto";
import { useAtom } from "jotai";

import { onboardingStep, referredSuccess } from "@/app/(main)/store/account";
import ArrowBack from "@/assets/icons/ArrowBack";
import CopyIcon from "@/assets/icons/CopyIcon";
import Button from "../common/Button";
import useWallet from "@/utils/wallet";
import { CryptoElements, OnrampElement } from "../atm/StripeCryptoElements";
import client from "@/app/(main)/lib/httpClient";
import MessageBanner from "../common/MessageBanner";

const stripeOnrampPromise = loadStripeOnramp(
  process.env.NEXT_PUBLIC_STRIPE_KEY!,
);

const Step2 = () => {
  const wallet = useWallet();
  const [_, setSelectedStep] = useAtom(onboardingStep);
  const [clientSecret, setClientSecret] = React.useState("");

  const [success, setSuccess] = useAtom(referredSuccess);

  React.useEffect(() => {
    if (!wallet) return;

    if (!wallet?.publicKey) return;

    fetch("/api/create-onramp-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_details: {
          wallet_address: wallet?.publicKey.toString(),
        },
      }),
    })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.clientSecret));
  }, [wallet]);

  React.useEffect(() => {
    if (success) {
      setTimeout(() => {
        setSuccess(false);
      }, 6000);
    }
  }, [success]);

  const onChange = React.useCallback(() => {
    console.log("ONRAMP CHANGED????");
  }, []);

  const goToNextStep = React.useCallback(() => {
    setSelectedStep(2);
    client.put("/onboarding-step", {
      step: 2,
    });
  }, []);

  return (
    <div className="flex flex-col w-full items-center overflow-y-hidden mt-8">
      {success && (
        <MessageBanner
          type={"success"}
          message={
            "Your referral code has been applied! You’ll receive your reward shortly."
          }
        />
      )}

      <div className="bg-[#18174750] border-[1px] border-[#FFFFFF80] rounded-lg py-8 md:px-8 px-6 flex flex-col md:w-[55%] w-[70%] mt-4 justify-between">
        <div className="w-full flex justify-between">
          <button onClick={() => setSelectedStep(0)}>
            <ArrowBack />
          </button>

          <p className="text-sm">Step 2 of 4</p>
        </div>

        <div className="flex flex-col self-center mb-12 justify-center items-center">
          <p className="text-white font-goudy text-base text-center">
            Load Your Wallet
          </p>

          <div className="my-2" />

          <p className="text-sm text-center md:max-w-[50%] max-w-[75%]">
            Kinship Bots includes a secure wallet you can use to send and
            receive money, buy, sell and trade crypto, pay for goods and
            services, earn income, royalties and rewards, and so much more!
          </p>

          <div className="my-2" />

          <p className="text-sm text-center md:max-w-[50%] max-w-[75%]">
            To get started, fund your wallet with at least $10 of SOL, which
            you’ll need to pay for network fees and swap for other tokens such
            as USDC and various Bot Coins.
          </p>

          <div className="my-2" />

          <p className="text-sm text-center md:max-w-[50%] max-w-[75%]">
            If you already have a Solana wallet, you can send SOL to this wallet
            over the Solana network. If not, you can transfer from a bank
            account using one of these onramp services.
          </p>
        </div>

        <div className="flex flex-col my-4 md:px-12 px-6 self-center">
          <p className="text-sm text-center">
            Your Kinship Bots wallet address is:
          </p>

          <div className="flex p-2 border-[1px] border-[#FFFFFF80] rounded-lg">
            {wallet?.publicKey?.toString()}
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  wallet?.publicKey?.toString() ?? "",
                );
              }}
            >
              <CopyIcon />
            </button>
          </div>
        </div>

        <div className="flex border-[1px] border-[#FFFFFF09] bg-[#FFFFFF05] rounded-lg p-1 mt-4 md:px-12 px:8 self-center">
          <div className="border-[1px] border-[#FFFFFF09] bg-[#FFFFFF20] rounded-lg py-2 px-2 flex items-center cursor-pointer">
            <p className="text-base font-bold text-center">Rapid Options</p>
          </div>

          <div className="mx-6" />

          <div className="border-[1px] border-[#FFFFFF09] bg-[#FFFFFF09] rounded-lg py-2 px-2 flex-items-center cursor-pointer">
            <p className="text-base text-center">Economy Options</p>
          </div>
        </div>

        <div className="w-full h-[500px] flex justify-center mt-4">
          <CryptoElements stripeOnramp={stripeOnrampPromise}>
            {clientSecret && (
              <OnrampElement
                id="onramp-element"
                clientSecret={clientSecret}
                appearance={{ theme: "dark" }}
                onChange={onChange}
              />
            )}
          </CryptoElements>
        </div>

        <div className="flex mt-8 self-center">
          <Button
            title="Skip"
            isLoading={false}
            action={goToNextStep}
            size="small"
            isPrimary={false}
          />
        </div>
      </div>
    </div>
  );
};

export default Step2;
