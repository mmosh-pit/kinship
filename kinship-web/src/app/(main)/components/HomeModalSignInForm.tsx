import React from "react";
import Input from "./common/Input";
import EyeLineIcon from "@/assets/icons/EyeLineIcon";
import EyeIcon from "@/assets/icons/EyeIcon";
import Button from "./common/Button";
import { usePathname, useRouter } from "next/navigation";
import { useAtom } from "jotai";
import client from "@/app/(main)/lib/httpClient";
import { data, isAuth, isAuthOverlayOpen } from "@/app/(main)/store";

type HomeModalSignUpFormProps = {
  onSuccess: () => void;
  onSignUpTapped: () => void;
};

const HomeModalSignInForm = ({
  onSuccess,
  onSignUpTapped,
}: HomeModalSignUpFormProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const [_, setShowAuthOverlay] = useAtom(isAuthOverlayOpen);
  const [__, setIsUserAuthenticated] = useAtom(isAuth);
  const [___, setUser] = useAtom(data);

  const [form, setForm] = React.useState({
    email: "",
    password: "",
  });

  const [error, setError] = React.useState("");

  const [emailError, setEmailError] = React.useState(false);

  const [isLoading, setIsLoading] = React.useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      );
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.email || !form.password) return;

    if (!validateEmail(form.email)) {
      setEmailError(true);
      setIsLoading(false);
    }

    setEmailError(false);
    setIsLoading(true);

    try {
      const url = `/login`;
      const res = await client.post(url, {
        handle: form.email,
        password: form.password,
      });

      window.localStorage.setItem("token", res.data.data.token);
      setIsUserAuthenticated(true);
      setShowAuthOverlay(false);
      setUser(res.data.data.user);

      if (pathname === "/" || pathname === "/preview") {
        router.replace("/chat");
      }
      onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.error || "Failed to Login, please check support",
      );
    }
    setIsLoading(false);
  };

  return (
    <form
      className="flex flex-col justify-between items-center w-full"
      onSubmit={submit}
    >
      <h1 className="text-[2vmax] font-bold font-goudy text-white">
        Welcome Home
      </h1>
      <p className="text-sm font-bold text-white mt-2 text-center">
        Enter your email address and password to log in.
      </p>
      <div className="my-4" />

      <div className="flex flex-col mb-4 md:w-[60%] w-[95%]">
        <Input
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          type="text"
          error={emailError || error.includes("user")}
          helperText={
            emailError
              ? "Invalid Email Address"
              : error.includes("user")
                ? "User does not exists"
                : ""
          }
          title="Email address"
          required
        />

        <div className="my-2" />

        <Input
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Enter your password..."
          title="Password"
          type={isPasswordVisible ? "text" : "password"}
          helperText={error.includes("password") ? "Incorrect password" : ""}
          error={error.includes("password")}
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

      <Button
        type="submit"
        isLoading={isLoading}
        title="Log In"
        isPrimary
        size="small"
        action={() => { }}
      />

      <div className="my-2" />

      <p className="text-sm text-white">
        Don't have an account?{" "}
        <span
          className="cursor-pointer gradient-span text-base"
          onClick={onSignUpTapped}
        >
          Sign Up here!
        </span>
      </p>
    </form>
  );
};

export default HomeModalSignInForm;
