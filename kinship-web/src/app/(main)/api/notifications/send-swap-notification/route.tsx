import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

// Swap notification request interface
interface SwapNotificationRequest {
  receiverAddress: string;
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount?: number;
  transactionHash?: string;
  status: "completed" | "failed" | "pending";
  sender?: string;
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
      fromToken,
      toToken,
      fromAmount,
      toAmount,
      transactionHash,
      status = "completed",
      sender = "system",
    }: SwapNotificationRequest = await req.json();

    // Validate required fields
    if (!receiverAddress || !fromToken || !toToken || !fromAmount) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: userId, fromToken, toToken, and fromAmount",
        },
        { status: 400 }
      );
    }

    // Validate amount is positive
    if (fromAmount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ["completed", "failed", "pending"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be completed, failed, or pending" },
        { status: 400 }
      );
    }

    // Generate appropriate message
    const message = generateSwapMessage({
      fromToken,
      toToken,
      fromAmount,
      toAmount,
      status,
    });

    // Prepare notification parameters
    const notificationParams: NotificationParams = {
      type: "swap_notification",
      message,
      unread: 1,
      sender,
      receiver: receiverAddress,
      created_date: new Date(),
    };

    // Send notification
    await sendNotification(notificationParams);

    return NextResponse.json(
      {
        success: true,
        message: "Swap notification sent successfully",
        notification: {
          receiver: receiverAddress,
          message,
          type: "swap_notification",
          status,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send swap notification" },
      { status: 500 }
    );
  }
}

/**
 * Generate appropriate notification message based on swap details and status
 */
const generateSwapMessage = (params: {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount?: number;
  status: string;
}): string => {
  const { fromToken, toToken, fromAmount, toAmount, status } = params;

  // Format amount with appropriate decimals
  const formattedFromAmount = formatAmount(fromAmount);
  const formattedToAmount = toAmount ? formatAmount(toAmount) : null;

  switch (status) {
    case "completed":
      if (formattedToAmount) {
        return `Swap completed! ${formattedFromAmount} ${fromToken} has been exchanged to ${formattedToAmount} ${toToken}.`;
      }
      return `Swap completed! ${formattedFromAmount} ${fromToken} has been exchanged to ${toToken}.`;

    case "pending":
      return `Swap pending: ${formattedFromAmount} ${fromToken} to ${toToken}.`;

    case "failed":
      return `Swap failed: ${formattedFromAmount} ${fromToken} to ${toToken}. Please try again.`;

    default:
      return `Swap ${status}: ${formattedFromAmount} ${fromToken} to ${toToken}.`;
  }
};

/**
 * Format amount to appropriate decimal places
 */
const formatAmount = (amount: number): string => {
  // If amount is very small, show more decimals
  if (amount < 0.01) {
    return amount.toFixed(6);
  }
  // If amount is small, show 4 decimals
  if (amount < 1) {
    return amount.toFixed(4);
  }
  // Otherwise show 2 decimals
  return amount.toFixed(2);
};

/**
 * Send notification to user
 * For swap notifications, we allow multiple notifications (don't prevent duplicates)
 * since users may perform multiple swaps
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
