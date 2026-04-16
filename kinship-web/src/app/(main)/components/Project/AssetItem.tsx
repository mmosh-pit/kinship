import DownloadIcon from "@/assets/icons/DownloadIcon";
import FileIcon from "@/assets/icons/FileIcon";
import RemoveIcon from "@/assets/icons/RemoveIcon";

const AssetItem = ({
  index,
  file,
  removeFile,
  onChangePrivacy,
}: {
  index: number;
  file: {
    preview: string;
    type: string;
    name: string;
    isPrivate: boolean;
    saved: boolean;
  };
  onChangePrivacy: (file: any, index: number) => {};
  removeFile: (i: number) => {};
}) => {
  return (
    <div>
      <h5 className="text-header-small-font-size text-while font-poppins text-center font-bold">
        File {index + 1}
      </h5>
      <div className="backdrop-container rounded-xl px-5 pb-10 border border-white border-opacity-20 text-center flex flex-col justify-around h-[300px]">
        {file.type === "text" && (
          <div
            className="cursor-pointer self-end ml-3 mt-2"
            onClick={() => {
              removeFile(index);
            }}
          >
            <RemoveIcon />
          </div>
        )}

        <div className="pt-10" />

        {file.type !== "text" && (
          <p className="text-para-font-size light-gray-color text-center break-all max-w-[100%]">
            {file.name}
          </p>
        )}

        {file.type === "text" ? (
          <div className="max-h-[200px] overflow-y-auto">
            <p className="text-sm">{file.preview}</p>
          </div>
        ) : (
          <div className="w-8 mx-auto">
            <FileIcon />
          </div>
        )}

        <div className="flex items-center justify-center w-full mt-4">
          <p className="text-xs">Public</p>
          <input
            type="checkbox"
            className="toggle border-[#0061FF] bg-[#0061FF] [--tglbg:#1B1B1B] hover:bg-[#0061FF] mx-1"
            checked={file.isPrivate}
            onChange={() => {
              onChangePrivacy(!file.isPrivate, index);
            }}
            onClick={() => {
              onChangePrivacy(!file.isPrivate, index);
            }}
          />
          <p className="text-xs">Private</p>
        </div>

        {file.type !== "text" && (
          <div className="flex justify-center mt-4">
            <a className="cursor-pointer" href={file.preview} target="_blank">
              <DownloadIcon />
            </a>
            <div
              className="cursor-pointer ml-3"
              onClick={() => {
                removeFile(index);
              }}
            >
              <RemoveIcon />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetItem;
