import { Chat } from "@/app/(main)/models/chat";
import { atom } from "jotai";

export const chatsStore = atom<Chat[]>([]);

export const selectedChatStore = atom<Chat | null>(null);

export const chatsLoading = atom<boolean>(true);
