import { db } from "@/app/(main)/lib/mongoClient";
import { AtpAgent } from "@atproto/api";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

// Helper function to validate LinkedIn credentials
async function validateLinkedInCredentials(handle: string, password: string): Promise<boolean> {
  try {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(handle)) {
      console.log("Invalid email format for LinkedIn handle:", handle);
      return false;
    }

    // Basic password validation
    if (!password || password.length < 6) {
      console.log("Password too short for LinkedIn (minimum 6 characters)");
      return false;
    }

    // Password strength validation
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      console.log("Password doesn't meet LinkedIn security requirements (needs uppercase, lowercase, and numbers)");
      return false;
    }

    // Domain validation (optional - just log warnings)
    const domain = handle.split('@')[1]?.toLowerCase();
    const commonLinkedInDomains = [
      'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'linkedin.com',
      'live.com', 'icloud.com', 'protonmail.com', 'aol.com', 'mail.com'
    ];

    if (domain && !commonLinkedInDomains.includes(domain)) {
      console.log("Email domain not commonly associated with LinkedIn:", domain);
      // Don't reject, just log - many valid LinkedIn accounts use custom domains
    }

    console.log("LinkedIn credential validation passed for:", handle);
    return true;

  } catch (error) {
    console.error("LinkedIn validation error:", error);
    return false;
  }
}

// Helper function to validate Telegram credentials
async function validateTelegramCredentials(botToken: string, handle: string): Promise<boolean> {
  try {
    // Basic bot token validation (format: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)
    if (!botToken || botToken.length < 10) {
      console.log("Telegram bot token too short");
      return false;
    }
    const botTokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
    if (!botTokenRegex.test(botToken)) {
      console.log("Invalid Telegram bot token format:", botToken);
      return false;
    }

    // Group name validation
    if (!handle || handle.trim().length < 1) {
      console.log("Bot name cannot be empty");
      return false;
    }

    if (handle.length > 128) {
      console.log("Bot name exceeds maximum length of 128 characters");
      return false;
    }

    // Verify bot token by calling Telegram API
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    
    if (!response.ok) {
      console.log("Invalid Telegram bot token - API call failed");
      return false;
    }

    const result = await response.json();

    console.log(JSON.stringify(result, null, 2));
    
    if (!result.ok) {
      console.log("Telegram API error:", result.description);
      return false;
    }

    if (result.result.username != handle) {
      console.log(`Telegram bot username mismatch: expected ${handle}, got ${result.result.username}`);
      return false;
    }

    console.log("Telegram bot validated successfully:", result.result.username);
    return true;

  } catch (error) {
    console.error("Telegram validation error:", error);
    return false;
  }
}

