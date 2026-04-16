import React from "react";
import { useAtom } from "jotai";

import { data } from "@/app/(main)/store";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ArrowUpHome from "@/assets/icons/ArrowUpHome";
import {
  selectedChatStore,
  chatsStore,
  chatsLoading,
} from "@/app/(main)/store/chat";
import { Message } from "@/app/(main)/models/chat";
import { Bars } from "react-loader-spinner";
import Avatar from "../common/Avatar";
import { useRouter } from "next/navigation";
import VoiceIcon from "@/assets/icons/VoiceIcon";
import useVoiceSession from "@/lib/useVoiceSession";
import AudioInteraction from "./AudioInteraction";
import DisambiguationModal from "./DisambiguationModal";
import {
  DisambiguationResponse,
  SelectedRecipients,
} from "@/app/(main)/types/disambiguation";
import internalClient from "@/app/(main)/lib/internalHttpClient";
import useWallet from "@/utils/wallet";
import Select from "../common/Select";
import VoiceAssistant from "./VoiceAssistant";

const ChatInteractionContainer = (props: any) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const chatBaseUrl = "https://ai.kinship.today/"; // "https://react-mcp-auth-api-1094217356440.us-central1.run.app"

  const {
    // isSessionActive,
    startSession,
    isSpeaking,
    stopSession,
    isLoadingSession,
  } = useVoiceSession();

  const [currentUser] = useAtom(data);
  const [chats, setChats] = useAtom(chatsStore);
  const [selectedChat, setSelectedChat] = useAtom(selectedChatStore);
  const [areChatsLoading] = useAtom(chatsLoading);

  const [text, setText] = React.useState("");
  const [disambiguationData, setDisambiguationData] =
    React.useState<DisambiguationResponse | null>(null);
  const [pendingMessage, setPendingMessage] = React.useState<string | null>(
    null,
  );

  const [isSessionActive, setIsSessionActive] = React.useState<boolean>(false);

  const messages = selectedChat?.messages;

  const handleDisambiguationSelect = async (selected: SelectedRecipients) => {
    if (!pendingMessage || !selectedChat) return;

    // Add a loading message while we process the selection
    const loadingMessage: Message = {
      id: Date.now().toString(),
      content: "",
      sender_id: selectedChat.chatAgent!.id,
      type: "bot",
      created_at: new Date().toISOString(),
      sender: selectedChat.chatAgent!.name,
      is_loading: true,
    };

    const updatedMessages = [...selectedChat.messages, loadingMessage];
    const updatedSelectedChat = {
      ...selectedChat,
      messages: updatedMessages,
    };
    setSelectedChat(updatedSelectedChat);

    try {
      // Call the confirm-send endpoint with selected recipients
      const response = await fetch(`${chatBaseUrl}react/confirm-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${window.localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          recipient_wallets: Object.values(selected).flatMap((recipients) =>
            recipients.map((r) => r.wallet),
          ),
          message: pendingMessage,
          agentId: selectedChat.chatAgent!.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to confirm recipients");
      }

      // Continue with the chat flow using the confirmed recipients
      const result = await response.json();
      // Handle the response - you might want to add it to the chat
      if (result.content) {
        // // Add a bot message for each recipient with their formatted message
        // const detailMessages = Object.entries(result.details).map(([wallet, detail]) => {
        //   const d = detail as { formatted: string };
        //   return {
        //     id: `${Date.now()}-${wallet}`,
        //     content: d.formatted,
        //     sender_id: selectedChat!.chatAgent!.id,
        //     type: "bot",
        //     created_at: new Date().toISOString(),
        //     sender: selectedChat!.chatAgent!.name,
        //     is_loading: false,
        //   };
        // });
        let botMessage: Message = {
          id: Date.now().toString(),
          content: result.content,
          sender_id: selectedChat!.chatAgent!.id,
          type: "bot",
          created_at: new Date().toISOString(),
          sender: selectedChat!.chatAgent!.name,
          is_loading: false,
        };

        const updatedMessages = [...selectedChat!.messages, ...[botMessage]];
        const updatedSelectedChat = {
          ...selectedChat!,
          messages: updatedMessages,
        };

        setSelectedChat(updatedSelectedChat);

        const updatedChats = chats.map((chat) =>
          chat.id === selectedChat!.id ? updatedSelectedChat : chat,
        );
        setChats(updatedChats);
        // Save the chat conversation to the database
        try {
          const saveChatData = {
            chatId: selectedChat.id,
            agentID: selectedChat.chatAgent!.id,
            namespaces: [selectedChat.chatAgent!.key, "PUBLIC"],
            systemPrompt: selectedChat.chatAgent!.system_prompt,
            userContent: "",
            botContent: result.content,
          };

          console.log("Saving chat to database:", saveChatData);

          const saveResponse = await fetch(`${chatBaseUrl}save-chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${window.localStorage.getItem("token")}`,
            },
            body: JSON.stringify(saveChatData),
          });

          if (!saveResponse.ok) {
            console.warn(
              `Failed to save chat: ${saveResponse.status} ${saveResponse.statusText}`,
            );
          } else {
            console.log("Chat saved successfully to database");
          }
        } catch (saveError) {
          console.error("Error saving chat to database:", saveError);
          // Note: We don't want to show this error to the user as the main functionality (chat) worked
        }
        handleDisambiguationCancel();
      }
    } catch (error) {
      console.error("Error confirming recipients:", error);
      // Handle error - you might want to show an error message in the chat
    }
  };

  const handleDisambiguationCancel = () => {
    setDisambiguationData(null);
    setPendingMessage(null);
  };

  const getMessageImage = React.useCallback(
    (message: Message) => {
      if (message.type === "user") {
        if (!currentUser) {
          return "https://storage.googleapis.com/mmosh-assets/v_avatar.png";
        }

        if (!currentUser!.profile) {
          return currentUser!.guest_data.picture;
        }

        return currentUser!.profile?.image;
      }

      if (message.type === "bot") {
        return selectedChat!.chatAgent!.image;
      }

      return "https://storage.googleapis.com/mmosh-assets/aunt-bea.png";
    },
    [currentUser, selectedChat],
  );

  const getMessageUsername = React.useCallback(
    (message: Message) => {
      if (message.type === "user") {
        if (!currentUser) {
          return "Guest";
        }

        if (!currentUser!.profile) {
          return currentUser!.guest_data.name;
        }

        return currentUser!.profile?.username;
      }

      return selectedChat?.chatAgent?.name;
    },
    [currentUser, selectedChat],
  );

  const formatChatHistory = (messages: Message[]) => {
    // Get the last N messages (excluding the current loading message)
    const historyLimit = 20; // Adjust this number based on your needs
    const relevantMessages = messages
      .filter((msg) => !msg.is_loading) // Exclude loading messages
      .slice(-historyLimit) // Get last N messages
      .map((msg) => ({
        role: msg.type === "user" ? "user" : "assistant",
        content: msg.content,
        timestamp: msg.created_at,
      }));
    return relevantMessages;
  };

  const sendMessage = React.useCallback(
    async (content: string) => {
      if (!selectedChat?.messages || !props.hasAllowed) return;

      // Add user message to the chat immediately
      const userMessage: Message = {
        id: Date.now().toString(),
        content,
        sender_id: currentUser?.profile?.username || "user",
        type: "user",
        created_at: new Date().toISOString(),
        sender: currentUser?.profile?.username || "user",
        is_loading: false,
      };

      // Add loading bot message
      const loadingBotMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "",
        sender_id: selectedChat.chatAgent!.id,
        type: "bot",
        created_at: new Date().toISOString(),
        sender: selectedChat.chatAgent!.name,
        is_loading: true,
      };

      // Update the selected chat with new messages
      const updatedSelectedChat = {
        ...selectedChat,
        messages: [...selectedChat.messages, userMessage, loadingBotMessage],
      };

      setSelectedChat(updatedSelectedChat);

      // Update the chats array
      const updatedChats = chats.map((chat) =>
        chat.id === selectedChat.id ? updatedSelectedChat : chat,
      );
      setChats(updatedChats);

      setText("");
      const chatHistory = formatChatHistory(selectedChat.messages);

      //console.log(chatHistory)

      // const systemPrompt = JSON.parse(selectedChat!.chatAgent!.system_prompt || "{}");
      // systemPrompt[systemPrompt.length] = {
      //   agentId: selectedChat.chatAgent!.key,
      //   authorization: localStorage.getItem("token")
      // };
      const systemPrompt =
        selectedChat!.chatAgent!.system_prompt +
        `agentId: ${selectedChat.chatAgent!.key}, authorization: ${localStorage.getItem("token")}`;

      try {
        const queryData = {
          instructions: systemPrompt,
          agentId: selectedChat.chatAgent?.key,
          bot_id: selectedChat.chatAgent!.id,
          aiModel: props.selectedModel || "gpt-5.2",
          namespaces: [selectedChat!.chatAgent!.key, "PUBLIC"],
          query: content,
        };

        console.log("Message data being sent:", queryData);

        const response = await fetch(`${chatBaseUrl}react/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${window.localStorage.getItem("token")}`,
          },
          body: JSON.stringify(queryData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";

        // Create the streaming bot message that will be updated
        let streamingBotMessage: Message = {
          id: (Date.now() + 2).toString(),
          content: "",
          sender_id: selectedChat.chatAgent!.id,
          type: "bot",
          created_at: new Date().toISOString(),
          sender: selectedChat.chatAgent!.name,
          is_loading: false,
        };

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  console.log("SSE data received:", data);

                  if (data.type === "disambiguation") {
                    console.log("Received disambiguation data:", data);
                    // Store disambiguation data and pending message
                    setDisambiguationData(data);
                    setPendingMessage(content);

                    // Remove the loading message since we're showing the disambiguation modal
                    const currentMessages = [...updatedSelectedChat.messages];
                    currentMessages.pop(); // Remove the loading message
                    const disambiguationSelectedChat = {
                      ...updatedSelectedChat,
                      messages: currentMessages,
                    };
                    setSelectedChat(disambiguationSelectedChat);

                    // Update chats array
                    const disambiguationChats = chats.map((chat) =>
                      chat.id === selectedChat.id
                        ? disambiguationSelectedChat
                        : chat,
                    );
                    setChats(disambiguationChats);

                    // return;
                  } else if (data.type === "chunk") {
                    accumulatedContent += data.content;

                    // Update the streaming message with accumulated content
                    streamingBotMessage = {
                      ...streamingBotMessage,
                      content: accumulatedContent,
                    };

                    // Replace the loading message with streaming content
                    const currentMessages = [...updatedSelectedChat.messages];
                    currentMessages[currentMessages.length - 1] =
                      streamingBotMessage;

                    const streamingSelectedChat = {
                      ...updatedSelectedChat,
                      messages: currentMessages,
                    };

                    setSelectedChat(streamingSelectedChat);

                    // Update the chats array
                    const streamingChats = chats.map((chat) =>
                      chat.id === selectedChat.id
                        ? streamingSelectedChat
                        : chat,
                    );
                    setChats(streamingChats);
                  } else if (data.type === "complete") {
                    // Streaming is complete, finalize the message
                    const finalBotMessage: Message = {
                      ...streamingBotMessage,
                      content: accumulatedContent,
                    };

                    // Replace the loading message with the final response
                    const finalMessages = [...updatedSelectedChat.messages];
                    finalMessages[finalMessages.length - 1] = finalBotMessage;

                    const finalSelectedChat = {
                      ...updatedSelectedChat,
                      messages: finalMessages,
                    };

                    setSelectedChat(finalSelectedChat);

                    // Update the chats array
                    const finalChats = chats.map((chat) =>
                      chat.id === selectedChat.id ? finalSelectedChat : chat,
                    );
                    setChats(finalChats);

                    // Save the chat conversation to the database
                    try {
                      const saveChatData = {
                        chatId: selectedChat.id,
                        agentID: selectedChat.chatAgent!.id,
                        namespaces: [selectedChat.chatAgent!.key, "PUBLIC"],
                        systemPrompt: selectedChat.chatAgent!.system_prompt,
                        userContent: content,
                        botContent: accumulatedContent,
                      };

                      console.log("Saving chat to database:", saveChatData);

                      const saveResponse = await fetch(
                        `${chatBaseUrl}save-chat`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${window.localStorage.getItem("token")}`,
                          },
                          body: JSON.stringify(saveChatData),
                        },
                      );
                      await props.checkUsage();

                      if (!saveResponse.ok) {
                        console.warn(
                          `Failed to save chat: ${saveResponse.status} ${saveResponse.statusText}`,
                        );
                      } else {
                        console.log("Chat saved successfully to database");
                      }
                    } catch (saveError) {
                      console.error(
                        "Error saving chat to database:",
                        saveError,
                      );
                      // Note: We don't want to show this error to the user as the main functionality (chat) worked
                    }

                    break;
                  }
                } catch (parseError) {
                  console.error("Error parsing SSE data:", parseError);
                  // Continue processing other lines
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        console.error("Error sending message:", error);

        // Create error message
        const errorMessage: Message = {
          id: (Date.now() + 2).toString(),
          content:
            "Sorry, I encountered an error while processing your message. Please try again.",
          sender_id: selectedChat.chatAgent!.id,
          type: "bot",
          created_at: new Date().toISOString(),
          sender: selectedChat.chatAgent!.name,
          is_loading: false,
        };

        // Replace the loading message with error message
        const finalMessages = [...updatedSelectedChat.messages];
        finalMessages[finalMessages.length - 1] = errorMessage;

        const finalSelectedChat = {
          ...updatedSelectedChat,
          messages: finalMessages,
        };

        setSelectedChat(finalSelectedChat);

        // Update the chats array
        const finalChats = chats.map((chat) =>
          chat.id === selectedChat.id ? finalSelectedChat : chat,
        );
        setChats(finalChats);
      }
    },
    [
      selectedChat,
      currentUser,
      chats,
      setChats,
      setSelectedChat,
      props.selectedModel,
    ],
  );

  const handleEnter = (evt: any) => {
    if (evt.keyCode == 13 && !evt.shiftKey) {
      evt.preventDefault();
      if (text.trim()) {
        sendMessage(text);
      }
      return;
    }
  };

  const isLoading = messages
    ? messages.length > 0
      ? messages[selectedChat?.messages.length - 1].is_loading
      : false
    : false;

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    const objDiv = document.getElementById("message-container");
    if (objDiv) {
      setTimeout(() => {
        objDiv.scrollTop = objDiv.scrollHeight;
      }, 100);
    }
  }, [selectedChat?.messages]);

  // Auto-scroll to bottom when chat loads
  React.useEffect(() => {
    const objDiv = document.getElementById("message-container");
    if (objDiv) {
      objDiv.scrollTop = objDiv.scrollHeight;
    }
  }, [selectedChat?.id]);

  if (isSessionActive || isLoadingSession)
    return (
      <VoiceAssistant
        setIsSessionActive={setIsSessionActive}
        isSessionActive={isSessionActive}
        selectedModel={props.selectedModel}
      />
      // <AudioInteraction
      //   isSpeaking={isSpeaking}
      //   stopSession={stopSession}
      //   isLoading={isLoadingSession}
      //   isProcessing={isProcessing}
      // />
    );

  return (
    <div className="w-[75%] h-[32rem] flex justify-center">
      {/* Disambiguation Modal */}
      {disambiguationData && (
        <DisambiguationModal
          data={disambiguationData}
          onSelect={handleDisambiguationSelect}
          onCancel={handleDisambiguationCancel}
        />
      )}
      {areChatsLoading ? (
        <div className="w-[90%] flex flex-col items-center justify-center m-5 bg-[#181747] backdrop-filter backdrop-blur-[6px] px-6 py-16 rounded-xl">
          <div className="text-center space-y-4">
            <Bars
              height="60"
              width="60"
              color="rgba(255, 0, 199, 1)"
              ariaLabel="bars-loading"
              wrapperStyle={{}}
              wrapperClass="bars-loading"
              visible={true}
            />
            <h3 className="text-xl text-white font-semibold">
              Loading chats...
            </h3>
            <p className="text-gray-400">
              Please wait while we load your conversations
            </p>
          </div>
        </div>
      ) : !selectedChat ? (
        <div className="w-[90%] h-[38rem] flex flex-col items-center justify-center m-5 bg-[#181747] backdrop-filter backdrop-blur-[6px] px-6 py-20 rounded-xl">
          <div className="text-center space-y-4">
            <div className="text-6xl mb-4">💬</div>
            <h3 className="text-xl text-white font-semibold">
              No chat selected
            </h3>
            <p className="text-gray-400">
              Choose a chat agent from the sidebar to start a conversation
            </p>
          </div>
        </div>
      ) : (
        <div className="w-[90%] flex flex-col rounded-xl mt-8 bg-[#181747] backdrop-filter backdrop-blur-[6px] h-[38rem] overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#FFFFFF1A] cursor-pointer">
            <div
              className="flex"
              onClick={() =>
                router.push(`/bots/${selectedChat.chatAgent?.symbol}`)
              }
            >
              <Avatar
                src={selectedChat.chatAgent?.image}
                alt={selectedChat.chatAgent?.name}
                size={48}
                className="mr-3"
              />
              <div>
                <h3 className="text-lg font-semibold text-white underline">
                  {selectedChat.chatAgent?.name}
                </h3>
                <p className="text-sm text-gray-400">
                  @{selectedChat.chatAgent?.symbol}
                </p>
              </div>
            </div>
            <div className="lg:col-start-2 xl:col-start-2">
              <Select
                value={props.selectedModel}
                onChange={(e) => {
                  props.setSelectedModel(e.target.value);
                }}
                options={[
                  { label: "ChatGPT 5.2", value: "gpt-5.2" },
                  { label: "ChatGPT 5.1", value: "gpt-5.1" },
                  { label: "ChatGPT 4.1", value: "gpt-4.1" },
                  { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
                  {
                    label: "Gemini 3 Pro",
                    value: "gemini-3-pro-preview",
                  },
                ]}
              />
            </div>
          </div>

          {/* Messages Container */}
          <div
            className="flex-1 flex flex-col overflow-y-auto px-6 py-4 space-y-4"
            id="message-container"
            style={{ scrollBehavior: "smooth" }}
          >
            {messages?.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="text-4xl mb-2">👋</div>
                  <p className="text-gray-400">
                    Start a conversation with {selectedChat.chatAgent?.name}!
                  </p>
                </div>
              </div>
            ) : (
              messages?.map(
                (message, index) =>
                  message.content && (
                    <div
                      className={`flex items-start gap-3 ${message.type === "user" ? "flex-row-reverse" : "flex-row"}`}
                      key={`${message.type}-${index}`}
                    >
                      <Avatar
                        src={getMessageImage(message)}
                        alt={getMessageUsername(message)}
                        size={40}
                        className="flex-shrink-0"
                      />

                      <div
                        className={`flex flex-col space-y-1 max-w-[70%] ${message.type === "user" ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-400 font-medium">
                            {getMessageUsername(message)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(message.created_at).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>

                        <div
                          className={`
                        px-4 py-3 rounded-2xl 
                        ${message.type === "user"
                              ? "bg-[#25235a] text-white rounded-tr-md"
                              : "bg-[#00073a] text-white rounded-tl-md"
                            }
                        ${message.is_loading ? "min-h-[60px] flex items-center justify-center" : ""}
                      `}
                        >
                          {message.is_loading ? (
                            <div className="flex items-center space-x-2">
                              <Bars
                                height="24"
                                width="24"
                                color="rgba(255, 0, 199, 1)"
                                ariaLabel="bars-loading"
                                wrapperStyle={{}}
                                wrapperClass="bars-loading"
                                visible={true}
                              />
                              <span className="text-sm text-gray-400">
                                Thinking...
                              </span>
                            </div>
                          ) : (
                            <div className="text-base leading-relaxed prose prose-invert max-w-none">
                              <Markdown remarkPlugins={[remarkGfm]}>
                                {message.type === "bot" &&
                                  message.content.includes("Thought:")
                                  ? message.content
                                    .replace(
                                      /Thought:/g,
                                      "\n\n> *Thought:*\n",
                                    )
                                    .replace(/Action:/g, "\n\n> *Action:*\n")
                                    .replace(
                                      /^((?!Thought:|Action:).+)/gm,
                                      (match) => {
                                        return match.startsWith(">")
                                          ? match
                                          : `**${match}**`;
                                      },
                                    )
                                    .trim()
                                  : message.content}
                              </Markdown>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ),
              )
            )}
          </div>

          {/* Input Area */}
          <div className="px-6 py-4 border-t border-[#FFFFFF1A]">
            <form
              className="flex items-center space-x-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) {
                  sendMessage(text);
                }
              }}
            >
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full px-4 py-3 pr-12 bg-[#00073a] border border-[#FFFFFF1A] rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4A4B6C] focus:border-transparent transition-all"
                  placeholder="Type your message..."
                  value={text}
                  onKeyDown={handleEnter}
                  onChange={(e) => {
                    setText(e.target.value);
                  }}
                  maxLength={1000}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
                  {text.length}/1000
                </div>
              </div>

              <button
                className="flex items-center justify-center bg-[#FFFFFF14] border-[1px] border-[#FFFFFF28] rounded-lg w-8 h-8"
                onClick={() => {
                  setIsSessionActive(!isSessionActive);
                  // if (!isSessionActive) {
                  //   startSession();
                  // }
                }}
                disabled={!props.hasAllowed}
              >
                <VoiceIcon />
              </button>

              <button
                className={`
                  flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 
                  ${!props.hasAllowed || !text.trim() || isLoading
                    ? "bg-[#565656] cursor-not-allowed"
                    : "bg-[#4A4B6C] hover:bg-[#5A5B7C] transform hover:scale-105"
                  }
                `}
                disabled={!props.hasAllowed || !text.trim() || isLoading}
                type="submit"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowUpHome />
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInteractionContainer;
