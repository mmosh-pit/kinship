import React from "react";
import Input from "./common/Input";
import Button from "./common/Button";
import { useAtom } from "jotai";
import client from "@/app/(main)/lib/httpClient";
import { alreadyWaiting } from "@/app/(main)/store/home";

type HomeModalWaitlistFormProps = {
  onSuccess: () => void;
};

const HomeModalWaitlistForm = ({ onSuccess }: HomeModalWaitlistFormProps) => {
  const [form, setForm] = React.useState({
    email: "",
    name: "",
  });

  const [error, setError] = React.useState("");

  const [emailError, setEmailError] = React.useState(false);

  const [isLoading, setIsLoading] = React.useState(false);

  const [_, setInWaitlist] = useAtom(alreadyWaiting);

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      );
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.email || !form.name) return;

    if (!validateEmail(form.email)) {
      setEmailError(true);
    }

    setEmailError(false);
    setIsLoading(true);

    try {
      const url = `/early`;
      await client.post(url, {
        email: form.email,
        name: form.name,
      });

      setInWaitlist(true);
      onSuccess();
    } catch (err: any) {
      console.error(err);

      if (err?.response?.data?.error === "already-registered") {
        setError("Email already registered");
      }
    }
    setIsLoading(false);
  };

  return (
    <form
      className="flex flex-col justify-between items-center w-full"
      onSubmit={submit}
    >
      <h1 className="text-[1.2vmax] font-bold font-goudy text-white">
        Gain Early Access to the Little Tech Revolution
      </h1>
      <p className="text-base font-bold text-center">
        Join the Kinship Bots collective—where creators and AI agents join
        forces against the algorithmic overlords!
      </p>
      <div className="my-4" />

      <div className="flex flex-col mb-4 w-[60%]">
        <Input
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          type="text"
          error={emailError || !!error}
          helperText={emailError ? "Invalid Email Address" : error}
          title="Email address"
          required
        />

        <div className="my-2" />

        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Enter your name..."
          title="Name"
          type={"text"}
          required={false}
        />
      </div>

      <Button
        type="submit"
        isLoading={isLoading}
        title="Submit"
        isPrimary
        size="small"
        action={() => { }}
      />
    </form>
  );
};

export default HomeModalWaitlistForm;
