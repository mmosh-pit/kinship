import React from "react";
import Input from "./common/Input";
import { useAtom } from "jotai";
import EyeLineIcon from "@/assets/icons/EyeLineIcon";
import EyeIcon from "@/assets/icons/EyeIcon";
import Button from "./common/Button";
import { storeFormAtom } from "@/app/(main)/store/signup";
import client from "@/app/(main)/lib/httpClient";

type HomeModalSignUpFormProps = {
  onSuccess: () => void;
  onLoginTapped: () => void;
};

const HomeModalSignUpForm = ({
  onSuccess,
  onLoginTapped,
}: HomeModalSignUpFormProps) => {
  const [form, setForm] = useAtom(storeFormAtom);

  const [confirmPasswordError, setConfirmPasswordError] = React.useState(false);
  const [emailError, setEmailError] = React.useState(false);

  const [isLoading, setIsLoading] = React.useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    React.useState(false);

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      );
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;

    if (!validateEmail(form.email)) {
      setEmailError(true);
    }

    if (form.password !== form.confirmPassword) {
      setConfirmPasswordError(true);
      return;
    }
    setEmailError(false);
    setConfirmPasswordError(false);
    setIsLoading(true);

    try {
      const url = `/request-code`;
      await client.post(url, {
        email: form.email,
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  return (
    <form
      className="flex flex-col justify-between items-center w-full"
      onSubmit={submit}
    >
      <h1 className="text-[2vmax] font-bold font-goudy text-white">
        Create an Account
      </h1>
      <p className="text-sm font-bold text-center text-white">
        Your Life will never be the same again...
      </p>
      <div className="my-4" />

      <div className="flex flex-col mb-4 md:w-[60%] w-[95%]">
        <Input
          placeholder="First name or Alias"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          type="text"
          title="First name or Alias"
          required
        />

        <div className="my-2" />

        <Input
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          type="text"
          error={emailError}
          helperText={emailError ? "Invalid Email Address" : ""}
          title="Email address"
          required
        />

        <div className="my-2" />

        <Input
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={confirmPasswordError}
          placeholder="Enter your password..."
          title="Password"
          type={isPasswordVisible ? "text" : "password"}
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
          value={form.confirmPassword}
          onChange={(e) =>
            setForm({ ...form, confirmPassword: e.target.value })
          }
          type={isConfirmPasswordVisible ? "text" : "password"}
          error={confirmPasswordError}
          helperText={confirmPasswordError ? "Passwords must match!" : ""}
          placeholder="Confirm your Password..."
          title="Confirm Password"
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

        <p className="text-[0.8vmax] md:text-xs text-[#A49E9E] mt-2">
          By creating an account, you agree to emails about new features and
          community updates. We respect your privacy and will protect your
          personal information. You may unsubscribe at any time.
        </p>
      </div>

      <Button
        type="submit"
        isLoading={isLoading}
        title="Sign up"
        isPrimary
        size="small"
        action={() => { }}
      />

      <div className="my-2" />

      <p className="text-sm text-white">
        Already have an account?{" "}
        <span
          className="cursor-pointer gradient-span text-base"
          onClick={onLoginTapped}
        >
          Log In here!
        </span>
      </p>
    </form>
  );
};

export default HomeModalSignUpForm;
