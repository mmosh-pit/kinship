import React from "react";
import Image from "next/image";

import { BagsCoin, BagsNFT } from "@/app/(main)/store/bags";
import axios from "axios";
import InformDocument from "./InformDocument";
import { AIDocument } from "@/app/(main)/models/AIDocument";
import { uploadFile } from "@/app/(main)/lib/firebase";
import internalClient from "@/app/(main)/lib/internalHttpClient";

type Props = {
  asset: BagsNFT | BagsCoin;
  isCoin?: boolean;
  isProject?: boolean;
  isCommunity?: boolean;
};

const AssetCard = ({
  asset,
  isCoin = false,
  isProject = false,
  isCommunity = false,
}: Props) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = React.useState<AIDocument[]>([]);

  const [isLoading, setIsLoading] = React.useState(false);

  const handleChangeInput = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      if (!event.target.files.item(0)) return;

      setIsLoading(true);

      const name = `${asset.symbol}-${new Date().getUTCMilliseconds()}`;

      const url = await uploadFile(
        event.target.files.item(0)!,
        name,
        "inform_documents",
      );

      const formData = new FormData();
      formData.append(
        "name",
        isCoin
          ? "PUBLIC"
          : isProject || isCommunity
            ? asset.parentKey!
            : "PRIVATE",
      );
      formData.append("urls", url);
      formData.append(
        "metadata",
        JSON.stringify({
          name: asset.name,
          address: asset.tokenAddress,
          url,
        }),
      );

      await axios.post(
        "https://mmoshapi-uodcouqmia-uc.a.run.app/upload",
        formData,
      );

      const res = await internalClient.post("/api/inform-document", {
        name: event.target.files.item(0)!.name,
        url: url,
        isPrivate: true,
        tokenAddress: asset.tokenAddress,
        namespace: isCoin ? "PUBLIC" : "PRIVATE",
      });

      setIsLoading(false);
      setDocuments([
        ...documents,
        {
          url,
          tokenAddress: asset.tokenAddress,
          namespace: asset.symbol,
          name: event.target.files.item(0)!.name,
          id: res.data,
          isPrivate: true,
        },
      ]);
    },
    // eslint-disable-next-line
    [documents, asset],
  );

  const triggerClick = React.useCallback(() => {
    if (!inputRef.current) return;

    inputRef.current.click();
  }, []);

  const fetchDocuments = React.useCallback(async () => {
    const response = await axios.get(
      `/api/get-documents-by-asset?address=${asset.tokenAddress}`,
    );

    setDocuments(
      response.data.map((val: any) => ({ ...val, id: val._id.toString() })),
    );
  }, [asset]);

  const onDeleteDocument = React.useCallback(async (id: string) => {
    setDocuments((prev) => {
      const newDocs = [...prev.filter((e) => e.id !== id)];

      return newDocs;
    });

    await internalClient.delete(`/api/delete-document?id=${id}`);
  }, []);

  React.useEffect(() => {
    fetchDocuments();
  }, [asset]);

  return (
    <>
      <input
        type="file"
        className="hidden"
        ref={inputRef}
        onChange={handleChangeInput}
      />
      <div className="w-full flex p-[2px] border-[1px] border-[#353485] bg-[#09073A] rounded-lg">
        <div className="px-2 relative md:w-[12vmax] xl:w-[10vmax] h-[8vmax]">
          <Image
            src={asset.image}
            alt={asset.name}
            layout="fill"
            className="rounded-lg"
          />
        </div>

        <div className="w-full flex flex-col px-2 py-4">
          <div className="w-full flex justify-between">
            <div className="flex flex-col">
              <p className="text-base text-white font-semibold">{asset.name}</p>
              <p className="text-xs">{asset.symbol.toUpperCase()}</p>
            </div>

            <button
              className="border-[0.5px] border-[#9F9F9F38] bg-[#003489] rounded-full px-2"
              onClick={triggerClick}
            >
              {isLoading ? (
                <span className="loading loading-spinner w-[1vmax] h-[1vmax] loading-lg bg-[#CD068E]"></span>
              ) : (
                <p className="text-sm text-white font-semibold">Add Media</p>
              )}
            </button>
          </div>

          <div className="h-[5vh] overflow-y-auto">
            {documents.map((doc) => (
              <InformDocument
                aiDocument={doc}
                onDelete={onDeleteDocument}
                isCoin={isCoin}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default AssetCard;
