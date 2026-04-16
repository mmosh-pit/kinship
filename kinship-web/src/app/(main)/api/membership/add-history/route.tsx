import { clickhouse } from "@/app/(main)/lib/clickhouse";
import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-user-membership-history");

  const { wallet, membership, membershiptype, price, expirydate } =
    await req.json();

  const membershipData = await collection.findOne(
    { wallet },
    {
      sort: { created_date: -1 },
    }
  );

  let guestToEnjoyer = 0;
  let guestToCreator = 0;
  let enjoyerToCreator = 0;
  let creatorToEnjoyer = 0;
  let churn = 0;
  let prev = "guest";
  let isUpgrade = true;
  if (!membershipData) {
    // guest
    if (membership === "enjoyer") {
      guestToEnjoyer = 1;
    } else if (membership === "creator") {
      guestToCreator = 1;
    }
  } else {
    prev = membershipData.membership;
    const next = membership;
    if (prev === "enjoyer" && next === "creator") {
      enjoyerToCreator = 1;
    } else if (prev === "creator" && next === "enjoyer") {
      creatorToEnjoyer = 1;
      isUpgrade = false;
    }
  }
  // await dropTable("mmosh_app_tier_management");
  await createTable();
  await createTierManagementTable();
  const nextId = await getNextId("mmosh_app_tier_management_history");
  const query = `
    SELECT *
    FROM mmosh_app_tier_management
    ORDER BY updated_date DESC
    LIMIT 1
  `;

  const result = await clickhouse.query({
    query,
    format: "JSONEachRow",
  });
  const rows = await result.json();
  if (rows.length > 0) {
    const row: any = rows[0];
    await clickhouse.insert({
      table: "mmosh_app_tier_management",
      values: [
        {
          id: 1,
          guestToEnjoyer: Number(row.guestToEnjoyer) + guestToEnjoyer,
          guestToCreator: Number(row.guestToCreator) + guestToCreator,
          enjoyerToCreator: Number(row.enjoyerToCreator) + enjoyerToCreator,
          creatorToEnjoyer: Number(row.creatorToEnjoyer) + creatorToEnjoyer,
          churn: Number(row.churn) + churn,
        },
      ],
      format: "JSONEachRow",
    });
  } else {
    await clickhouse.insert({
      table: "mmosh_app_tier_management",
      values: [
        {
          id: 1,
          guestToEnjoyer,
          guestToCreator,
          enjoyerToCreator,
          creatorToEnjoyer,
          churn,
        },
      ],
      format: "JSONEachRow",
    });
  }

  await clickhouse.insert({
    table: "mmosh_app_tier_management_history",
    values: [
      {
        id: nextId,
        wallet: wallet,
        previousTier: prev,
        currentTier: membership,
        changeType: isUpgrade ? "upgrade" : "downgrade",
      },
    ],
    format: "JSONEachRow",
  });

  await collection.insertOne({
    wallet,
    membership,
    membershiptype,
    price,
    expirydate,
    created_date: new Date(),
    updated_date: new Date(),
  });
  return NextResponse.json("test", { status: 200 });
}

const dropTable = async (tableName: string) => {
    await clickhouse.command({
        query: `DROP TABLE IF EXISTS \`${tableName}\``
    });
}

const createTable = async () => {
  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS mmosh_app_tier_management_history
      (
          id UInt64,
          wallet String,
          previousTier String,
          currentTier String,
          changeType String,
          created_at DateTime DEFAULT now(),
          updated_date DateTime DEFAULT now()
      )
      ENGINE = MergeTree()
      ORDER BY id
    `,
  });
};

const createTierManagementTable = async () => {
  await clickhouse.command({
    query: `
      CREATE TABLE IF NOT EXISTS mmosh_app_tier_management
      (
          id UInt64,
          guestToEnjoyer UInt64,
          guestToCreator UInt64,
          enjoyerToCreator UInt64,
          creatorToEnjoyer UInt64,
          churn UInt64,
          created_at DateTime DEFAULT now(),
          updated_date DateTime DEFAULT now()
      )
      ENGINE = MergeTree()
      ORDER BY id
    `,
  });
};

const getNextId = async (tableName: string): Promise<number> => {
  const query = `SELECT max(id) FROM default.\`${tableName}\``;
  const result: any = await clickhouse
    .query({ query })
    .then((res) => res.json());
  const maxIdStr = result.data[0]["max(id)"];
  const maxId = parseInt(maxIdStr, 10);
  return isNaN(maxId) ? 1 : maxId + 1;
};
