import Image from "next/image";
import React from "react";

import ImageIcon from "@/assets/icons/ImageIcon";

type Props = {
  changeImage: (file: File | null) => void;
  image: string;
  rounded?: boolean;
  readonly?: boolean;
};

const ImageAccountPicker = ({
  changeImage,
  image,
  rounded,
  readonly,
}: Props) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const imageContainerRef = React.useRef<HTMLInputElement>(null);

  const handleChangeInput = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      if (!event.target.files.item(0)) return;

      changeImage(event.target.files.item(0));
    },
    // eslint-disable-next-line
    [],
  );

  const handleDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      changeImage(e.dataTransfer.files[0]);
    }
    // eslint-disable-next-line
  }, []);

  const handleDrag = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      // setDragActive(true);
    } else if (e.type === "dragleave") {
      // setDragActive(false);
    }
  }, []);

  const handleDragLeave = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );

  const handleDragOver = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );

  const triggerClick = React.useCallback(() => {
    if (!inputRef.current) return;

    inputRef.current.click();
  }, []);

  return (
    <div
      onDragEnter={(e) => handleDrag(e)}
      onDragLeave={(e) => handleDragLeave(e)}
      onDragOver={(e) => handleDragOver(e)}
      onDrop={(e) => handleDrop(e)}
      className="w-full h-full"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleChangeInput}
      />
      {image ? (
        <div className="flex flex-col h-full">
          <div className="flex w-full h-full relative" ref={imageContainerRef}>
            <Image
              src={image}
              alt="Identity"
              fill
              objectFit="contain"
              className={rounded ? "rounded-full" : ""}
            />
          </div>
          {!readonly && (
            <div
              className="flex items-center relative mt-2 cursor-pointer"
              onClick={triggerClick}
            >
              <div className="p-2 border-solid border-[1px] border-white rounded-full mr-2">
                <ImageIcon />
              </div>
              <p className="text-tiny text-white">Replace Image</p>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex flex-col justify-center items-center border-[1px] border-solid border-[#FFF] border-opacity-20 select-none cursor-pointer backdrop-container h-full ${rounded ? "rounded-full" : "rounded-md"}`}
          onClick={triggerClick}
          ref={imageContainerRef}
        >
          <p className="text-base font-montserrat text-para-font-size leading-3 font-light">
            {rounded ? "1080 x 1080" : "1500 x 500"}
          </p>
          <p className="text-base font-montserrat text-para-font-size leading-3 font-light">
            Jpg, Png, Gif. Max 100 mb
          </p>
          <div className="relative py-1.5">
            <Image src="/png.svg" alt="png" width={64} height={64} />
          </div>
          <p className="text-sm text-center text-para-font-size font-light font-montserrat leading-3">
            <span className="text-sm text-white font-medium font-montserrat">
              Drag and Drop file
            </span>
            <br />
            or{" "}
            <span className="text-sm text-white font-medium font-montserrat">
              {" "}
              Browse media{" "}
            </span>{" "}
            on your device
          </p>
        </div>
      )}
    </div>
  );
};

export default ImageAccountPicker;
