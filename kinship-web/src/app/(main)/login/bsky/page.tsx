"use client";
import React from "react";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import { useRouter } from "next/navigation";
import axios from "axios";
import EyeLineIcon from "@/assets/icons/EyeLineIcon";
import EyeIcon from "@/assets/icons/EyeIcon";
import KinshipCodesLogin from "@/assets/icons/KinshipCodesLogin";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const Bsky = () => {
  const router = useRouter();

  const [handle, setHandle] = React.useState("");
  const [password, setPassword] = React.useState("");

  const [error, setError] = React.useState("");

  const [isLoading, setIsLoading] = React.useState(false);

  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);

  const submit = React.useCallback(
    async (e: any) => {
      e.preventDefault();
      setError("");
      setIsLoading(true);
      try {
        await internalClient.post("/api/login/bsky", {
          handle,
          password,
        });
        router.replace("/coins");
      } catch (err: any) {
        setError(
          err?.response?.data ||
          "Failed to login with Bluesky, please check support",
        );
      }

      setIsLoading(false);
    },
    [handle, password],
  );

  return (
    <form
      className="w-full min-h-full flex flex-col items-center background-content relative pt-32"
      onSubmit={submit}
    >
      <div className="flex flex-col items-center my-6">
        <div className="flex justify-center w-[250px] h-[100px] ">
          <KinshipCodesLogin />
        </div>
        <p className="text-base mt-4">It's All Related</p>
      </div>

      <h6 className="my-4">Connect your Bluesky Account</h6>

      <div className="w-[75%] md:w-[40%] lg:w-[25%] flex flex-col my-4">
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          type="text"
          error={error === "user"}
          helperText={error === "user" ? "User does not exists" : ""}
          placeholder="Enter your Bluesky handle"
          title="Bluesky Handle"
          required={false}
        />

        <div className="my-2" />

        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type={isPasswordVisible ? "text" : "password"}
          placeholder="Enter your password..."
          title="Password"
          helperText={error === "password" ? "Incorrect password" : ""}
          error={error === "password"}
          required={false}
          trailing={
            <button
              onClick={(e) => {
                e.preventDefault();
                setIsPasswordVisible(!isPasswordVisible);
              }}
            >
              {isPasswordVisible ? <EyeLineIcon /> : <EyeIcon />}
            </button>
          }
        />
      </div>

      <div className="w-[60%] md:w-[35%] lg:w-[20%] mb-4 mt-8">
        <Button
          title="Log In"
          action={() => { }}
          size="large"
          isPrimary
          type="submit"
          isLoading={isLoading}
          disabled={!handle || !password}
        />
      </div>

      <div className="w-[60%] md:w-[35%] lg:w-[20%] my-2">
        <Button
          title="Create New Account"
          action={() => {
            router.push("/sign-up");
          }}
          size="large"
          isPrimary={false}
          isLoading={false}
          disabled={isLoading}
        />
      </div>

      <div className="flex justify-center w-[60%] md:w-[35%] lg:w-[20%] my-2">
        <a
          className="text-base underline"
          href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/coins`}
        >
          Skip this, just take me to the coins
        </a>
      </div>
    </form>
  );
};

export default Bsky;
