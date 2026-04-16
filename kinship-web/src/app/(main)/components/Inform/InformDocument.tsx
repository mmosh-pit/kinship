import { AIDocument } from "@/app/(main)/models/AIDocument";
import DocumentIcon from "@/assets/icons/DocumentIcon";
import DownloadIcon from "@/assets/icons/DownloadIcon";
import GlobeIcon from "@/assets/icons/GlobeIcon";
import LockIcon from "@/assets/icons/LockIcon";
import MovieIcon from "@/assets/icons/MovieIcon";
import PictureIcon from "@/assets/icons/PictureIcon";
import RemoveIcon from "@/assets/icons/RemoveIcon";
import axios from "axios";
import React from "react";

type Props = {
  aiDocument: AIDocument;
  onDelete: (id: string) => void;
  isCoin?: boolean;
};

const InformDocument = ({ aiDocument, onDelete, isCoin = false }: Props) => {
  const { isPrivate, name: documentName, url, id } = aiDocument;

  const divRef = React.useRef<HTMLDivElement>(null);

  const [isDocPrivate, setIsDocPrivate] = React.useState(isPrivate);
  const [showTooltip, setShowTooltip] = React.useState(false);

  const onChangePrivacy = React.useCallback(
    async (isPrivate: boolean) => {
      setIsDocPrivate(isPrivate);
      await axios.patch("/api/toggle-document-privacy", {
        docId: id,
        isPrivate: isPrivate,
      });

      const metadata = JSON.stringify({
        name: documentName,
        address: aiDocument.tokenAddress,
        url,
      });

      await axios.delete(
        `https://mmoshapi-uodcouqmia-uc.a.run.app/delete_by_metadata?metadata=${metadata}`,
      );

      const formData = new FormData();
      formData.append("name", isPrivate ? "PRIVATE" : "PUBLIC");
      formData.append("urls", url);
      formData.append("metadata", metadata);

      await axios.post(
        "https://mmoshapi-uodcouqmia-uc.a.run.app/upload",
        formData,
      );
    },
    [aiDocument],
  );

  const getIconByFileType = React.useCallback(() => {
    const extension = url.split(".")[1];

    if (extension === "png") {
      return <PictureIcon />;
    }

    if (extension === "mp4") {
      return <MovieIcon />;
    }

    return <DocumentIcon />;
  }, []);

  const downloadURI = () => {
    const link = document.createElement("a");

    link.setAttribute("download", documentName);
    link.href = url;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getPositionedValues = () => {
    const bounds = divRef.current!.getBoundingClientRect();

    return `top-[${bounds.top - 25
      }px] left-[${bounds.left}px] right-[${bounds.right}px]`;
  };

  return (
    <div className="flex justify-between items-center relative mt-2">
      <div className="flex items-center relative">
        {getIconByFileType()}
        <div className="w-[0.1vmax]" />
        <div className="relative" ref={divRef}>
          <p
            className="text-sm text-white text-ellipsis max-w-[12vmax] whitespace-nowrap overflow-hidden"
            onMouseOver={() => {
              if (showTooltip) return;
              setShowTooltip(true);
            }}
            onMouseOut={() => {
              if (!showTooltip) return;
              setShowTooltip(false);
            }}
          >
            {documentName}
          </p>
          {showTooltip && (
            <div
              className={`fixed ${getPositionedValues()} bg-[#131245] px-2 rounded-lg`}
            >
              <p className="text-sm text-white">{documentName}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center">
        {!isCoin && (
          <div className="flex items-center">
            <GlobeIcon />
            <div className="w-[0.1vmax]" />
            <input
              type="checkbox"
              className="toggle border-[#0061FF] bg-[#0061FF] [--tglbg:#1B1B1B] hover:bg-[#0061FF]"
              checked={isDocPrivate}
              onClick={() => {
                onChangePrivacy(!isDocPrivate);
              }}
            />
            <div className="w-[0.1vmax]" />
            <LockIcon />
          </div>
        )}

        <div className="w-[0.5vmax]" />

        <div className="flex items-center">
          <button onClick={downloadURI}>
            <DownloadIcon />
          </button>

          <div className="w-[0.3vmax]" />

          <button onClick={() => onDelete(id)}>
            <RemoveIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InformDocument;
