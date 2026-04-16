import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const collection = db.collection("users");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("username");
  const requester = searchParams.get("requester");

  const user = await collection.findOne(
    {
      $or: [
        {
          "profile.username": param,
        },

        {
          "guest_data.username": param,
        },
      ],
    },
    {
      collation: {
        locale: "en",
        strength: 2,
      },
    },
  );

  if (requester) {
    const sender = await db.collection("users").findOne({
      wallet: requester,
    });
    if (sender && user) {
        user.profile.connection = await getConnectionStatus(sender, user);
        user.profile.request = await getHasRequest(sender, user);
    }
  }

  if (user) {
    user.password = "";
  }

  return NextResponse.json(user, {
    status: 200,
  });
}

const getConnectionStatus = async (requester: any, user: any) => {
  if (requester.wallet !== user.wallet) {
    // check has linked
    const hasLinked = await db.collection("mmosh-app-connections").findOne({
      sender: requester.wallet,
      receiver: user.wallet,
      status: 2,
    });
    if (hasLinked) {
      return 4;
    }

    // check has outbound
    const hasfollowing = await db.collection("mmosh-app-connections").findOne({
      sender: requester.wallet,
      receiver: user.wallet,
      status: 1,
    });

    if (hasfollowing) {
      return 2;
    }

    // check has inbound
    const hasfollower = await db.collection("mmosh-app-connections").findOne({
      sender: user.wallet,
      receiver: requester.wallet,
      status: 1,
    });

    if (hasfollower) {
      return 3;
    }

    // check has idle connection
    const hasRequest = await db.collection("mmosh-app-connections").findOne({
      sender: requester.wallet,
      receiver: user.wallet,
      status: 0,
    });

    if (hasRequest) {
      return 1;
    }

    // check has idle connection
    const hasConnection = await db.collection("mmosh-app-connections").findOne({
      sender: requester.wallet,
      receiver: user.wallet,
      status: 3,
    });

    if (hasConnection) {
      return 5;
    }
  }
  return 0;
};

const getHasRequest = async (requester: any, user: any) => {
  if (requester.wallet !== user.wallet) {
    // check has linked
    const hasRequest = await db.collection("mmosh-app-connections").findOne({
      sender: user.wallet,
      receiver: requester.wallet,
      status: 0,
    });
    if (hasRequest) {
      return true;
    }
  }

  return false;
};
