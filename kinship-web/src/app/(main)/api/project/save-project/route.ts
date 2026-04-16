import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export const OPTIONS = async () => Response.json(null, { status: 200 });

export async function POST(req: NextRequest) {
  const collection = db.collection("bots");

  const token = req.headers.get("Authorization");

  if (!token) return NextResponse.json("", { status: 401 });

  const {
    name,
    symbol,
    desc,
    image,
    key,
    lut,
    seniority,
    telegram,
    twitter,
    website,
    presalesupply,
    minpresalesupply,
    presalestartdate,
    presaleenddate,
    dexlistingdate,
    price,
    distribution,
    invitationprice,
    discount,
    creator,
    creatorUsername,
    type,
  } = await req.json();

  const project = await collection.findOne({
    key: key,
  });

  if (!project) {
    const res = await collection.insertOne({
      name,
      symbol,
      desc,
      image,
      key,
      lut,
      seniority,
      price,
      distribution,
      invitationprice,
      discount,
      telegram,
      twitter,
      website,
      presalesupply,
      minpresalesupply,
      presalestartdate,
      presaleenddate,
      dexlistingdate,
      creator,
      creatorUsername,
      created_date: new Date(),
      updated_date: new Date(),
      type,
    });

    await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/agents/activate`, {
      method: "POST",
      body: JSON.stringify({
        agent_id: res.insertedId.toString(),
      }),
      headers: {
        Authorization: token,
      },
    });

    return NextResponse.json("", { status: 200 });
  } else {
    return NextResponse.json("", { status: 200 });
  }
}
