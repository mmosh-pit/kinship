import React from "react";
import Image from "next/image";
import { useAtom } from "jotai";

import { CandidateInfo } from "@/app/(main)/models/candidateInfo";
import { AIChatMessage } from "@/app/(main)/models/AIChatMessage";
import { data } from "@/app/(main)/store";
import Markdown from "react-markdown";
import { Bars } from "react-loader-spinner";

type Props = {
  candidateInfo: CandidateInfo;
  symbols: string[];
};

const AIChat = ({ symbols }: Props) => {
  const [currentUser] = useAtom(data);

  const [messages, setMessages] = React.useState<AIChatMessage[]>([]);
  // const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  const [isDisabled, setIsDisabled] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const [currentText, setCurrentText] = React.useState("");

  const messagesRef = React.useRef<HTMLDivElement>(null);

  const getMessageImage = React.useCallback(
    (message: AIChatMessage) => {
      if (message.type === "user") {
        if (!currentUser) {
          return "https://storage.googleapis.com/mmosh-assets/v_avatar.png";
        }

        return currentUser!.profile.image;
      }

      if ((message.index || 0) % 2 === 0) {
        return "https://storage.googleapis.com/mmosh-assets/uncle-psy.png";
      }

      return "https://storage.googleapis.com/mmosh-assets/aunt-bea.png";
    },
    [currentUser],
  );

  const sendMessage = React.useCallback(
    async (e: any) => {
      e.preventDefault();
      try {
        setIsDisabled(true);
        setIsLoading(true);
        setMessages([
          ...messages,
          {
            type: "user",
            message: currentText,
          },
        ]);
        setCurrentText("");

        const response = await fetch(
          "https://mmoshapi-uodcouqmia-uc.a.run.app/generate_stream/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              username: currentUser?.profile.username ?? "Visitor",
              prompt: currentText,
              namespaces: symbols,
              // metafield: JSON.stringify({
              //   ...candidateInfo.candidate,
              // }),
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let messageContent = "";

        const existingMessages = [
          ...messages,
          {
            type: "user",
            message: currentText,
          },
        ];

        setIsLoading(false);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          messageContent += chunk;

          setMessages([
            ...existingMessages,
            { type: "bot", message: messageContent },
          ]);

          if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }
        }
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setIsDisabled(false);
      }
    },
    [currentText, currentUser, messages],
  );

  return (
    <div className="w-full h-full flex flex-col justify-between">
      <div className="w-full flex flex-col py-8 px-6" ref={messagesRef}>
        {messages.map((message, index) => (
          <div
            className="w-full flex items-start justify-start my-2 rounded-lg"
            key={`${message.type}-${index}`}
          >
            <div className="relative w-[2vmax] h-[2vmax]">
              <Image
                layout="fill"
                src={getMessageImage(message)}
                alt="image"
                className="rounded-full"
              />
            </div>

            <div className="w-full justify-between ml-4 flex bg-[#04024185] py-4 px-6 rounded-lg">
              <Markdown children={message.message} />

              {/*<button
                className="cursor-pointer"
                onClick={() => {
                  setEditingIndex(index);
                  setCurrentText(message.message);
                }}
              >
                <EditIcon />
              </button>*/}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="w-full flex items-center justify-start my-1 rounded-lg">
            <div className="relative w-[2vmax] h-[2vmax]">
              <Image
                layout="fill"
                src={getMessageImage({
                  type: "bot",
                  message: "",
                })}
                alt="image"
                className="rounded-full"
              />
            </div>

            <div className="w-full justify-between ml-4 flex flex-col py-2 px-6 rounded-lg">
              <Bars
                height="60"
                width="60"
                color="rgba(255, 0, 199, 1)"
                ariaLabel="bars-loading"
                wrapperStyle={{}}
                wrapperClass="bars-loading"
                visible={true}
              />
            </div>
          </div>
        )}
      </div>

      <form
        className="w-full flex items-stretch justify-around mt-4"
        onSubmit={sendMessage}
      >
        <input
          type="text"
          value={currentText}
          disabled={isDisabled}
          onChange={(e) => setCurrentText(e.target.value)}
          placeholder="Send a Message"
          className="w-[80%] input input-bordered border-[#E2E8F0] rounded-full h-10 text-base text-white bg-[#DEE4ED08] placeholder-white placeholder-opacity-[0.8] backdrop-container"
        />

        <button type="submit" className="px-12 rounded-full bg-[#3C00FF]">
          {isDisabled ? (
            <span className="loading loading-spinner w-[1.5vmax] h-[1.5vmax] loading-lg bg-[#7B30DB]"></span>
          ) : (
            <p className="text-base text-white">Submit</p>
          )}
        </button>
      </form>
    </div>
  );
};

export default AIChat;
