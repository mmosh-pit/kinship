import React from "react";
import axios from "axios";
import { useAtom } from "jotai";

import ImagePicker from "../../ImagePicker";
import Input from "../../common/Input";
import Button from "../../common/Button";
import StepsTitle from "../common/StepsTitle";
import { step, step1Form } from "@/app/(main)/store/community";
import { pinImageToShadowDrive } from "@/app/(main)/lib/uploadImageToShdwDrive";
import { data, userWeb3Info } from "@/app/(main)/store";
import MessageBanner from "../../common/MessageBanner";
import { deleteShdwDriveFile } from "@/app/(main)/lib/deleteShdwDriveFile";

const Step1 = () => {
  const [currentUser] = useAtom(data);
  const [profileInfo] = useAtom(userWeb3Info);
  const [form, setForm] = useAtom(step1Form);
  const [currentStep, setCurrentStep] = useAtom(step);
  const [image, setImage] = React.useState<File | null>(form.image);
  const [preview, setPreview] = React.useState(form.preview);
  const [isLoading, setIsLoading] = React.useState(false);

  const [message, setMessage] = React.useState({
    message: "",
    type: "",
  });

  const navigateToNextStep = React.useCallback(async () => {
    setMessage({ type: "", message: "" });
    setIsLoading(true);

    const file = image ? await pinImageToShadowDrive(image) : preview;

    if (file === "") {
      setMessage({
        type: "error",
        message:
          "We’re sorry. An error occurred while trying to save your community. Please try again.",
      });
      setIsLoading(false);
      return;
    }

    setForm({ ...form, image: null, preview: file });

    try {
      await axios.patch(`/api/update-community-info`, {
        profileAddress: profileInfo?.profile.address,
        data: {
          name: form.name,
          username: currentUser!.profile.username,
          description: form.description,
          symbol: form.symbol.toLowerCase(),
          passImage: file,
        },
      });
      setCurrentStep(currentStep + 1);
    } catch (err) {
      console.error(err);
      await deleteShdwDriveFile(file);
      setMessage({
        type: "error",
        message:
          "We’re sorry. An error occurred while trying to save your community. Please try again.",
      });
    }

    setIsLoading(false);
  }, [form, image, preview, currentStep]);

  React.useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(image);
    setPreview(objectUrl);
  }, [image]);

  React.useEffect(() => {
    if (!profileInfo?.profile.address) {
      setMessage({
        type: "info",
        message:
          "This feature is for MMOSH DAO members only. [Create a Profile](https://www.mmosh.app/create/create_profile) to join the DAO",
      });
    } else {
      setMessage({ type: "", message: "" });
    }
  }, [profileInfo?.profile]);

  const isFormInvalid =
    !form.name ||
    !form.description ||
    !form.symbol ||
    (!form.preview && !preview);

  return (
    <div className="w-full flex flex-col">
      <MessageBanner message={message.message} type={message.type} />
      <div className="w-full flex flex-col items-center mt-20">
        <StepsTitle
          name="Step 1"
          title="Deploy the Art and Metadata"
          subtitle="Set the image, name, symbol and description for your community."
        />
        <div className="w-[50%] flex flex-col md:flex-row items-center justify-around mt-12">
          <div className="w-[100%] sm:w-[85%] lg:w-[50%]">
            <ImagePicker changeImage={setImage} image={preview} />
          </div>

          <div className="w-full flex flex-col md:ml-8">
            <Input
              title="Name"
              placeholder="Name"
              value={form.name}
              helperText="Up to 50 characters, can have spaces."
              type="text"
              required={false}
              onChange={(e) => {
                const value = e.target.value;

                if (value.length > 50) return;

                setForm({ ...form, name: value });
              }}
            />

            <div className="my-2">
              <Input
                title="Symbol"
                placeholder="Symbol"
                helperText="10 characters"
                value={form.symbol}
                type="text"
                required={false}
                onChange={(e) => {
                  const value = e.target.value.replace(/\s/g, "");

                  if (value.length > 10) return;

                  setForm({ ...form, symbol: value });
                }}
              />
            </div>

            <Input
              title="Description"
              placeholder="Describe your Community within 5000 characters"
              type="text"
              value={form.description}
              required={false}
              onChange={(e) => {
                const value = e.target.value;

                if (value.length > 5000) return;

                setForm({ ...form, description: value });
              }}
              textarea
            />
          </div>
        </div>
        <div className="flex self-center flex-col w-[50%] md:w-[40%] lg:w-[30%] mt-12">
          <Button
            title="Next"
            size="large"
            isPrimary
            disabled={isFormInvalid || isLoading}
            isLoading={isLoading}
            action={navigateToNextStep}
          />

          <p className="text-sm text-center">
            Please note. You will be charged 45,000 $MMOSH and a small amount of
            SOL to deploy your community to the Solana blockchain. Please ensure
            you have sufficient funds in this wallet before you begin.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Step1;
