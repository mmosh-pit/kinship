import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

interface NotificationParams {
  type: string;
  message: string;
  unread: number;
  sender: string;
  receiver: string;
  created_date: Date;
}

interface TransactionRequest {
  amount: number;
  currency: string;
  senderAddress: string;
  receiverAddress: string;
  transactionHash?: string;
}

export async function POST(req: NextRequest) {
  try {
    const {
      amount,
      currency,
      senderAddress,
      receiverAddress,
      transactionHash,
    } = (await req.json()) as TransactionRequest;

    // Validate required fields
    if (!amount || !currency || !senderAddress || !receiverAddress) {
      return NextResponse.json(
        {
          error: "Missing required fields: amount, currency, sender, receiver",
        },
        { status: 400 },
      );
    }

    const senderName: string = await getSenderName(senderAddress);

    // Create notification message
    const message = `You've received ${amount} ${currency} from ${senderName || senderAddress}`;

    // Prepare notification params
    const notificationParams: NotificationParams = {
      type: "transaction_received",
      message: message,
      unread: 1,
      sender: senderAddress,
      receiver: receiverAddress,
      created_date: new Date(),
    };

    // Send notification
    await sendNotification(notificationParams);

    return NextResponse.json(
      {
        success: true,
        message: "Notification sent successfully",
        notification: notificationParams,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error creating notification:", error);
    return NextResponse.json(
      { error: "Failed to create notification" },
      { status: 500 },
    );
  }
}

const sendNotification = async (params: NotificationParams) => {
  const notification = db.collection("mmosh-app-notifications");
  const notificationDetail = await notification.findOne({
    receiver: params.receiver,
    type: params.type,
  });

  if (!notificationDetail || true) {
    await notification.insertOne(params);
  }
};

const getSenderName = async (senderWallet: string) => {
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
