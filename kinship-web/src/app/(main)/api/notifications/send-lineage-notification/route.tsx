import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

// Notification types
type NotificationType =
  | "referral_signup_guest"
  | "referral_signup_member"
  | "lineage_became_member"
  | "lineage_membership_change";

// Request payload interface
interface NotificationRequest {
  action: "signup" | "became_member" | "membership_change";
  referredUserAddress: string; // Wallet address of the user who triggered the action
  referrerId?: string;
  lineage?: string[]; // Array of user IDs in the lineage
  membershipType: "guest" | "member" | "premium" | "vip";
}

// Notification params interface (matches your sendNotification function)
interface NotificationParams {
  type: string;
  message: string;
  unread: number;
  sender: string;
  receiver: string;
  created_date: Date;
}

export async function POST(req: NextRequest) {
  try {
    const {
      action,
      referredUserAddress,
      referrerId,
      lineage = [],
      membershipType,
    }: NotificationRequest = await req.json();

    // Validate required fields
    if (!action || !referredUserAddress || !membershipType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the username from the wallet address
    const userName = await getSenderName(referredUserAddress);

    const notifications: NotificationParams[] = [];
    const notifiedUsers: string[] = [];

    switch (action) {
      case "signup":
        // Notify referrer when someone signs up using their code
        if (referrerId) {
          const type: NotificationType =
            membershipType === "guest"
              ? "referral_signup_guest"
              : "referral_signup_member";

          const message =
            membershipType === "guest"
              ? `${userName} just signed up as a guest using your referral code! Welcome them to the community.`
              : `${userName} just signed up as a member using your referral code! Your network is growing.`;

          notifications.push({
            type,
            message,
            unread: 1,
            sender: referredUserAddress,
            receiver: referrerId,
            created_date: new Date(),
          });
        }
        break;

      case "became_member":
        // Notify referrer and lineage when someone becomes a member
        if (referrerId) {
          notifications.push({
            type: "lineage_became_member",
            message: `${userName} just became a ${membershipType} member using your referral code! Your network is expanding.`,
            unread: 1,
            sender: referredUserAddress,
            receiver: referrerId,
            created_date: new Date(),
          });
        }

        // Notify everyone in the lineage
        lineage.forEach((lineageMemberId) => {
          if (
            lineageMemberId !== referredUserAddress &&
            lineageMemberId !== referrerId &&
            !notifiedUsers.includes(lineageMemberId)
          ) {
            notifiedUsers.push(lineageMemberId);
            notifications.push({
              type: "lineage_became_member",
              message: `${userName} in your lineage just became a ${membershipType} member! Your network is growing.`,
              unread: 1,
              sender: referredUserAddress,
              receiver: lineageMemberId,
              created_date: new Date(),
            });
          }
        });
        break;

      case "membership_change":
        // Notify lineage when someone changes their membership
        lineage.forEach((lineageMemberId) => {
          if (lineageMemberId !== referredUserAddress && !notifiedUsers.includes(lineageMemberId)) {
            notifiedUsers.push(lineageMemberId);
            notifications.push({
              type: "lineage_membership_change",
              message: `${userName} in your lineage changed their membership to ${membershipType}! Your network is strengthening.`,
              unread: 1,
              sender: referredUserAddress,
              receiver: lineageMemberId,
              created_date: new Date(),
            });
          }
        });
        break;

      default:
        return NextResponse.json(
          { error: "Invalid action type" },
          { status: 400 }
        );
    }

    const results = await sendNotification(notifications);
    // Send all notifications
    // const results = await Promise.all(
    //   notifications.map((notification) => sendNotification(notification))
    // );

    return NextResponse.json(
      {
        success: true,
        message: "Notifications sent successfully",
        notificationsSent: 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending notifications:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}

/**
 * Send notification to user
 * For referral notifications, always insert a new notification
 */
const sendNotification = async (params: NotificationParams[]) => {
  try {
    const notification = db.collection("mmosh-app-notifications");
    const result = await notification.insertMany(params);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get sender name from wallet address
 * Returns username from guest_data or name field
 */
const getSenderName = async (senderWallet: string): Promise<string> => {
  const usersCollection = db.collection("users");
  let username = "unknown user";
  const senderDetails = await usersCollection.findOne({ wallet: senderWallet });
  if (senderDetails !== null) {
    username = senderDetails.guest_data
      ? senderDetails.guest_data.username || senderDetails.name
      : senderDetails.name;
  }
  return username;
};

// Optional: GET endpoint to fetch notifications for a user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const collection = db.collection("mmosh-app-notifications");
    const query: any = { receiver: userId };

    if (unreadOnly) {
      query.unread = 1;
    }

    const notifications = await collection
      .find(query)
      .sort({ created_date: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(
      {
        success: true,
        notifications,
        count: notifications.length,
        unreadCount: await collection.countDocuments({
          receiver: userId,
          unread: 1,
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// Optional: PATCH endpoint to mark notifications as read
export async function PATCH(req: NextRequest) {
  try {
    const { notificationIds, userId, markAllRead } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const collection = db.collection("mmosh-app-notifications");
    let result;

    if (markAllRead) {
      // Mark all notifications as read for this user
      result = await collection.updateMany(
        { receiver: userId, unread: 1 },
        { $set: { unread: 0 } }
      );
    } else if (notificationIds && Array.isArray(notificationIds)) {
      // Mark specific notifications as read
      result = await collection.updateMany(
        {
          _id: { $in: notificationIds },
          receiver: userId,
        },
        { $set: { unread: 0 } }
      );
    } else {
      return NextResponse.json(
        { error: "Either notificationIds or markAllRead must be provided" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Notifications marked as read",
        modifiedCount: result.modifiedCount,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    return NextResponse.json(
      { error: "Failed to mark notifications as read" },
      { status: 500 }
    );
  }
}
