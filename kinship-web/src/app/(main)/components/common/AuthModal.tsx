import React from "react";
import Modal from "react-modal";
import Input from "./Input";
import EyeIcon from "@/assets/icons/EyeIcon";
import EyeLineIcon from "@/assets/icons/EyeLineIcon";
import axios from "axios";
import Button from "./Button";
import { useAtom } from "jotai";
import { data, isAuth, isAuthModalOpen, isAuthOverlayOpen } from "@/app/(main)/store";
import CloseIcon from "@/assets/icons/CloseIcon";
import { useRouter } from "next/navigation";

const customStyles = {
  content: {
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    marginRight: "-50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "#02001A",
    minWidth: "300px",
    maxWidth: "700px",
    width: "100%",
    borderRadius: "1rem",
    border: "none",
    padding: "2rem 3rem",
  },
  overlay: {
    background: "#00000040",
  },
};

const AuthModal = () => {
  const router = useRouter();

  const [isOpen, setIsOpen] = useAtom(isAuthModalOpen);
  const [_, setIsUserAuthenticated] = useAtom(isAuth);
  const [__, setShowAuthOverlay] = useAtom(isAuthOverlayOpen);
  const [___, setIsAuthModalOpen] = useAtom(isAuthModalOpen);
  const [____, setUser] = useAtom(data);

  const [form, setForm] = React.useState({
    email: "",
    password: "",
  });
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [error, setError] = React.useState("");

  const [isLoading, setIsLoading] = React.useState(false);

  const submit = React.useCallback(
    async (e: any) => {
      e.preventDefault();
      if (!form.email || !form.password) return;
      setError("");
      setIsLoading(true);
      try {
        const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/login`;
        const res = await axios.post(url, {
          handle: form.email,
          password: form.password,
        });

        window.localStorage.setItem("token", res.data.data.token);
        close();
        setShowAuthOverlay(false);
        setIsAuthModalOpen(false);
        setIsUserAuthenticated(true);
        setUser(res.data.data.user);
      } catch (err: any) {
        setError(
          err?.response?.data || "Failed to Login, please check support",
        );
      }

      setIsLoading(false);
    },
    [form],
  );

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={() => setIsOpen(false)}
      style={customStyles}
    >
      <div className="flex justify-between">
        <div className="w-[10%]" />
        <h2 className="font-goudy text-center">Join Kinship Bots</h2>

        <button
          className="flex justify-end w-[10%]"
          onClick={() => setIsOpen(false)}
        >
          <CloseIcon />
        </button>
      </div>
      <form
        className="flex flex-col w-full items-center justify-evenly px-12 mt-4"
        onSubmit={submit}
      >
        <Input
          type="text"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={error === "user"}
          helperText={error === "user" ? "User does not exists" : ""}
          title="Email Address"
          required={false}
          placeholder="Email Address"
        />

        <div className="my-2" />

        <Input
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
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

        <div className="w-full flex flex-col items-center mt-8 mb-4">
          <Button
            title="Log In"
            action={() => { }}
            size="large"
            isPrimary
            type="submit"
            isLoading={isLoading}
            disabled={!form.email || !form.password}
          />

          <a
            href={`${process.env.NEXT_PUBLIC_APP_MAIN_URL}/forgot-password`}
            className="text-base text-white underline mt-2 font-thin"
          >
            Forgot Password?
          </a>
        </div>

        <div className="h-[1px] bg-[#36357C] w-[70%] px-6 my-4" />

        <button
          className="w-[70%] bg-[#6868682B] border-[1px] border-white border-opacity-[0.22] rounded-lg mx-8 py-2"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push("/sign-up");
          }}
        >
          Sign Up
        </button>
      </form>
    </Modal>
  );
};

export default AuthModal;
