import DocIcon from "@/assets/icons/DocIcon";
import React from "react";

type Props = {
  files: File[];
  addFiles: (file: FileList) => void;
  deleteFile: (index: number) => void;
};

const FilePicker = ({ addFiles, deleteFile, files }: Props) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChangeInput = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      if (!event.target.files.item(0)) return;

      addFiles(event.target.files);
    },
    // eslint-disable-next-line
    [],
  );

  const handleDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFiles(e.dataTransfer.files);
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
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,application/msword,
  application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        onChange={handleChangeInput}
      />
      <div
        className={`w-full min-h-[100px] bg-black bg-opacity-[0.07] border-[1px] border-[#FFFFFF25] backdrop-container rounded-md justify-center items-center ${files.length === 0 ? "cursor-pointer" : ""}`}
        onDragEnter={(e) => handleDrag(e)}
        onDragLeave={(e) => handleDragLeave(e)}
        onDragOver={(e) => handleDragOver(e)}
        onDrop={(e) => handleDrop(e)}
        onClick={files.length === 0 ? triggerClick : () => {}}
      >
        {files.length === 0 ? (
          <div className="flex w-full h-full justify-center items-center">
            <p className="text-sm text-gray-300">Upload a PDF or DOCX file</p>
          </div>
        ) : (
          <div className="w-full flex items-center px-4 py-3 flex-wrap h-full">
            {files.map((file, index) => (
              <div
                className="flex flex-col justify-center items-center bg-black bg-opacity-[0.15] border-[1px] border-[#FFFFFF25] rounded-md mx-1"
                key={`${file.size}-${file.name}-${index}`}
              >
                <p className="text-xs text-gray-500 max-w-[70px] text-ellipsis overflow-hidden whitespace-nowrap">
                  {file.name}
                </p>

                <div className="my-2">
                  <DocIcon />
                </div>

                <div
                  className="flex items-center justify-center cursor-pointer"
                  onClick={() => deleteFile(index)}
                >
                  <div className="flex justify-center items-center rounded-full border-[1px] border-[#FFFFFF25] w-[0.5vmax] h-[0.5vmax] mr-1">
                    -
                  </div>
                  <p className="text-xs text-gray-500">Delete</p>
                </div>
              </div>
            ))}

            <div className="flex cursor-pointer" onClick={triggerClick}>
              <div className="flex justify-center items-center rounded-full border-[1px] border-[#FFFFFF25] w-[0.8vmax] h-[0.8vmax]">
                <p className="text-sm text-white font-bold">+</p>
              </div>
              <p className="text-base text-white font-bold">Add File</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default FilePicker;
