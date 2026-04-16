"use client";
import React from "react";
import Input from "../components/common/Input";
import { useRouter } from "next/navigation";
import EyeLineIcon from "@/assets/icons/EyeLineIcon";
import EyeIcon from "@/assets/icons/EyeIcon";
import { useAtom } from "jotai";
import { data, isAuth, isAuthOverlayOpen } from "@/app/(main)/store";
import KinshipMainIcon from "@/assets/icons/KinshipMainIcon";
import ArrowRight from "@/assets/icons/ArrowRight";
import client from "@/app/(main)/lib/httpClient";

const Login = () => {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const [error, setError] = React.useState("");

  const [isLoading, setIsLoading] = React.useState(false);

  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);

  const [_, setShowAuthOverlay] = useAtom(isAuthOverlayOpen);
  const [__, setIsUserAuthenticated] = useAtom(isAuth);
  const [___, setUser] = useAtom(data);

  const checkIfIsAuthenticated = React.useCallback(async () => {
    try {
      const result = await client.get("/is-auth");

      if (result.data) {
        router.replace("/");
        const user = result.data?.data?.user;

        setShowAuthOverlay(!user);
        setIsUserAuthenticated(!!user);
        setUser(user);
      }
    } catch (error) { }
  }, []);

  const submit = React.useCallback(
    async (e: any) => {
      e.preventDefault();
      setError("");
      setIsLoading(true);
      try {
        const url = `/login`;
        const res = await client.post(url, {
          handle: email,
          password,
        });

        window.localStorage.setItem("token", res.data.data.token);
        setIsUserAuthenticated(true);
        setShowAuthOverlay(false);
        setUser(res.data.data.user);
        router.replace("/early");
      } catch (err: any) {
        const error = err?.response?.data?.error;

        setError(error || "Failed to Login, please check support");
      }

      setIsLoading(false);
    },
    [email, password],
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
        <div className="flex flex-col items-center">
          <KinshipMainIcon />
        </div>

        <div className="flex flex-col items-center my-4">
          <h6 className="my-2">Welcome Home</h6>
          <p className="text-sm">
            Enter your email address and password to log in
          </p>
        </div>

        <div className="w-[75%] md:w-[60%] lg:w-[50%] flex flex-col mt-4">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="text"
            error={error.includes("user")}
            helperText={error.includes("user") ? "User does not exists" : ""}
            placeholder="Enter your email address..."
            title="Email address"
            required={false}
          />

          <div className="my-2" />

          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={isPasswordVisible ? "text" : "password"}
            placeholder="Enter your password..."
            title="Password"
            helperText={error.includes("password") ? "Incorrect password" : ""}
            error={error.includes("password")}
            required={false}
            trailing={
              <div className="flex">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setIsPasswordVisible(!isPasswordVisible);
                  }}
                  className="bg-[#FFFFFF12] p-2 rounded-lg"
                >
                  {isPasswordVisible ? <EyeLineIcon /> : <EyeIcon />}
                </button>

                <div className="mx-1" />

                <button
                  type="submit"
                  className="login-btn-gradient p-2 rounded-lg"
                >
                  {isLoading ? (
                    <span className="loading loading-spinner loading-lg bg-[#BEEF00] w-[20px] h-[12px]"></span>
                  ) : (
                    <ArrowRight />
                  )}
                </button>
              </div>
            }
          />
        </div>

        <div className="w-[75%] md:w-[60%] lg:w-[50%] flex items-center justify-end">
          <a
            className="text-xs underline cursor-pointer font-light"
            onClick={() => router.push("/forgot-password")}
          >
            Forgot Password?
          </a>
        </div>

        {/*<div className="mt-6">
          <p className="text-sm">
            Don't have an account?{" "}
            <span
              className="cursor-pointer gradient-span text-sm"
              onClick={() => router.push("/sign-up")}
            >
              Sign up here!
            </span>
          </p>
        </div>*/}
      </div>
    </form>
  );
};

export default Login;
