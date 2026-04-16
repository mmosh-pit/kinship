// telegram-group.ts

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl";

const apiId = Number(process.env.TG_API_ID);
const apiHash: string = process.env.TG_API_HASH || "";
const session = new StringSession(process.env.TG_SESSION || "");

export async function createGroupWithBot(groupName: string, ownerHandle: string) {
    try {
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";

        if (!botUsername) throw new Error("Bot username missing!");

        const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

        await client.connect();

        console.log(`🚀 Creating Supergroup: ${groupName}`);

        // Create a SUPERGROUP (channels in Telegram API)
        const created: any = await client.invoke(
            new Api.channels.CreateChannel({
                title: groupName,
                about: `Auto-created group by ${ownerHandle}`,
                megagroup: true, // <-- supergroup flag
            })
        );

        const chatId = created.chats[0].id;

        console.log("🆔 Supergroup ID:", chatId, JSON.stringify(created, null, 2));

        // Fetch group and bot as valid Telegram input entities
        const groupEntity = await client.getInputEntity(chatId);
        const botEntity = await client.getInputEntity(botUsername);
        const ownerEntity = await client.getInputEntity(ownerHandle);

        // Add bot to the group
        console.log("➕ Adding bot to group...");
        await client.invoke(
            new Api.channels.InviteToChannel({
                channel: groupEntity,
                users: [botEntity,ownerEntity],
            })
        );

        // Promote bot to admin with full rights
        console.log("🔧 Promoting bot to admin...");
        await client.invoke(
            new Api.channels.EditAdmin({
                channel: groupEntity,
                userId: botEntity,
                adminRights: new Api.ChatAdminRights({
                    changeInfo: true,
                    postMessages: true,
                    editMessages: true,
                    deleteMessages: true,
                    banUsers: true,
                    inviteUsers: true,
                    pinMessages: true,
                    addAdmins: false,
                    manageCall: true,
                    other: true,
                }),
                rank: "Bot Admin",
            })
        );

        // Generate invite link
        console.log("🔗 Generating invite link...");
        const invite: any = await client.invoke(
            new Api.messages.ExportChatInvite({
                peer: groupEntity,
            })
        );

        console.log("🎉 Group successfully created!");

        client.disconnect();

        return {
            status: "success",
            group_name: groupName,
            group_id: chatId.value,
            invite_link: invite.link,
        };
    } catch (error) {
        console.error("❌ Error creating Telegram supergroup:", error);
        // throw error;
        return {
            status: "error",
            message: (error as Error).message,
        }
    }
}
