import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

// Membership types
enum MembershipType {
  GUEST = "guest",
  ENJOYER = "enjoyer",
  CREATOR = "creator",
}

// Notification request interface
interface MembershipNotificationRequest {
  receiverAddress: string;
  newMembership: MembershipType;
  previousMembership?: MembershipType;
}

// Notification document interface
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
    // Parse request body
    const {
      receiverAddress,
      newMembership,
      previousMembership,
    }: MembershipNotificationRequest = await req.json();

    // Validate required fields
    if (!receiverAddress || !newMembership) {
      return NextResponse.json(
        { error: "Missing required fields: userId and newMembership" },
        { status: 400 }
      );
    }

    // Validate membership type
    if (!Object.values(MembershipType).includes(newMembership)) {
      return NextResponse.json(
        {
          error: "Invalid membership type. Must be Guest, Creator, or Enjoyer",
        },
        { status: 400 }
      );
    }

    // Determine if it's an upgrade or downgrade
    const action = determineAction(previousMembership, newMembership);

    // Generate appropriate message
    const message = generateMessage(newMembership, action);

    // Prepare notification parameters
    const notificationParams: NotificationParams = {
      type: "membership_change",
      message,
      unread: 1,
      sender: "",
      receiver: receiverAddress,
      created_date: new Date(),
    };

    // Send notification
    await sendNotification(notificationParams);

    return NextResponse.json(
      {
        success: true,
        message: "Notification sent successfully",
        notification: {
          receiver: receiverAddress,
          message,
          type: "membership_change",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error sending membership notification:", error);
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}

/**
 * Determine if the membership change is an upgrade, downgrade, or initial purchase
 */
const determineAction = (
  previousMembership: MembershipType | undefined,
  newMembership: MembershipType
): "upgrade" | "downgrade" | "purchase" => {
  if (!previousMembership || previousMembership === MembershipType.GUEST) {
    return "purchase";
  }

  const hierarchy = {
    [MembershipType.GUEST]: 0,
    [MembershipType.ENJOYER]: 1,
    [MembershipType.CREATOR]: 2,
  };

  const prevLevel = hierarchy[previousMembership];
  const newLevel = hierarchy[newMembership];

  if (newLevel > prevLevel) return "upgrade";
  if (newLevel < prevLevel) return "downgrade";
  return "purchase";
};

/**
 * Generate appropriate notification message based on membership type and action
 */
const generateMessage = (
  membership: MembershipType,
  action: "upgrade" | "downgrade" | "purchase"
): string => {
  const messages: any = {
    upgrade: {
      [MembershipType.CREATOR]:
        "Congratulations! Your membership has been upgraded to Creator",
      [MembershipType.ENJOYER]:
        "Congratulations! Your membership has been upgraded to Enjoyer",
    },
    purchase: {
      [MembershipType.CREATOR]:
        "Congratulations! You've purchased the Creator membership",
      [MembershipType.ENJOYER]:
        "Congratulations! You've purchased the Enjoyer membership",
      [MembershipType.GUEST]: "Welcome! You're now a Guest member",
    },
    downgrade: {
      [MembershipType.GUEST]: "Your membership has been downgraded to Guest",
      [MembershipType.ENJOYER]: "Your membership has been downgraded to Creator",
    },
  };

  return (
    messages[action][membership] ||
    `Your membership has been updated to ${membership}`
  );
};

// const sendNotification = async (params: NotificationParams) => {
//   const collection = db.collection("mmosh-app-notifications");
//   // Check if a similar unread notification already exists
//   const existingNotification = await collection.findOne({
//     receiver: params.receiver,
//     type: params.type,
//     unread: 1,
//   });

//   // If no existing unread notification, insert new one
//   if (!existingNotification) {
//     await collection.insertOne(params);
//   } else {
//     // Optionally update the existing notification with new message
//     await collection.updateOne(
//       { _id: existingNotification._id },
//       {
//         $set: {
//           message: params.message,
//           created_date: params.created_date,
//         },
//       }
//     );
//   }
// };

/**
 * Send notification to user (prevents duplicate notifications)
 */
const sendNotification = async (params: NotificationParams) => {
  const notification = db.collection("mmosh-app-notifications");
  const notificationDetail = await notification.findOne({
    receiver: params.receiver,
    type: params.type,
    unread: 1,
  });

  if (!notificationDetail || true) {
    await notification.insertOne(params);
  }
};