"use client";
import React from "react";
import Input from "../components/common/Input";
import Button from "../components/common/Button";
import { useRouter, useSearchParams } from "next/navigation";
import EyeIcon from "@/assets/icons/EyeIcon";
import EyeLineIcon from "@/assets/icons/EyeLineIcon";
import KinshipCodesLogin from "@/assets/icons/KinshipCodesLogin";
import client from "@/app/(main)/lib/httpClient";

const ResetPassword = () => {
  const router = useRouter();

  const searchParams = useSearchParams();

  const search = searchParams.get("code");

  const [passwordConfirmation, setPasswordConfirmation] = React.useState("");
  const [password, setPassword] = React.useState("");

  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    React.useState(false);

  const [isLoading, setIsLoading] = React.useState(false);

  const [error, setError] = React.useState(false);

  const checkIfIsAuthenticated = React.useCallback(async () => {
    try {
      const result = await client.get("/is-auth");

      if (result.data) {
        router.replace("/");
      }
    } catch (error) { }
  }, []);

  const submit = React.useCallback(
    async (e: any) => {
      e.preventDefault();
      setError(false);

      if (passwordConfirmation !== password) return;

      setIsLoading(true);
      try {
        await client.post("/reset-password", {
          password,
          code: search,
        });
        router.replace("/login");
      } catch (_) {
        setError(true);
      }

      setIsLoading(false);
    },
    [passwordConfirmation, password],
  );

  React.useEffect(() => {
    checkIfIsAuthenticated();
  }, [router]);

  if (!search) {
    router.replace("/login");
  }

  return (
    <form
      className="w-full min-h-full flex flex-col items-center background-content relative pt-32"
      onSubmit={submit}
    >
      <div className="flex flex-col items-center my-6">
        <div className="flex justify-center w-[250px] h-[100px]">
          <KinshipCodesLogin />
        </div>
        <p className="text-base mt-4">It's All Related</p>
      </div>

      <h6 className="my-4">Reset your Password</h6>

      <div className="w-[75%] md:w-[40%] lg:w-[25%] flex flex-col my-4">
        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type={isPasswordVisible ? "text" : "password"}
          placeholder="Enter your new password..."
          title="New Password"
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

        <div className="my-2" />

        <Input
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          type={isConfirmPasswordVisible ? "text" : "password"}
          placeholder="Confirm your Password"
          title="Confirm your Password"
          required={false}
          trailing={
            <button
              onClick={(e) => {
                e.preventDefault();
                setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
              }}
            >
              {isConfirmPasswordVisible ? <EyeLineIcon /> : <EyeIcon />}
            </button>
          }
        />
      </div>

      {error && (
        <p className="text-base text-red-500">
          Something went wrong, please try again.
        </p>
      )}

      <div className="w-[60%] md:w-[35%] lg:w-[20%] mb-4 mt-8">
        <Button
          title="Reset your Password"
          action={() => { }}
          size="large"
          isPrimary
          type="submit"
          isLoading={isLoading}
          disabled={
            !passwordConfirmation ||
            !password ||
            passwordConfirmation !== password
          }
        />
      </div>
    </form>
  );
};

export default ResetPassword;
