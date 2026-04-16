import { NextRequest, NextResponse } from "next/server";
import { db } from "../../lib/mongoClient";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const skip = searchParams.get("skip");
  const searchText = searchParams.get("searchText") as string;
  const requester = searchParams.get("requester") as string;

  if (!skip) {
    return NextResponse.json("Invalid Payload", { status: 400 });
  }

  const filter: any = {
    profile: {
      $exists: true,
    },
    profilenft: {
      $exists: true,
    },
  };

  if (searchText) {
    searchText.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");

    filter["$or"] = [
      {
        "profile.username": { $regex: searchText, $options: "i" },
      },
      {
        "profile.name": { $regex: searchText, $options: "i" },
      },
    ];
  }

  const data = await db
    .collection("users")
    .find(filter, {
      projection: {
        wallet: 1,
        profile: 1,
        telegram: 1,
        twitter: 1,
        royalty: { $ifNull: ["$royalty", 0] },
        profilenft: { $ifNull: ["$profilenft", null] },
      },
      sort: { "profile.seniority": 1 },
      skip: Number(skip),
      limit: 15,
    })
    .toArray();

  if (requester) {
    const user = await db.collection("users").findOne({
      wallet: requester,
    });
    if (user) {
      if (user.profilenft) {
        for (let index = 0; index < data.length; index++) {
          data[index].profile.connection = await getConnectionStatus(
            user,
            data[index],
          );
          data[index].profile.request = await getHasRequest(user, data[index]);
        }
      }
    }
  }

  const result = {
    totalAccounts: 0,
    totalPoints: 0,
    users: data,
  };

  data.forEach((row) => {
    result.totalPoints += row.telegram?.points || 0;
  });

  result.totalAccounts = data.length;

  return NextResponse.json(result, {
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
