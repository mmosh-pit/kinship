import React from "react";
import { useAtom } from "jotai";
import { Bars } from "react-loader-spinner";

import { chatsStore, selectedChatStore, chatsLoading } from "@/app/(main)/store/chat";
import { data } from "@/app/(main)/store";
import KinshipIcon from "@/assets/icons/KinshipIcon";
import client from "@/app/(main)/lib/httpClient";
import moment from "moment";
import PersonalIcon from "@/assets/icons/PersonalIcon";
import Avatar from "../common/Avatar";

const ChatAgentSelector = (props: any) => {
  const [currentUser] = useAtom(data);
  const [chats, setChats] = useAtom(chatsStore);
  const [selectedChat, setSelectedChat] = useAtom(selectedChatStore);
  const [areChatsLoading, setAreChatsLoading] = useAtom(chatsLoading);

  const getChats = async (keyword: any) => {
    try {
      setAreChatsLoading(true);
      let url = "/chats/active";

      if (keyword.length > 0) {
        url = url + "&&searchText=" + keyword;
      }

      const listResult = await client.get(url);

      //console.log("Chats from /chats/active endpoint:", listResult.data.data);

      let defaultChat;

      const otherChats = [];

      for (const chat of listResult.data.data) {
        //console.log("Processing chat:", chat);
        //console.log("Chat agent system_prompt:", chat?.chatAgent?.system_prompt);

        if (chat?.chatAgent.symbol === "KIN") {
          defaultChat = chat;
          continue;
        }

        otherChats.push(chat);
      }

      otherChats.sort((a, b) => {
        if (
          new Date(a.lastMessage?.created_at) <
          new Date(b.lastMessage?.created_at)
        ) {
          return 1;
        }

        if (
          new Date(b.lastMessage?.created_at) <
          new Date(a.lastMessage?.created_at)
        ) {
          return -1;
        }

        return 0;
      });

      if (defaultChat) {
        setChats([defaultChat, ...otherChats]);
        setSelectedChat(defaultChat);
      } else {
        setChats(otherChats);
      }
      setAreChatsLoading(false);
    } catch (error) {
      setAreChatsLoading(false);
      setChats([]);
    }
  };

  React.useEffect(() => {
    getChats("");
  }, [currentUser]);

  return (
        <div className="flex flex-col w-[25%] bg-[#181747]  h-[40rem] backdrop-filter backdrop-blur-[6px] border-r border-[#FFFFFF1A]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#FFFFFF1A]">
        <h2 className="text-lg font-semibold text-white">Chats</h2>
        <p className="text-sm text-gray-400">Your active conversations</p>
      </div>

      {areChatsLoading || props.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Bars
              height="40"
              width="40"
              color="rgba(255, 0, 199, 1)"
              ariaLabel="bars-loading"
              wrapperStyle={{}}
              wrapperClass="bars-loading"
              visible={areChatsLoading}
            />
            <p className="text-sm text-gray-400">Loading chats...</p>
          </div>
        </div>
      ) : chats.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <div className="text-4xl">💬</div>
            <p className="text-sm text-gray-400">No active chats</p>
            <p className="text-xs text-gray-500">Start by creating an agent</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat, index) => (
            <div
              className={`
                flex items-center p-4 cursor-pointer transition-all duration-200 border-b border-[#FFFFFF05] last:border-b-0
                ${selectedChat?.id === chat.id
                  ? "bg-[#25235a] border-r-4 border-r-[#4A4B6C] shadow-lg"
                  : "hover:bg-[#00073a] hover:shadow-md"
                }
              `}
              onClick={() => setSelectedChat(chat)}
              key={chat.id}
            >
              <Avatar
                src={chat.chatAgent?.image}
                alt={chat.chatAgent?.name}
                size={48}
                className="mr-3 flex-shrink-0"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {chat.chatAgent?.name}
                  </p>
                  {chat.chatAgent?.type === "personal" ? (
                    <PersonalIcon />
                  ) : (
                    <KinshipIcon />
                  )}
                </div>

                <p className="text-xs text-gray-400 mb-1">
                  @{chat.chatAgent?.symbol}
                </p>

                {chat.lastMessage?.id && (
                  <p className="text-xs text-gray-500 truncate leading-relaxed">
                    {chat.lastMessage.content.length > 50
                      ? `${chat.lastMessage.content.substring(0, 50)}...`
                      : chat.lastMessage.content}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end space-y-1 ml-2">
                {chat.lastMessage?.id && (
                  <p className="text-xs text-gray-500">
                    {moment(chat.lastMessage?.created_at).format("HH:mm")}
                  </p>
                )}
                {selectedChat?.id === chat.id && (
                  <div className="w-2 h-2 bg-[#4A4B6C] rounded-full shadow-sm"></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatAgentSelector;
