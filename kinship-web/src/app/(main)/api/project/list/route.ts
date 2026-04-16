import { db, ObjectId } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const userId = req.headers.get("user");

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as string;
  const search = searchParams.get("searchText") as string;

  const user =
    userId != null
      ? await db.collection("users").findOne({
        _id: new ObjectId(userId),
      })
      : null;

  const username = user?.profile?.username;

  const privacyMatchFilter =
    user?.role === "wizard"
      ? {}
      : {
        $or: [
          {
            privacy: "public",
          },
          {
            privacy: {
              $exists: false,
            },
          },
          {
            $and: [
              {
                creatorUsername: username,
              },
              {
                privacy: {
                  $exists: true,
                },
              },
              {
                privacy: {
                  $ne: "secret",
                },
              },
            ],
          },
        ],
      };

  let match: any = { $match: { ...privacyMatchFilter } };

  if (search && type === "directory") {
    match = {
      $match: {
        $or: [
          { name: { $regex: new RegExp(search, "ig") } },
          { symbol: { $regex: new RegExp(search, "ig") } },
          { desc: { $regex: new RegExp(search, "ig") } },
          {
            $and: [
              {
                privacy: "secret",
              },
              {
                code: search,
              },
            ],
          },
        ],
      },
    };
  }

  if (type !== "directory") {
    const dexExpiry = new Date().toISOString();
    if (search) {
      match = {
        $match: {
          $and: [
            { dexlistingdate: { $gt: dexExpiry } },
            {
              $or: [
                {
                  privacy: "public",
                },
                {
                  privacy: {
                    $exists: false,
                  },
                },
                privacyMatchFilter,
              ],
            },
            {
              $or: [
                { name: { $regex: new RegExp(search, "ig") } },
                { symbol: { $regex: new RegExp(search, "ig") } },
                { desc: { $regex: new RegExp(search, "ig") } },
              ],
            },
          ],
        },
      };
    } else {
      match = {
        $match: { dexlistingdate: { $gt: dexExpiry } },
      };
    }
  }

  const result = await db
    .collection("bots")
    .aggregate([
      match,
      {
        $lookup: {
          from: "mmosh-app-project-coins",
          localField: "key",
          foreignField: "projectkey",
          as: "coins",
        },
      },
      {
        $lookup: {
          from: "mmosh-app-project-community",
          localField: "key",
          foreignField: "projectkey",
          as: "community",
        },
      },
      {
        $lookup: {
          from: "mmosh-app-project-profiles",
          localField: "key",
          foreignField: "projectkey",
          as: "profiles",
        },
      },
      {
        $lookup: {
          from: "mmosh-app-project-tokenomics",
          localField: "key",
          foreignField: "projectkey",
          as: "tokenomics",
        },
      },
      {
        $lookup: {
          from: "mmosh-app-project-pass",
          localField: "key",
          foreignField: "projectkey",
          as: "pass",
        },
      },
      {
        $project: {
          name: 1,
          symbol: 1,
          desc: 1,
          key: 1,
          image: 1,
          price: 1,
          presalestartdate: 1,
          presaleenddate: 1,
          dexlistingdate: 1,
          presalesupply: 1,
          minpresalesupply: 1,
          creatorUsername: 1,
          creator: 1,
          privacy: 1,
          coins: "$coins",
          community: "$community",
          profiles: "$profiles",
          tokenomics: "$tokenomics",
          pass: "$pass",
        },
      },
      { $sort: { created_date: -1 } },
    ])
    .limit(100)
    .toArray();
  return NextResponse.json(result, { status: 200 });
}
