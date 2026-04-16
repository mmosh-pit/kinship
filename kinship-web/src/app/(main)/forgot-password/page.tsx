"use client";
import React from "react";
import Input from "../components/common/Input";
import Button from "../components/common/Button";
import { useRouter } from "next/navigation";
import axios from "axios";
import client from "@/app/(main)/lib/httpClient";
import KinshipMainIcon from "@/assets/icons/KinshipMainIcon";
import internalClient from "@/app/(main)/lib/internalHttpClient";

const ForgotPassword = () => {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const [success, setSuccess] = React.useState(false);

  const checkIfIsAuthenticated = React.useCallback(async () => {
    try {
      const result = await client.get("/is-auth");

      if (result.data) {
        router.replace("/");
      }
    } catch (error) {}
  }, []);

  const submit = React.useCallback(
    async (e: any) => {
      e.preventDefault();
      setIsLoading(true);
      try {
        await internalClient.post("/api/forgot-password-verification", {
          email,
        });
        setSuccess(true);
      } catch (_) {}

      setIsLoading(false);
    },
    [email]
  );

  React.useEffect(() => {
    checkIfIsAuthenticated();
  }, [router]);

  return (
    <form
      className="w-full min-h-full flex flex-col justify-center items-center background-content relative"
      onSubmit={submit}
    >
      <div className="login-card-gradient flex flex-col items-center border-[1px] rounded-3xl border-[#FFFFFF65] w-[85%] md:w-[50%] lg:w-[40%] py-8">
        <div className="flex justify-center">
          <KinshipMainIcon />
        </div>

        <h6 className="my-4">Reset your Password</h6>

        <div className="w-[75%] md:w-[60%] lg:w-[50%] flex flex-col my-4">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="text"
            placeholder="Enter your email address..."
            title="Email address"
            required={false}
          />

          {success && (
            <p className="text-sm text-white">
              We sent you a link to the entered email address, please check your
              inbox! Make sure to check the Spam folder
            </p>
          )}
        </div>

        <div className="w-[60%] md:w-[50%] lg:w-[35%] mb-2 mt-8">
          <Button
            title="Reset your Password!"
            action={() => {}}
            size="large"
            isPrimary
            type="submit"
            isLoading={isLoading}
            disabled={!email}
          />
        </div>

        <div className="w-[60%] md:w-[50%] lg:w-[35%] my-2">
          <Button
            title="Go Back"
            action={() => {
              router.replace("/login");
            }}
            size="large"
            isPrimary={false}
            isLoading={false}
            disabled={isLoading}
          />
        </div>
      </div>
    </form>
  );
};

export default ForgotPassword;
