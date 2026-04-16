import React from "react";

import FileIcon from "@/assets/icons/FileIcon";
import AddIcon from "@/assets/icons/AddIcon";

type Props = {
  changeFile: (file: File | null) => void;
  file: string;
  isButton: boolean;
  multiple?: boolean;
};

const FilePicker = ({ changeFile, isButton, multiple }: Props) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChangeInput = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      if (!event.target.files.item(0)) return;

      for (const file of event.target.files) {
        changeFile(file);
      }
    },
    // eslint-disable-next-line
    [],
  );

  const handleDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      for (const file of e.dataTransfer.files) {
        changeFile(file);
      }
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
        multiple={multiple}
        accept="application/pdf,application/msword,
  application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        onChange={handleChangeInput}
      />
      {!isButton && (
        <div className="cursor-pointer" onClick={triggerClick}>
          <div className="backdrop-container rounded-xl px-5 py-10 border border-white border-opacity-20 text-center">
            <p className="text-para-font-size light-gray-color text-center">
              PDF or Docx
            </p>
            <div className="w-8 mx-auto">
              <FileIcon />
            </div>
            <p className="text-para-font-size light-gray-color text-center">
              <span className="font-semibold">Drag and Drop file</span> or{" "}
              <span className="font-semibold">Browse media</span> on your device
            </p>
          </div>
        </div>
      )}

      {isButton && (
        <div className="h-full">
          <h3 className="flex h-full justify-center items-center">
            <div className="cursor-pointer" onClick={triggerClick}>
              <AddIcon />
            </div>
            <span className="text-para-font-size text-while font-poppins p-1.5">
              Add File
            </span>
          </h3>
        </div>
      )}
    </div>
  );
};

export default FilePicker;
