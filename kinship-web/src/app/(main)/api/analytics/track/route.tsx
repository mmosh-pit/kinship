import { clickhouse } from "@/app/(main)/lib/clickhouse";
import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  try {
    const {
      event_id,
      timestamp,
      session_id,
      user_id,
      page_url,
      page_title,
      referrer,
      domain,
      traffic_source,
      traffic_medium,
      traffic_campaign,
      user_agent,
      device_type,
      browser,
      os,
      country,
      region,
      city,
      ip,
      is_new_session,
      event_type,
      pageViewCount,
      bot_referrer_url,
      bot_referring_domain,
    } = await req.json();
    // await dropTable("traffic_events");
    await createTable();
    if (is_new_session) {
      const nextId = await getNextId("traffic_events");
      const result = await clickhouse.insert({
        table: "traffic_events",
        values: [
          {
            id: nextId,
            event_id: event_id,
            session_id: session_id,
            user_id: user_id,
            page_url: page_url,
            page_title: page_title,
            page_view: pageViewCount,
            referrer: referrer,
            domain: domain,
            traffic_source: traffic_source,
            traffic_medium: traffic_medium,
            traffic_campaign: traffic_campaign,
            bot_referrer_url: bot_referrer_url,
            bot_referring_domain: bot_referring_domain,
            user_agent: user_agent,
            device_type: device_type,
            browser: browser,
            os: os,
            ip_address: ip,
            country: country,
            region: region,
            city: city,
            is_new_session: is_new_session,
            event_type: event_type,
          },
        ],
        format: "JSONEachRow",
      });
    } else {
      const result = await clickhouse.command({
        query: `
                    ALTER TABLE traffic_events 
                    UPDATE page_view = ${pageViewCount}
                    WHERE session_id = '${session_id}'
                `,
      });
    }
    return NextResponse.json("", { status: 200 });
  } catch (error) {
    return NextResponse.json("", { status: 500 });
  }
}

const createTable = async () => {
  const result = await clickhouse.command({
    query: `
        CREATE TABLE IF NOT EXISTS traffic_events (
            id UInt64,
            event_id String,
            timestamp DateTime DEFAULT now(),
            session_id String,
            user_id Nullable(String),
            page_url String,
            page_title String,
            page_view UInt64,
            referrer Nullable(String),
            domain String,
            traffic_source String,
            traffic_medium String,
            traffic_campaign Nullable(String),
            bot_referrer_url Nullable(String),
            bot_referring_domain Nullable(String),
            user_agent String,
            device_type String,
            browser String,
            os String,
            ip_address String,
            country String,
            region String,
            city String,
            is_new_session UInt8,
            event_type String
        ) ENGINE = MergeTree()
        ORDER BY (timestamp)
        TTL timestamp + INTERVAL 2 YEAR
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

const dropTable = async (tableName: string) => {
  await clickhouse.command({
    query: `DROP TABLE IF EXISTS \`${tableName}\``,
  });
};
