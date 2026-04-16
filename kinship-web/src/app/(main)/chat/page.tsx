"use client";

import React from "react";
import { useAtom } from "jotai";
import ChatAgentSelector from "../components/Chat/ChatAgentSelector";
import ChatInteractionContainer from "../components/Chat/ChatInteractionContainer";
import MessageBanner from "../components/common/MessageBanner";
import useWallet from "@/utils/wallet";
import useWsConnection from "@/app/(main)/lib/useWsConnection";
import { isAuth } from "@/app/(main)/store";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import { chatsStore, selectedChatStore } from "@/app/(main)/store/chat";

export default function OPOS() {
  const [_, setChats] = useAtom(chatsStore);
  const [isUserAuth] = useAtom(isAuth);
  const [selectedChat] = useAtom(selectedChatStore);
  const wallet = useWallet();

  const socket = useWsConnection({ isAuth: isUserAuth });
  const [showMessage, setShowMessage] = React.useState<boolean>(false);

  const [hasAllowed, setHasAllowed] = React.useState<boolean>(false);
  const [speak, setSpeak] = React.useState(false);
  const [membershipStatus, setMembershipStatus] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [selectedModel, setSelectedModel] = React.useState(
    selectedChat?.chatAgent?.defaultmodel || "gpt-5.2"
  );
  const [selectedVoice, setSelectedVoice] = React.useState("nova");

  const checkUsage = async () => {
    console.log("membershipStatus", membershipStatus);
    if (membershipStatus !== "active") {
      try {
        const result = await internalClient.get("/api/check-usage", {
          params: {
            wallet: wallet?.publicKey.toBase58(),
            agentId: "",
            role: "guest",
          },
        });
        setShowMessage(!result.data.allowed);
        setHasAllowed(result.data.allowed);
        setIsLoading(false);
      } catch (error) {
        setShowMessage(true);
        setHasAllowed(false);
        setIsLoading(false);
      }
    } else {
      setShowMessage(false);
      setHasAllowed(true);
      setIsLoading(false);
    }
  };
  const checkMembershipStatus = async () => {
    const token = localStorage.getItem("token") || "";
    const membershipInfo = await internalClient.get(
      "/api/membership/has-membership?wallet=" + wallet!.publicKey.toBase58(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    setMembershipStatus(membershipInfo.data);
  };

  React.useEffect(() => {
    if (membershipStatus.length > 0) {
      checkUsage();
    }
  }, [membershipStatus]);
  React.useEffect(() => {
    if (wallet) {
      checkMembershipStatus();
    }
  }, [wallet]);

  React.useEffect(() => {
    if (socket) {
      socket!.onmessage = (event) => {
        const message = event.data;

        if (message === "connected") return;

        const data = JSON.parse(message);

        if (["aiMessage", "userMessage", "message"].includes(data.event)) {
          const message = data.data;

          setChats((prev) => {
            const newChats = [...prev];

            const currentChatIdx = newChats.findIndex(
              (e) =>
                e.chatAgent?.id === message.agent_id || e.id === message.chat_id
            );

            const messages = newChats[currentChatIdx].messages;

            if (!messages) {
              newChats[currentChatIdx].messages = [message];
              newChats[currentChatIdx].lastMessage = message;
              return newChats;
            }

            if (messages.length === 0) {
              newChats[currentChatIdx].messages = [message];
              newChats[currentChatIdx].lastMessage = message;
              return newChats;
            }

            if (
              messages[messages.length - 1].type === "bot" &&
              message.type === "bot"
            ) {
              messages[messages.length - 1].content += message.content;
              if (newChats[currentChatIdx].lastMessage?.id) {
                newChats[currentChatIdx].lastMessage!.content +=
                  message.content;
              } else {
                newChats[currentChatIdx].lastMessage = message;
              }
              messages[messages.length - 1].is_loading = false;
            } else {
              newChats[currentChatIdx].messages.push(message);
              newChats[currentChatIdx].lastMessage = message;
            }

            return newChats;
          });

          const objDiv = document.getElementById("message-container");
          if (objDiv) {
            setTimeout(function () {
              objDiv.scrollTo({
                top: -objDiv.offsetTop,
              });
            }, 100);
          }
        }
      };
    }
  }, [socket]);
  //   React.useEffect(() => {
  //   console.log("=================================", speak);
  // }, [speak])
  //

  React.useEffect(() => {
    setSelectedModel(selectedChat?.chatAgent?.defaultmodel || "gpt-5.2");
  }, [selectedChat?.chatAgent?.id]);

  return (
    <>
      {showMessage && (
        <div>
          <MessageBanner
            type="warn"
            message="Daily usage limit ($0.20) reached. Access temporarily disabled."
          />
        </div>
      )}
      <div className="background-content flex w-full justify-center overflow-y-hidden ">
        <ChatAgentSelector isLoading={isLoading} />

        <ChatInteractionContainer
          setShowMessage={setShowMessage}
          hasAllowed={true}
          checkUsage={() => checkUsage()}
          speak={speak}
          setSpeak={(value: string, from: string) => {
            console.log("FUNCTION CALLED ", value, from);
            localStorage.setItem("isSpeek", JSON.stringify({ isSpeek: value }));
            // setSpeak(value)
          }}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          selectedVoice={selectedVoice}
          setSelectedVoice={setSelectedVoice}
        />
      </div>
    </>
  );
}
