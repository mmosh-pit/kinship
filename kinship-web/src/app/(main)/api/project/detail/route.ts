import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/mongoClient";

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const address = searchParams.get("address");

  const projectCollection = db.collection("bots");

  let projectData: any;
  if (symbol) {
    projectData = await projectCollection.findOne(
      { symbol: symbol?.toUpperCase() },
      {
        projection: {
          code: 0,
        },
      },
    );
    if (!projectData) {
      projectData = await projectCollection.findOne(
        { symbol: symbol },
        {
          projection: {
            code: 0,
          },
        },
      );
      if (!projectData) {
        return NextResponse.json(null, {
          status: 200,
        });
      }
    }
  } else {
    projectData = await projectCollection.findOne({ key: address });
  }

  const projectCoinCollection = db.collection("mmosh-app-project-coins");
  const projectOfferCollection = db.collection("mmosh-app-project-offer");
  const coins = await projectCoinCollection
    .find({ projectkey: projectData.key })
    .toArray();
  const offers = await projectOfferCollection
    .find({ project: projectData.key })
    .sort({ created_date: -1 })
    .limit(1)
    .toArray();

  const updated_date = new Date();
  const communityCoinAccount = await projectCoinCollection.findOne({
    projectkey: projectData.key,
    updated_date: { $lt: updated_date },
  });

  const projectCommunityCollection = db.collection(
    "mmosh-app-project-community",
  );
  const community = await projectCommunityCollection
    .find({ projectkey: projectData.key })
    .toArray();

  const projectProfileCollection = db.collection("mmosh-app-project-profiles");
  const profiles = await projectProfileCollection
    .aggregate([
      { $match: { projectkey: projectData.key } },
      {
        $lookup: {
          from: "users",
          localField: "profilekey",
          foreignField: "wallet",
          as: "profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "coin",
          foreignField: "key",
          as: "coins",
        },
      },
      {
        $project: {
          projectkey: 1,
          role: 1,
          key: 1,
          profiles: "$profiles",
        },
      },
    ])
    .toArray();

  const projectTokenomicsCollection = db.collection(
    "mmosh-app-project-tokenomics",
  );
  const tokenomics = await projectTokenomicsCollection
    .find({ projectkey: projectData.key })
    .toArray();

  const passCollection = db.collection("mmosh-app-project-pass");
  const passes = await passCollection
    .find({ projectkey: projectData.key })
    .toArray();

  const result = {
    coins,
    offers,
    community,
    profiles,
    tokenomics,
    project: projectData,
    passes,
  };

  return NextResponse.json(result, {
    status: 200,
  });
}
