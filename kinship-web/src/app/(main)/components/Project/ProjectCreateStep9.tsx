"use client";

import FilePicker from "../FilePicker";
import { init, uploadFile } from "@/app/(main)/lib/firebase";
import ArrowUpHome from "@/assets/icons/ArrowUpHome";
import axios from "axios";
import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import AssetItem from "./AssetItem";
import internalClient from "@/app/(main)/lib/internalHttpClient";

export default function ProjectCreateStep9({ symbol }: { symbol: any }) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<
    {
      preview: string;
      type: string;
      name: string;
      isPrivate: boolean;
      saved: boolean;
      id: string;
    }[]
  >([]);
  const [projectDetail, setProjectDetail] = React.useState<any>(null);
  const [text, setText] = React.useState("");

  const [showMsg, setShowMsg] = useState(false);
  const [msgClass, setMsgClass] = useState("");
  const [msgText, setMsgText] = useState("");

  const getProjectMedia = React.useCallback(async () => {
    if (!projectDetail) return;

    const result = await axios.get(
      `/api/project/get-media?project=${projectDetail.project.key}`,
    );

    const files = [];

    for (const item of result.data) {
      files.push({
        preview: item.media.preview,
        type: item.media.type,
        name: item.media.name,
        isPrivate: item.media.isPrivate,
        id: item.media.id,
        saved: true,
      });
    }

    setFiles(files);
  }, [projectDetail]);

  const uploadAction = React.useCallback(
    (fileUri: string, fileType: string, fileName: string) => {
      setFiles((prev) => {
        const newFile = {
          preview: fileUri,
          type: fileType,
          name: fileName,
          isPrivate: false,
          saved: false,
          id: uuidv4(),
        };

        const newFiles = [...prev];
        newFiles.push(newFile);

        return newFiles;
      });
    },
    [],
  );

  const removeFileAction = React.useCallback(
    async (deletedIndex: number) => {
      const id = files[deletedIndex].id;

      const newFiles = [];
      for (let index = 0; index < files.length; index++) {
        if (deletedIndex === index) {
          continue;
        }
        const element = files[index];
        newFiles.push(element);
      }

      setFiles(newFiles);
      await internalClient.delete(
        `/api/project/delete-media?project=${projectDetail.project.key}&id=${id}`,
      );
      await removeFileByMetadata(id);
    },
    [files, projectDetail],
  );

  const removeFileByMetadata = React.useCallback(
    async (id: string) => {
      const projectKey = projectDetail?.project.key;

      const metadata = `${projectKey}-${id}`;

      await internalClient.delete(
        `https://ai-files.kinship.systems/delete_by_metadata?metadata=${encodeURIComponent(metadata)}`,
      );
    },
    [projectDetail],
  );

  const onChangePrivacy = React.useCallback(
    async (isPrivate: boolean, documentIndex: number) => {
      const projectKey = projectDetail?.project.key;

      setFiles((files: any) => {
        const newFiles = [...files];

        newFiles[documentIndex].isPrivate = isPrivate;

        return newFiles;
      });

      const file = files[documentIndex];

      if (file.saved) {
        const preview = file.preview;
        const id = file.id;

        await removeFileByMetadata(id);

        const metadata = `${projectKey}-${id}`;

        const formData = new FormData();
        formData.append("name", isPrivate ? projectKey : "PUBLIC");
        formData.append("urls", preview);
        formData.append("metadata", metadata);
        formData.append("text", "None");

        await axios.post(
          "https://ai-files.kinship.systems/upload",
          formData,
        );

        await internalClient.put("/api/project/update-media-privacy", {
          projectkey: projectKey,
          file: {
            id,
            isPrivate,
          },
        });
      }
    },
    [projectDetail, files],
  );

  const submitFiles = React.useCallback(async () => {
    if (!projectDetail) return;

    setLoading(true);
    const fileList = [];

    for (let index = 0; index < files.length; index++) {
      const fields = files[index];
      if (fields.saved) continue;

      if (!isValidHttpUrl(fields.preview)) {
        const file = await fetch(fields.preview)
          .then((r) => r.blob())
          .then(
            (blobFile) => new File([blobFile], uuidv4(), { type: fields.type }),
          );
        fields.preview = await uploadFile(file, file.name, "bot");
      }
      fields.isPrivate = false;
      fields.saved = true;
      fileList.push(fields);
    }

    const projectKey = projectDetail?.project.key;

    for (const field of fileList) {
      const formData = new FormData();
      formData.append("name", field.isPrivate ? projectKey : "PUBLIC");
      formData.append("urls", field.preview);

      formData.append("text", "None");

      const metadata = `${projectKey}-${field.id}`;

      formData.append("metadata", metadata);

      await axios.post(
        "https://ai-files.kinship.systems/upload",
        formData,
      );
    }

    if (fileList.length > 0) {
      await internalClient.post("/api/project/save-media", {
        files: fileList,
        projectkey: projectDetail.project.key,
      });
      createMessage("Media uploaded successfully", "success-container");
    }

    setLoading(false);
  }, [files, projectDetail]);

  const sendToAI = React.useCallback(async () => {
    if (!projectDetail) return;
    setLoading(true);

    const formData = new FormData();

    const projectKey = projectDetail?.project.key;

    formData.append("name", projectKey);
    formData.append("urls", "None");

    formData.append("text", text);

    const id = uuidv4();

    const metadata = `${projectKey}-${id}`;

    formData.append("metadata", metadata);

    await axios.post(
      "https://ai-files.kinship.systems/upload",
      formData,
    );

    const data = {
      preview: text,
      name: "",
      type: "text",
      isPrivate: false,
      saved: true,
      id,
    };

    await internalClient.post("/api/project/save-media", {
      files: [data],
      projectkey: projectDetail.project.key,
    });

    setFiles((prev) => {
      const result = [...prev, data];

      return result;
    });
    setLoading(false);
    createMessage("Text uploaded successfully", "success-container");
  }, [text, projectDetail]);

  const isValidHttpUrl = (url: any) => {
    try {
      const newUrl = new URL(url);
      return newUrl.protocol === "http:" || newUrl.protocol === "https:";
    } catch (err) {
      return false;
    }
  };

  React.useEffect(() => {
    init();
    getProjectDetailFromAPI();
  }, [symbol]);

  React.useEffect(() => {
    getProjectMedia();
  }, [projectDetail]);

  const getProjectDetailFromAPI = React.useCallback(async () => {
    try {
      setLoading(true);
      let listResult = await axios.get(`/api/project/detail?symbol=${symbol}`);
      setProjectDetail(listResult.data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setProjectDetail(null);
    }
  }, [symbol]);

  const createMessage = React.useCallback((message: any, type: any) => {
    window.scrollTo(0, 0);
    setMsgText(message);
    setMsgClass(type);
    setShowMsg(true);
    setLoading(false);
    if (type == "success-container") {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    } else {
      setTimeout(() => {
        setShowMsg(false);
      }, 4000);
    }
  }, []);

  return (
    <>
      {showMsg && (
        <div
          className={
            "message-container text-white text-center text-header-small-font-size py-5 px-3.5 " +
            msgClass
          }
        >
          {msgText}
        </div>
      )}
      <div className="background-content flex flex-col items-center">
        <div className="flex flex-col items-center justify-center w-full">
          <div className="relative w-full flex flex-col justify-center items-center pt-5">
            <div className="max-w-md">
              <p className="text-para-font-size light-gray-color text-center para-line-height pt-2.5 text-light-gray leading-4">
                Inform your agent about the topic. Add as many documents as you
                like. Your Agent will reference these materials in all
                conversations and when taking actions on your behalf. Please
                allow three to five minutes for your agent to process the
                uploaded materials and make them available in the chat.
              </p>
            </div>
          </div>
        </div>
        {files.length === 0 ? (
          <div className="self-center md:w-[75%] w-[90%] mt-4">
            <FilePicker
              multiple
              file={""}
              isButton={false}
              changeFile={(file: any) => {
                const objectUrl = URL.createObjectURL(file);
                uploadAction(objectUrl, file.type, file.name);
              }}
            />
          </div>
        ) : (
          <div className="py-5 px-5 xl:px-32 lg:px-16 md:px-8">
            <div className="grid grid-cols-12">
              <div className="col-span-12 xl:col-start-4 xl:col-span-6 lg:col-start-4 lg:col-span-6">
                <div className="backdrop-container rounded-xl p-5 border border-white border-opacity-20 mb-10 ">
                  <div className="grid grid-cols-3 gap-4 overflow-y-auto">
                    <>
                      {files.map((fileItem, i: number) => (
                        <AssetItem
                          key={i}
                          index={i}
                          file={fileItem}
                          removeFile={removeFileAction}
                          onChangePrivacy={onChangePrivacy}
                        />
                      ))}
                    </>
                    <div className="grid-item">
                      <FilePicker
                        multiple
                        file={""}
                        isButton={true}
                        changeFile={(file: any) => {
                          const objectUrl = URL.createObjectURL(file);
                          uploadAction(objectUrl, file.type, file.name);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-center mt-10">
              {!loading && (
                <button
                  className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white"
                  onClick={submitFiles}
                >
                  Submit
                </button>
              )}
              {loading && (
                <button className="btn btn-primary ml-10 bg-primary text-white border-none hover:bg-primary hover:text-white">
                  Loading...
                </button>
              )}
            </div>
          </div>
        )}

        <div className="w-full md:w-[80%] pb-4 px-12 mt-8">
          <form
            className="w-full flex justify-between p-2 bg-[#BBBBBB21] border-[1px] border-[#06052D] rounded-lg"
            onSubmit={(e) => {
              e.preventDefault();
              sendToAI();
            }}
          >
            <textarea
              className="home-ai-textfield w-full mr-4 px-2"
              placeholder="Ask Uncle Psy and Aunt Bea"
              rows={2}
              wrap="hard"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
            />

            <button
              className={`p-3 rounded-lg ${!text ? "bg-[#565656]" : "bg-[#FFF]"}`}
              disabled={!text || loading}
              type="submit"
            >
              <ArrowUpHome />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