// Helper function to create a Telegram group
async function createTelegramGroup(botToken: string, groupName: string, memberIds?: string[]): Promise<{ success: boolean; groupId?: string; error?: string }> {
  try {
    // Create supergroup via bot
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createChatSubscriptionChannel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: groupName,
        description: `Group created via MMOSH App - ${new Date().toISOString()}`,
      }),
    });

    console.log(response);

    if (!response.ok) {
      console.log("Failed to create Telegram group");
      return { success: false, error: "Failed to create group" };
    }

    const result = await response.json();

    if (!result.ok) {
      console.log("Telegram API error:", result.description);
      return { success: false, error: result.description };
    }

    const groupId = result.result.id;
    console.log("Telegram group created successfully with ID:", groupId);

    // Optionally add members if provided
    if (memberIds && memberIds.length > 0) {
      for (const userId of memberIds) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/addChatMember`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: groupId,
              user_id: userId,
            }),
          });
        } catch (err) {
          console.error(`Failed to add member ${userId}:`, err);
        }
      }
    }

    return { success: true, groupId };

  } catch (error) {
    console.error("Telegram group creation error:", error);
    return { success: false, error: String(error) };
  }
}

const agent = new AtpAgent({
  service: "https://bsky.social/xrpc/com.atproto.server.createSession",
});



export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-tools");

  const data = await req.json();

  if (data.type === "bsky") {
    const existing = await collection.findOne({
      "data.handle": data.data.handle,
    });

    if (existing !== null) {
      return NextResponse.json("bsky-exists", { status: 400 });
    }

    try {
      const res = await agent.login({
        identifier: data.data.handle,
        password: data.data.password,
      });

      if (!res.success) {
        return NextResponse.json("invalid-bsky", { status: 400 });
      }
    } catch (err) {
      console.log("Got err bsky: ", err);
      return NextResponse.json("invalid-bsky", { status: 400 });
    }
  }

  if (data.type === "linkedin") {
    const existing = await collection.findOne({
      "data.handle": data.data.handle,
    });

    if (existing !== null) {
      return NextResponse.json("linkedin-exists", { status: 400 });
    }

    try {
      // Validate LinkedIn credentials (email and password)
      const isValid = await validateLinkedInCredentials(data.data.handle, data.data.password);

      if (!isValid) {
        return NextResponse.json("invalid-linkedin", { status: 400 });
      }

      console.log("LinkedIn credentials validated successfully:", data.data.handle);
    } catch (err) {
      console.log("Got err linkedin: ", err);
      return NextResponse.json("invalid-linkedin", { status: 400 });
    }
  }

  let botToken = process.env.NEXT_PUBLIC_BOT_TOKEN;
  if (data.type === "telegram") {
    // Validate bot token exists
    // if (!botToken) {
    //   console.log("Telegram bot token not configured in environment variables");
    //   return NextResponse.json("telegram-bot-token-not-configured", { status: 500 });
    // }

    const existing = await collection.findOne({
      // "data.handle": data.data.handle,
      "project": data.project,
      "type": "telegram",
    });

    // if (existing !== null) {
    //   return NextResponse.json("telegram-exists", { status: 400 });
    // }

    try {
      // Validate Telegram bot token and group name
      const isValid = await validateTelegramCredentials(data.data.botToken, data.data.handle);

      if (!isValid) {
        return NextResponse.json("invalid-telegram", { status: 400 });
      }

      console.log(data.data, "Data.daataa")

      let docId;

      if (existing) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { data: data.data, updatedAt: new Date().toISOString() } }
        );
        docId = existing._id;
        //  return NextResponse.json("update successfully", { status: 200 });
      } else {
        // Save data to database only after successful validation
        const insData = await collection.insertOne(data);
        docId = insData.insertedId;

        // return NextResponse.json("created successfully", { status: 200 });
      }

      await axios.post(`${process.env.NODE_BOT_PUBLIC_URL}/register-bot`, {
        id: docId,
        token: data.data.botToken,
      }, {
        headers: {
          "Content-Type": "application/json",
        }
      })

      return NextResponse.json("Bot registered successfully", { status: 200 });

    } catch (err) {
      console.log("Got err telegram: ", err);
      return NextResponse.json("invalid-telegram", { status: 400 });
    }
  }

  if (data.type === "telegram_group") {
    // Validate bot token exists
    // if (!botToken) {
    //   console.log("Telegram bot token not configured in environment variables");
    //   return NextResponse.json("telegram-bot-token-not-configured", { status: 500 });
    // }

    const existing = await collection.findOne({
      // "data.handle": data.data.handle,
      "project": data.project,
      "type": "telegram",
    });

    if (!existing) {
      return NextResponse.json("Please save telegram bot first", { status: 400 });
    }

    try {

      console.log(data.data.groups, "Data.groups")

      if (existing) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { 'groups': data.data.groups, updatedAt: new Date().toISOString() } }
        );
        return NextResponse.json("update successfully", { status: 200 });
      }

    } catch (err) {
      console.log("Got err telegram: ", err);
      return NextResponse.json("invalid-telegram", { status: 400 });
    }
  }

  // Save data to database only after successful validation
  await collection.insertOne(data);

  return NextResponse.json("created successfully", { status: 200 });
}
