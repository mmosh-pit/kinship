"use client";
import React from "react";
import { loadStripeOnramp } from "@stripe/crypto";
import {
  CryptoElements,
  OnrampElement,
} from "../components/atm/StripeCryptoElements";
import useWallet from "@/utils/wallet";

const stripeOnrampPromise = loadStripeOnramp(
  process.env.NEXT_PUBLIC_STRIPE_KEY!,
);

const Page = () => {
  const wallet = useWallet();
  const [clientSecret, setClientSecret] = React.useState("");

  React.useEffect(() => {
    // Fetches an onramp session and captures the client secret
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
  }, []);

  const onChange = React.useCallback(() => {}, []);

  return (
    <div className="w-full h-screen flex flex-col mt-8">
      <div className="flex flex-col items-center justify-center my-8">
        <h6>ATM</h6>
        <p className="text-base max-w-[75%] md:max-w-[65%] lg:max-w-[40%] mt-4">
          For your convenience, we offer a cash machine. Purchase crypto quickly
          and easily using a credit card, debit card or connect directly to your
          bank account. WITH THIS ATM, PLEASE ONLY PURCHASE SOL. YOU WILL NEED
          IT FOR GAS FEES AND YOU CAN SWAP IT FOR USDC, MMOSH AND OTHER TOKENS
          IN SWAP. This will save you the most in fees, and you are less likely
          to lose your funds.
        </p>
      </div>

      <div className="w-full h-full flex justify-center">
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
    </div>
  );
};

export default Page;
